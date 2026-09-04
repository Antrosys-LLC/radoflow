import type { SupabaseClient } from "@supabase/supabase-js";

import { calculatePayroll } from "./engine";
import { daysInMonthOf } from "./hours";
import { toEmployee, toLateTier, toPayComponent, toPayRule } from "./mappers";
import type { AttendanceDay, DayType, Employee, PayComponent, PayrollResult } from "./types";
import type { Database } from "@/lib/supabase/database.types";

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

export async function estimateSalaries(
  supabase: Client,
  profileIds: readonly string[],
  from: string,
  to: string,
): Promise<EstimateOutcome> {
  const empty: EstimateOutcome = { estimates: [], skipped: [], usedDefaultRule: false };
  if (profileIds.length === 0) return empty;

  const { data: staff } = await supabase
    .from("profiles")
    .select(
      "id, employee_code, full_name, pay_class, requires_attendance, monthly_salary, hourly_rate, ot_hourly_rate, weekend_hourly_rate, holiday_hourly_rate, department_id, site_id, shift_id, worker_type, payroll_exempt, duty_hours, sunday_policy, overtime_eligible",
    )
    .in("id", profileIds);

  if (!staff || staff.length === 0) return empty;

  const siteId = staff.find((p) => p.site_id)?.site_id ?? null;

  const [{ data: rules }, { data: components }, { data: lateRules }, { data: attendance }] =
    await Promise.all([
      siteRuleQuery(supabase, siteId, to),
      siteComponentQuery(supabase, siteId, to),
      siteLateRuleQuery(supabase, siteId),
      supabase
        .from("attendance_days")
        .select("profile_id, work_date, day_type, status, regular_hours, minutes_late")
        .in(
          "profile_id",
          staff.map((s) => s.id),
        )
        .gte("work_date", from)
        .lte("work_date", to),
    ]);

  const rule = toPayRule(rules?.[0]);
  const siteComponents = (components ?? []).map(toPayComponent);
  const tiers = (lateRules ?? []).map(toLateTier);

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

  const extrasByProfile = await personalComponents(supabase, staff, from, to);

  const estimates: SalaryEstimate[] = [];
  const skipped: EstimateOutcome["skipped"] = [];
  const daysInMonth = daysInMonthOf(from);

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
    if (employee.requiresAttendance && days.length === 0) {
      skipped.push({
        profileId: employee.id,
        fullName: employee.fullName,
        reason: "no_attendance",
      });
      continue;
    }

    estimates.push({
      employee,
      result: calculatePayroll({
        employee,
        rule,
        days,
        components: [...siteComponents, ...(extrasByProfile.get(employee.id) ?? [])],
        latePenaltyTiers: tiers,
        daysInMonth,
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
  const query = supabase.from("late_penalty_rules").select("*").eq("is_active", true);
  return siteId ? query.eq("site_id", siteId) : query;
}

async function personalComponents(
  supabase: Client,
  staff: readonly { id: string }[],
  from: string,
  to: string,
): Promise<Map<string, PayComponent[]>> {
  const byProfile = new Map<string, PayComponent[]>();

  const { data } = await supabase
    .from("profile_pay_components")
    .select("*")
    .in(
      "profile_id",
      staff.map((s) => s.id),
    )
    .lte("effective_from", to);

  for (const row of data ?? []) {
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
