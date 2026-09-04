import { calculatePayroll, summarisePayroll } from "./engine";
import { daysInMonthOf, roundMoney } from "./hours";
import { toEmployee, toLateTier, toPayComponent, toPayRule } from "./mappers";
import type { AttendanceDay, DayType, PayComponent, PayrollResult } from "./types";
import { createServiceClient } from "@/lib/supabase/service";

/**
 * Turns a pay period into per-employee results.
 *
 * Reads the real attendance the terminals produced, feeds it through the pure
 * engine, and writes the outcome back. Deliberately recomputes from source
 * every time rather than adjusting stored figures, so re-running after a rate
 * change or a corrected punch always lands on the same answer.
 *
 * Runs with the service key: a payroll run covers people the operator may not
 * individually be allowed to read, and the caller's permission to run it has
 * already been checked at the action boundary.
 */

export interface RunSummary {
  periodId: string;
  headcount: number;
  gross: number;
  deductions: number;
  tax: number;
  net: number;
  skipped: { name: string; reason: string }[];
  /**
   * People with at least one date the overtime ceiling dropped hours on —
   * most commonly a double-duty day. Nothing about their pay is wrong; it
   * means a human should check the listed dates before approving this run.
   */
  flagged: { name: string; hours: number; dates: string[] }[];
}

interface PeriodRow {
  id: string;
  site_id: string;
  period_start: string;
  period_end: string;
  status: string;
  locked: boolean;
}

export async function runPayrollForPeriod(periodId: string): Promise<RunSummary> {
  const supabase = createServiceClient();

  const { data: period, error: periodError } = await supabase
    .from("payroll_periods")
    .select("id, site_id, period_start, period_end, status, locked")
    .eq("id", periodId)
    .single<PeriodRow>();

  if (periodError || !period) throw new Error("Pay period not found.");
  if (period.locked) throw new Error("This period is locked and cannot be recalculated.");

  const [
    { data: staff },
    { data: rules },
    { data: components },
    { data: lateRules },
    { data: contractDepartments },
  ] = await Promise.all([
    supabase
      .from("profiles")
      .select(
        "id, employee_code, full_name, pay_class, requires_attendance, monthly_salary, hourly_rate, ot_hourly_rate, weekend_hourly_rate, holiday_hourly_rate, department_id, site_id, shift_id, worker_type, payroll_exempt, duty_hours, sunday_policy, overtime_eligible",
      )
      .eq("site_id", period.site_id)
      .eq("status", "active"),
    supabase
      .from("pay_rules")
      .select("*")
      .eq("site_id", period.site_id)
      .lte("effective_from", period.period_end)
      .order("effective_from", { ascending: false })
      .limit(1),
    supabase
      .from("pay_components")
      .select("*")
      .eq("site_id", period.site_id)
      .eq("is_active", true)
      .lte("effective_from", period.period_end)
      .order("sort_order"),
    supabase
      .from("late_penalty_rules")
      .select("*")
      // findTier() breaks a tie between two equal-width bands (both
      // open-ended, e.g. a percentage "beyond 2 hours" tier and an
      // open-ended per-minute tier) by array order. Without an explicit
      // order, Postgres is free to return rows in any order it likes, so the
      // same lateness could be charged two different ways on two different
      // runs. from_minutes then id makes the order — and therefore which
      // tier wins a tie — reproducible.
      .eq("site_id", period.site_id)
      .eq("is_active", true)
      .order("from_minutes", { ascending: true })
      .order("id", { ascending: true }),
    supabase
      .from("departments")
      .select("id, name, contract_amount")
      .eq("site_id", period.site_id)
      .eq("default_worker_type", "contractor")
      .eq("is_active", true),
  ]);

  if (!staff || staff.length === 0) {
    throw new Error("No active employees at this factory.");
  }

  const rule = toPayRule(rules?.[0]);
  const siteComponents = (components ?? []).map(toPayComponent);
  const tiers = (lateRules ?? []).map(toLateTier);

  // One query for the whole period rather than per employee.
  const { data: attendance } = await supabase
    .from("attendance_days")
    .select("profile_id, work_date, day_type, status, regular_hours, minutes_late, hours_are_final")
    .gte("work_date", period.period_start)
    .lte("work_date", period.period_end)
    .in(
      "profile_id",
      staff.map((s) => s.id),
    );

  const daysByProfile = new Map<string, AttendanceDay[]>();
  for (const row of attendance ?? []) {
    if (!row.profile_id) continue;
    const list = daysByProfile.get(row.profile_id) ?? [];
    list.push({
      workDate: row.work_date,
      dayType: (row.day_type ?? "workday") as DayType,
      hoursWorked: Number(row.regular_hours ?? 0),
      status: (row.status ?? "pending") as AttendanceDay["status"],
      minutesLate: row.minutes_late ?? 0,
      hoursAreFinal: row.hours_are_final ?? false,
    });
    daysByProfile.set(row.profile_id, list);
  }

  // Per-person allowances and deductions on top of the site-wide set.
  const { data: personalComponents } = await supabase
    .from("profile_pay_components")
    .select("*")
    .in(
      "profile_id",
      staff.map((s) => s.id),
    )
    .lte("effective_from", period.period_end);

  const extrasByProfile = new Map<string, PayComponent[]>();
  for (const row of personalComponents ?? []) {
    if (row.effective_to && row.effective_to < period.period_start) continue;
    const list = extrasByProfile.get(row.profile_id) ?? [];
    list.push({
      code: row.code,
      label: row.label,
      kind: row.kind,
      calc: "fixed",
      amount: Number(row.amount),
      percent: 0,
      sortOrder: 500,
    });
    extrasByProfile.set(row.profile_id, list);
  }

  const results: PayrollResult[] = [];
  const skipped: RunSummary["skipped"] = [];
  const flagged: RunSummary["flagged"] = [];
  const rows = [];
  /*
   * Profiles this run excludes outright — a contract firm's people (billed
   * once, below, not per person) and anyone flagged payroll_exempt. Collected
   * from the exact same condition the loop below skips on, so the delete
   * further down can never drift out of sync with what the loop actually did.
   */
  const excludedIds: string[] = [];

  /*
   * The divisor behind every daily rate in this run.
   *
   * Taken from the period rather than from anyone's attendance, so a person
   * who never clocked in is still priced against the right month — and so the
   * whole run shares one divisor rather than deriving it person by person.
   */
  const daysInMonth = daysInMonthOf(period.period_start);

  for (const person of staff) {
    /*
     * A contract firm is billed once, below. An exempt person draws nothing
     * here at all. Neither is "skipped" in the sense the summary means — that
     * list is for people who should have been paid and could not be — so
     * neither is reported there.
     */
    if (person.worker_type === "contractor" || person.payroll_exempt) {
      excludedIds.push(person.id);
      continue;
    }

    const employee = toEmployee(person);
    const days = daysByProfile.get(person.id) ?? [];

    // An hourly worker with no punches earns nothing — flag it rather than
    // silently writing a zero line that looks like a completed calculation.
    if (employee.requiresAttendance && days.length === 0) {
      skipped.push({ name: employee.fullName, reason: "No attendance recorded in this period" });
      continue;
    }

    const result = calculatePayroll({
      employee,
      rule,
      days,
      components: [...siteComponents, ...(extrasByProfile.get(person.id) ?? [])],
      latePenaltyTiers: tiers,
      daysInMonth,
    });

    results.push(result);

    if (result.flaggedHours > 0) {
      flagged.push({
        name: employee.fullName,
        hours: result.flaggedHours,
        dates: result.flaggedDays.map((d) => d.workDate),
      });
    }

    rows.push({
      period_id: period.id,
      profile_id: person.id,
      pay_class: employee.payClass,
      base_rate: result.baseRate,
      regular_hours: result.hours.regular,
      ot_hours: result.hours.overtime,
      weekend_hours: result.hours.weekend,
      holiday_hours: result.hours.holiday,
      days_present: result.daysPresent,
      days_absent: result.daysAbsent,
      days_leave: result.daysLeave,
      base_pay: result.basePay,
      ot_pay: result.otPay,
      weekend_pay: result.weekendPay,
      holiday_pay: result.holidayPay,
      allowances: result.allowances,
      gross: result.gross,
      deductions: result.deductions,
      tax: result.tax,
      net: result.net,
      breakdown: JSON.parse(JSON.stringify(result.lines)),
      flagged_hours: result.flaggedHours,
      flagged_days: JSON.parse(JSON.stringify(result.flaggedDays)),
      status: "review" as const,
    });
  }

  /*
   * The firm, not its people.
   *
   * Headcount is recorded because it is what the office checks the invoice
   * against — the amount is agreed regardless of how many people turned up.
   */
  const contractRows = [];
  let contractTotal = 0;
  let contractHeadcount = 0;
  /*
   * worker_type is a per-person field, freely editable outside of any
   * contract department, so a contractor's department is not necessarily one
   * of contractDepartments at all. Tracking who this loop actually accounted
   * for — billed or explicitly reported as zero-amount — is what lets the
   * pass below catch the ones it never touched.
   */
  const coveredContractorIds = new Set<string>();

  for (const dept of contractDepartments ?? []) {
    const people = staff.filter(
      (s) => s.department_id === dept.id && s.worker_type === "contractor",
    );
    for (const person of people) coveredContractorIds.add(person.id);
    const amount = Number(dept.contract_amount ?? 0);

    if (amount <= 0) {
      /*
       * Left at zero this firm would cost nothing and its people would produce
       * no lines — the run would simply pass over them in silence. Say so.
       */
      if (people.length > 0) {
        skipped.push({
          name: dept.name,
          reason: `${people.length} contract worker${people.length === 1 ? "" : "s"}, no contract amount set`,
        });
      }
      continue;
    }

    contractTotal = roundMoney(contractTotal + amount);
    contractHeadcount += people.length;

    contractRows.push({
      period_id: period.id,
      department_id: dept.id,
      amount,
      headcount: people.length,
      note: null,
      computed_at: new Date().toISOString(),
    });
  }

  /*
   * A contractor whose department was never a contract department at all —
   * worker_type is editable per person, independent of the department they
   * sit in — is covered by no firm's line and was never `continue`d into
   * `skipped` either, since the main loop treats every contractor as billed
   * elsewhere. Left unreported, they are paid nothing and nobody is told.
   */
  for (const person of staff) {
    if (person.worker_type !== "contractor" || coveredContractorIds.has(person.id)) continue;
    skipped.push({
      name: person.full_name,
      reason: "Marked as a contractor, but their department has no contract amount set",
    });
  }

  /*
   * Deletes rows for exactly the excluded set built above — never the merely
   * absent, whose existing rows (if any) are left untouched. Without this, a
   * person moved to contractor or flagged payroll_exempt after already having
   * a payable row keeps that stale row forever: the period's totals drop, but
   * the row still renders on the payroll screen and is still payable via
   * markItemPaid.
   */
  if (excludedIds.length > 0) {
    const { error: excludedDeleteError } = await supabase
      .from("payroll_items")
      .delete()
      .eq("period_id", period.id)
      .in("profile_id", excludedIds);
    if (excludedDeleteError) {
      throw new Error(`Could not clear excluded payroll lines: ${excludedDeleteError.message}`);
    }
  }

  if (rows.length > 0) {
    const { error } = await supabase
      .from("payroll_items")
      .upsert(rows, { onConflict: "period_id,profile_id" });
    if (error) throw new Error(`Could not save payroll lines: ${error.message}`);
  }

  if (contractRows.length > 0) {
    const { error } = await supabase
      .from("payroll_contract_items")
      .upsert(contractRows, { onConflict: "period_id,department_id" });
    if (error) throw new Error(`Could not save contract lines: ${error.message}`);
  }

  const totals = summarisePayroll(results);

  await supabase
    .from("payroll_periods")
    .update({
      status: "review",
      headcount: totals.headcount + contractHeadcount,
      total_gross: roundMoney(totals.gross + contractTotal),
      total_deductions: totals.deductions,
      total_tax: totals.tax,
      total_net: roundMoney(totals.net + contractTotal),
      calculated_at: new Date().toISOString(),
    })
    .eq("id", period.id);

  // A contract amount attracts no deduction and no tax: it is a payment to a
  // firm, not a wage with statutory withholding.
  return {
    periodId: period.id,
    headcount: totals.headcount + contractHeadcount,
    gross: roundMoney(totals.gross + contractTotal),
    deductions: totals.deductions,
    tax: totals.tax,
    net: roundMoney(totals.net + contractTotal),
    skipped,
    flagged,
  };
}
