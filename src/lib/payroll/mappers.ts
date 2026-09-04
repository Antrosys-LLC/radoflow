import type { Employee, LatePenaltyTier, PayComponent, PayRule } from "./types";
import { DEFAULT_PAY_RULE } from "./types";

/**
 * Database rows to engine inputs.
 *
 * Shared by the payroll run (`./run.ts`) and the assistant's salary estimate
 * (`./estimate.ts`) so the two cannot drift: an answer given in the Ask screen
 * has to be the same arithmetic the payslip will show, or it is worse than no
 * answer at all.
 */

export function toPayRule(row: Record<string, unknown> | undefined): PayRule {
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
    otDailyCapHours: Number(row["ot_daily_cap_hours"] ?? DEFAULT_PAY_RULE.otDailyCapHours),
    roundToMinutes: Number(row["round_to_minutes"] ?? 15),
  };
}

export function toPayComponent(row: Record<string, unknown>): PayComponent {
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

export function toLateTier(row: Record<string, unknown>): LatePenaltyTier {
  return {
    label: String(row["label"]),
    fromMinutes: Number(row["from_minutes"]),
    toMinutes: row["to_minutes"] == null ? null : Number(row["to_minutes"]),
    penaltyPercent: Number(row["penalty_percent"]),
    basis: (row["basis"] as LatePenaltyTier["basis"]) ?? "day",
  };
}

export function toEmployee(row: Record<string, unknown>): Employee {
  return {
    id: String(row["id"]),
    fullName: String(row["full_name"]),
    employeeCode: String(row["employee_code"]),
    payClass: row["pay_class"] as Employee["payClass"],
    requiresAttendance: Boolean(row["requires_attendance"]),
    workerType: (row["worker_type"] as Employee["workerType"]) ?? "employee",
    payrollExempt: Boolean(row["payroll_exempt"] ?? false),
    dutyHours: row["duty_hours"] == null ? null : Number(row["duty_hours"]),
    sundayPolicy: (row["sunday_policy"] as Employee["sundayPolicy"]) ?? "off",
    overtimeEligible: row["overtime_eligible"] == null ? true : Boolean(row["overtime_eligible"]),
    monthlySalary: Number(row["monthly_salary"] ?? 0),
    hourlyRate: Number(row["hourly_rate"] ?? 0),
    otHourlyRate: row["ot_hourly_rate"] == null ? null : Number(row["ot_hourly_rate"]),
    weekendHourlyRate:
      row["weekend_hourly_rate"] == null ? null : Number(row["weekend_hourly_rate"]),
    holidayHourlyRate:
      row["holiday_hourly_rate"] == null ? null : Number(row["holiday_hourly_rate"]),
    departmentId: (row["department_id"] as string | null) ?? null,
    siteId: (row["site_id"] as string | null) ?? null,
  };
}
