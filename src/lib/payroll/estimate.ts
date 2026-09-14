import type { SupabaseClient } from "@supabase/supabase-js";

import { calculatePayroll } from "./engine";
import { daysBetween, daysInMonthOf } from "./hours";
import { ledgerFor, monthOf, type AdjustmentRow, type LoanRow, type RecoveryRow } from "./ledger";
import { toEmployee, toLateTier, toPayComponent, toPayRule } from "./mappers";
import type { AttendanceDay, DayType, Employee, PayComponent, PayrollResult } from "./types";
import type { Database } from "@/lib/supabase/database.types";
import { selectAllInBatches, selectInBatches } from "@/lib/supabase/in-batches";

/**
 * What someone's pay comes to for a date range, without a payroll run.
 *
 * A payroll run is the source of truth once it exists, but most of the month
 * there is no run yet — and "what will my salary be" is the question people
 * actually ask. This prices the same way `runPayrollForPeriod` does, from the
 * same engine and the same site rules, so the estimate and the eventual
 * payslip agree.
 *
 * Deliberately takes the caller's own client rather than the service one: an
 * estimate is a read, and Row Level Security is what decides whose salary the
 * asker is allowed to see. Someone without `payroll.view` or `people.view`
 * cannot read `profiles` at all, so they get nothing back rather than a number
 * they should not have.
 *
 * Every read is batched by id and paged. A single `.in()` over the factory is
 * a request line PostgREST refuses, and a refused read comes back as no rows —
 * which the engine prices as a month nobody worked. That is how the downloads
 * came to show a factory of zeros.
 */

type Client = SupabaseClient<Database>;

/** Why one person could not be priced, in words an assistant can repeat. */
export type SkipReason = "contractor" | "payroll_exempt" | "no_attendance" | "not_visible";

export interface SalaryEstimate {
  employee: Employee;
  result: PayrollResult;
}

export interface EstimateOutcome {
  estimates: SalaryEstimate[];
  skipped: { profileId: string; fullName: string; reason: SkipReason }[];
  /** True when the site has no `pay_rules` row and engine defaults were used. */
  usedDefaultRule: boolean;
}

export interface EstimateOptions {
  /**
   * Take the month's advances, suits, allowances and loan installments off,
   * the way a payroll run will. Off by default: the assistant quotes earnings.
   */
  includeLedger?: boolean;
  /**
   * Price someone who has no attendance in the range at zero instead of
   * skipping them — a register lists everybody on the books.
   */
  keepAbsent?: boolean;
}

const PROFILE_COLUMNS =
  "id, employee_code, full_name, pay_class, requires_attendance, monthly_salary, hourly_rate, ot_hourly_rate, weekend_hourly_rate, holiday_hourly_rate, department_id, site_id, shift_id, worker_type, payroll_exempt, duty_hours, sunday_policy, overtime_eligible, flexible_hours";

interface AttendanceRow {
  profile_id: string | null;
  work_date: string;
  day_type: string | null;
  status: string | null;
  regular_hours: number | string | null;
  minutes_late: number | null;
  hours_are_final: boolean | null;
}

export async function estimateSalaries(
  supabase: Client,
  profileIds: readonly string[],
  from: string,
  to: string,
  options: EstimateOptions = {},
): Promise<EstimateOutcome> {
  const empty: EstimateOutcome = { estimates: [], skipped: [], usedDefaultRule: false };
  if (profileIds.length === 0) return empty;

  const staff = await selectInBatches<
    Record<string, unknown> & { id: string; site_id: string | null }
  >(
    profileIds,
    (ids) => supabase.from("profiles").select(PROFILE_COLUMNS).in("id", ids) as never,
    "Could not read the people to price",
  );

  if (staff.length === 0) return empty;

  const siteId = staff.find((p) => p.site_id)?.site_id ?? null;
  const ids = staff.map((s) => s.id);

  const [{ data: rules }, { data: components }, { data: lateRules }, attendance, extrasByProfile] =
    await Promise.all([
      siteRuleQuery(supabase, siteId, to),
      siteComponentQuery(supabase, siteId, to),
      siteLateRuleQuery(supabase, siteId),
      selectAllInBatches<AttendanceRow>(
        ids,
        (batch, first, last) =>
          supabase
            .from("attendance_days")
            .select(
              "profile_id, work_date, day_type, status, regular_hours, minutes_late, hours_are_final",
            )
            .in("profile_id", batch)
            .gte("work_date", from)
            .lte("work_date", to)
            .order("profile_id")
            .order("work_date")
            .range(first, last),
        `Could not read attendance for ${from} to ${to}`,
      ),
      personalComponents(supabase, ids, from, to),
    ]);

  const month = monthOf(from);
  const ledger = options.includeLedger
    ? await ledgerOf(supabase, ids, month)
    : { adjustments: [], loans: [], recoveries: [] };

  const rule = toPayRule(rules?.[0]);
  const siteComponents = (components ?? []).map(toPayComponent);
  const tiers = (lateRules ?? []).map(toLateTier);

  const daysByProfile = new Map<string, AttendanceDay[]>();
  for (const row of attendance) {
    if (!row.profile_id) continue;
    const list = daysByProfile.get(row.profile_id) ?? [];
    list.push({
      workDate: row.work_date,
      dayType: (row.day_type ?? "workday") as DayType,
      hoursWorked: Number(row.regular_hours ?? 0),
      status: (row.status ?? "pending") as AttendanceDay["status"],
      minutesLate: row.minutes_late ?? 0,
      // Without this, a floored clock-out already rounded once by payroll
      // gets rounded a second time here, and the estimate stops matching the
      // eventual payslip — the one thing this function exists to guarantee.
      hoursAreFinal: row.hours_are_final ?? false,
    });
    daysByProfile.set(row.profile_id, list);
  }

  const estimates: SalaryEstimate[] = [];
  const skipped: EstimateOutcome["skipped"] = [];
  const daysInMonth = daysInMonthOf(from);
  const periodDays = daysBetween(from, to);

  for (const person of staff) {
    const employee = toEmployee(person);

    if (employee.workerType === "contractor") {
      skipped.push({ profileId: employee.id, fullName: employee.fullName, reason: "contractor" });
      continue;
    }
    if (employee.payrollExempt) {
      skipped.push({
        profileId: employee.id,
        fullName: employee.fullName,
        reason: "payroll_exempt",
      });
      continue;
    }

    const days = daysByProfile.get(employee.id) ?? [];
    if (employee.requiresAttendance && days.length === 0 && !options.keepAbsent) {
      skipped.push({
        profileId: employee.id,
        fullName: employee.fullName,
        reason: "no_attendance",
      });
      continue;
    }

    const own = options.includeLedger
      ? ledgerFor(employee.id, month, ledger.adjustments, ledger.loans, ledger.recoveries)
          .components
      : [];

    estimates.push({
      employee,
      result: calculatePayroll({
        employee,
        rule,
        days,
        components: [...siteComponents, ...(extrasByProfile.get(employee.id) ?? []), ...own],
        latePenaltyTiers: tiers,
        daysInMonth,
        periodDays,
      }),
    });
  }

  return { estimates, skipped, usedDefaultRule: (rules ?? []).length === 0 };
}

/*
 * The site filters below are written as two branches rather than a conditional
 * `.eq()`, because a person whose profile carries no site must still be priced
 * against whatever single rule set the factory has.
 */

function siteRuleQuery(supabase: Client, siteId: string | null, on: string) {
  const query = supabase
    .from("pay_rules")
    .select("*")
    .lte("effective_from", on)
    .order("effective_from", { ascending: false })
    .limit(1);
  return siteId ? query.eq("site_id", siteId) : query;
}

function siteComponentQuery(supabase: Client, siteId: string | null, on: string) {
  const query = supabase
    .from("pay_components")
    .select("*")
    .eq("is_active", true)
    .lte("effective_from", on)
    .order("sort_order");
  return siteId ? query.eq("site_id", siteId) : query;
}

function siteLateRuleQuery(supabase: Client, siteId: string | null) {
  const query = supabase
    .from("late_penalty_rules")
    .select("*")
    .eq("is_active", true)
    // The same order the payroll run reads them in, so a tie between two
    // tiers resolves the same way in an estimate as on the payslip.
    .order("from_minutes", { ascending: true })
    .order("id", { ascending: true });
  return siteId ? query.eq("site_id", siteId) : query;
}

async function personalComponents(
  supabase: Client,
  ids: readonly string[],
  from: string,
  to: string,
): Promise<Map<string, PayComponent[]>> {
  const byProfile = new Map<string, PayComponent[]>();

  const rows = await selectAllInBatches<
    Database["public"]["Tables"]["profile_pay_components"]["Row"]
  >(
    ids,
    (batch, first, last) =>
      supabase
        .from("profile_pay_components")
        .select("*")
        .in("profile_id", batch)
        .lte("effective_from", to)
        .order("profile_id")
        .order("code")
        .range(first, last),
    "Could not read per-person pay components",
  );

  for (const row of rows) {
    if (row.effective_to && row.effective_to < from) continue;
    const list = byProfile.get(row.profile_id) ?? [];
    list.push({
      code: row.code,
      label: row.label,
      kind: row.kind,
      calc: "fixed",
      amount: Number(row.amount),
      percent: 0,
      sortOrder: 500,
    });
    byProfile.set(row.profile_id, list);
  }

  return byProfile;
}

/** The month's ledger, or nothing on a database that has not got one. */
async function ledgerOf(
  supabase: Client,
  ids: readonly string[],
  month: string,
): Promise<{ adjustments: AdjustmentRow[]; loans: LoanRow[]; recoveries: RecoveryRow[] }> {
  try {
    const [adjustments, loans] = await Promise.all([
      selectAllInBatches<AdjustmentRow>(
        ids,
        (batch, first, last) =>
          supabase
            .from("salary_adjustments")
            .select("profile_id, kind, amount, label, month")
            .eq("month", month)
            .in("profile_id", batch)
            .order("id")
            .range(first, last),
        "Could not read the salary ledger",
      ),
      selectAllInBatches<LoanRow>(
        ids,
        (batch, first, last) =>
          supabase
            .from("employee_loans")
            .select("id, profile_id, principal, installment, installments, first_month, status")
            .eq("status", "active")
            .in("profile_id", batch)
            .order("id")
            .range(first, last),
        "Could not read loans",
      ),
    ]);
    const recoveries =
      loans.length === 0
        ? []
        : await selectAllInBatches<RecoveryRow>(
            loans.map((loan) => loan.id),
            (batch, first, last) =>
              supabase
                .from("loan_recoveries")
                .select("loan_id, month, amount, source")
                .in("loan_id", batch)
                .order("id")
                .range(first, last),
            "Could not read loan recoveries",
          );
    return { adjustments, loans, recoveries };
  } catch {
    return { adjustments: [], loans: [], recoveries: [] };
  }
}
