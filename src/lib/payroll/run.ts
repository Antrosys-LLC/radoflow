import { calculatePayroll, summarisePayroll } from "./engine";
import type {
  AttendanceDay,
  DayType,
  Employee,
  LatePenaltyTier,
  PayComponent,
  PayRule,
  PayrollResult,
} from "./types";
import { DEFAULT_PAY_RULE } from "./types";
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

  const [{ data: staff }, { data: rules }, { data: components }, { data: lateRules }] =
    await Promise.all([
      supabase
        .from("profiles")
        .select(
          "id, employee_code, full_name, pay_class, requires_attendance, monthly_salary, hourly_rate, ot_hourly_rate, weekend_hourly_rate, holiday_hourly_rate, department_id, site_id, shift_id",
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
      supabase.from("late_penalty_rules").select("*").eq("site_id", period.site_id).eq("is_active", true),
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
    .select("profile_id, work_date, day_type, status, regular_hours, minutes_late")
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
  const rows = [];

  for (const person of staff) {
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
    });

    results.push(result);
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
      status: "review" as const,
    });
  }

  if (rows.length > 0) {
    const { error } = await supabase
      .from("payroll_items")
      .upsert(rows, { onConflict: "period_id,profile_id" });
    if (error) throw new Error(`Could not save payroll lines: ${error.message}`);
  }

  const totals = summarisePayroll(results);

  await supabase
    .from("payroll_periods")
    .update({
      status: "review",
      headcount: totals.headcount,
      total_gross: totals.gross,
      total_deductions: totals.deductions,
      total_tax: totals.tax,
      total_net: totals.net,
      calculated_at: new Date().toISOString(),
    })
    .eq("id", period.id);

  return { periodId: period.id, ...totals, skipped };
}

// -- mappers ----------------------------------------------------------------

function toPayRule(row: Record<string, unknown> | undefined): PayRule {
  if (!row) return { ...DEFAULT_PAY_RULE };
  return {
    standardHoursPerDay: Number(row["standard_hours_per_day"] ?? 8),
    standardDaysPerMonth: Number(row["standard_days_per_month"] ?? 26),
    otHourlyRate: Number(row["ot_hourly_rate"] ?? 0),
    weekendHourlyRate: Number(row["weekend_hourly_rate"] ?? 0),
    holidayHourlyRate: Number(row["holiday_hourly_rate"] ?? 0),
    nightHourlyRate: Number(row["night_hourly_rate"] ?? 0),
    lateGraceMinutes: Number(row["late_grace_minutes"] ?? 10),
    otThresholdMinutes: Number(row["ot_threshold_minutes"] ?? 30),
    roundToMinutes: Number(row["round_to_minutes"] ?? 15),
  };
}

function toPayComponent(row: Record<string, unknown>): PayComponent {
  return {
    code: String(row["code"]),
    label: String(row["label"]),
    kind: row["kind"] as PayComponent["kind"],
    calc: row["calc"] as PayComponent["calc"],
    amount: Number(row["amount"] ?? 0),
    percent: Number(row["percent"] ?? 0),
    slabs: (row["slabs"] as PayComponent["slabs"]) ?? null,
    appliesTo: (row["applies_to"] as PayComponent["appliesTo"]) ?? null,
    sortOrder: Number(row["sort_order"] ?? 100),
  };
}

function toLateTier(row: Record<string, unknown>): LatePenaltyTier {
  return {
    label: String(row["label"]),
    fromMinutes: Number(row["from_minutes"]),
    toMinutes: row["to_minutes"] == null ? null : Number(row["to_minutes"]),
    penaltyPercent: Number(row["penalty_percent"]),
    basis: (row["basis"] as "day" | "month") ?? "day",
  };
}

function toEmployee(row: Record<string, unknown>): Employee {
  return {
    id: String(row["id"]),
    fullName: String(row["full_name"]),
    employeeCode: String(row["employee_code"]),
    payClass: row["pay_class"] as Employee["payClass"],
    requiresAttendance: Boolean(row["requires_attendance"]),
    monthlySalary: Number(row["monthly_salary"] ?? 0),
    hourlyRate: Number(row["hourly_rate"] ?? 0),
    otHourlyRate: row["ot_hourly_rate"] == null ? null : Number(row["ot_hourly_rate"]),
    weekendHourlyRate: row["weekend_hourly_rate"] == null ? null : Number(row["weekend_hourly_rate"]),
    holidayHourlyRate: row["holiday_hourly_rate"] == null ? null : Number(row["holiday_hourly_rate"]),
    departmentId: (row["department_id"] as string | null) ?? null,
    siteId: (row["site_id"] as string | null) ?? null,
  };
}
