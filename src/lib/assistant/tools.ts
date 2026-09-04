import { betaZodTool } from "@anthropic-ai/sdk/helpers/beta/zod";
import * as z from "zod/v4";

import { estimateSalaries } from "@/lib/payroll/estimate";
import { accumulateHours } from "@/lib/payroll/hours";
import { DEFAULT_PAY_RULE, type AttendanceDay, type DayType } from "@/lib/payroll/types";
import type { createClient } from "@/lib/supabase/server";
import { todayInPakistan } from "@/lib/time";

type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>;

/**
 * Tool definitions for the "ask" assistant.
 *
 * Every tool runs its query through the caller's own session-scoped Supabase
 * client — the same one every page and server action uses — so Row Level
 * Security applies exactly as it would if the person had clicked through the
 * UI themselves. A Manager's questions only ever return their own
 * department; someone without payroll.view gets nothing back from a payroll
 * question, not an error. There is deliberately no tool here that writes
 * anything: this assistant can only ever answer, never change a record.
 *
 * Between them these cover the questions the app itself answers on a screen —
 * who is in, who was late, what someone is paid, what a department costs,
 * leave, holidays and headcount — because a factory owner who would rather
 * speak than navigate should not hit a wall the menu does not have.
 */

/** Month bounds for a `YYYY-MM`, clamped to the month's real length. */
function monthRange(month: string): { from: string; to: string } | null {
  const match = /^(\d{4})-(\d{2})$/.exec(month.trim());
  if (!match) return null;

  const year = Number(match[1]);
  const monthIndex = Number(match[2]);
  if (monthIndex < 1 || monthIndex > 12) return null;

  const lastDay = new Date(Date.UTC(year, monthIndex, 0)).getUTCDate();
  return { from: `${match[1]}-${match[2]}-01`, to: `${match[1]}-${match[2]}-${lastDay}` };
}

function todayNote(): string {
  return `Today's date, in Pakistan Standard Time, is ${todayInPakistan()}. Resolve relative phrases ("this month", "last week", "today") against this before calling any tool — every tool takes concrete YYYY-MM-DD dates, never relative words.`;
}

export function buildAssistantTools(supabase: SupabaseServerClient) {
  /** Everyone in a department, or everyone visible when none is named. */
  async function peopleIn(departmentId?: string): Promise<string[]> {
    const query = supabase.from("employee_directory").select("id").eq("status", "active");
    const { data } = departmentId ? await query.eq("department_id", departmentId) : await query;
    return (data ?? []).map((p) => p.id).filter((id): id is string => !!id);
  }

  async function namesOf(ids: readonly (string | null)[]): Promise<Map<string, string>> {
    const known = [...new Set(ids.filter((id): id is string => !!id))];
    if (known.length === 0) return new Map<string, string>();

    const { data } = await supabase
      .from("employee_directory")
      .select("id, full_name")
      .in("id", known);

    const byId = new Map<string, string>();
    for (const person of data ?? []) {
      if (person.id && person.full_name) byId.set(person.id, person.full_name);
    }
    return byId;
  }

  const listDepartments = betaZodTool({
    name: "list_departments",
    description:
      "Lists every department the caller's factory has, with its id. Call this first when a question names a department by a name you need to resolve to an id, or when the person asks 'which departments do we have'.",
    inputSchema: z.object({}),
    run: async () => {
      const { data } = await supabase.from("departments").select("id, name").order("name");
      if (!data || data.length === 0) return "No departments visible.";
      return JSON.stringify(data);
    },
  });

  const resolveEmployee = betaZodTool({
    name: "resolve_employee",
    description:
      "Finds an employee by name or employee code, returning their id, name, employee code and department id. Call this before any tool that needs a specific person's id — never guess an id. Returns up to 5 matches; if there is more than one, ask the person which one they mean instead of guessing.",
    inputSchema: z.object({
      query: z
        .string()
        .describe("A name (full or partial) or employee code, as the person said it."),
    }),
    run: async ({ query }) => {
      // PostgREST's `.or()` filter reads commas and parentheses as syntax, not
      // literal search text — strip them rather than let an oddly-phrased
      // question produce a malformed filter (or, worse, one that parses into
      // something unintended). RLS still bounds every row regardless, but
      // there is no reason to hand the query string that much structure.
      const safe = query.replace(/[,()%]/g, " ").trim();
      if (!safe) return "That name or code was empty after removing special characters.";

      const { data } = await supabase
        .from("employee_directory")
        .select("id, full_name, employee_code, department_id, status")
        .or(`full_name.ilike.%${safe}%,employee_code.ilike.%${safe}%`)
        .limit(5);

      if (!data || data.length === 0) {
        return "No employee found matching that name or code, or you may not have access to their record.";
      }
      return JSON.stringify(data);
    },
  });

  const getEmployeeDetails = betaZodTool({
    name: "get_employee_details",
    description:
      "One person's employment and pay terms: department, designation, shift, pay class, monthly salary or hourly rate, overtime rate and eligibility, duty hours, Sunday policy and status. Use for 'what is Ali's salary', 'kitni tankhwah hai', 'which shift is she on', 'is he a contractor'. Pay figures come back only if the caller is allowed to see them; if they are absent, say you cannot see pay for that person rather than guessing.",
    inputSchema: z.object({
      profileId: z.string().describe("The employee's profile id, from resolve_employee."),
    }),
    run: async ({ profileId }) => {
      const { data: person } = await supabase
        .from("profiles")
        .select(
          "id, employee_code, full_name, designation, status, worker_type, pay_class, monthly_salary, hourly_rate, ot_hourly_rate, duty_hours, overtime_eligible, sunday_policy, requires_attendance, joined_on, department_id, shift_id",
        )
        .eq("id", profileId)
        .maybeSingle();

      if (!person) {
        // The directory carries no pay columns by design, so it is the right
        // fallback for someone who may see the person but not their money.
        const { data: listed } = await supabase
          .from("employee_directory")
          .select("id, full_name, employee_code, designation, status, pay_class, department_id")
          .eq("id", profileId)
          .maybeSingle();

        if (!listed) return "No access to that person's record.";
        return JSON.stringify({ ...listed, payVisible: false });
      }

      const [{ data: department }, { data: shift }] = await Promise.all([
        person.department_id
          ? supabase.from("departments").select("name").eq("id", person.department_id).maybeSingle()
          : Promise.resolve({ data: null }),
        person.shift_id
          ? supabase
              .from("shifts")
              .select("name, starts_at, ends_at")
              .eq("id", person.shift_id)
              .maybeSingle()
          : Promise.resolve({ data: null }),
      ]);

      return JSON.stringify({
        name: person.full_name,
        employeeCode: person.employee_code,
        designation: person.designation,
        department: department?.name ?? null,
        status: person.status,
        workerType: person.worker_type,
        payClass: person.pay_class,
        monthlySalary: Number(person.monthly_salary),
        hourlyRate: Number(person.hourly_rate),
        overtimeHourlyRate: person.ot_hourly_rate == null ? null : Number(person.ot_hourly_rate),
        overtimeEligible: person.overtime_eligible,
        dutyHours: person.duty_hours,
        sundayPolicy: person.sunday_policy,
        clocksIn: person.requires_attendance,
        joinedOn: person.joined_on,
        shift: shift ? `${shift.name} (${shift.starts_at}–${shift.ends_at})` : null,
        payVisible: true,
      });
    },
  });

  const calculateSalary = betaZodTool({
    name: "calculate_salary",
    description:
      "Works out ONE person's pay for a month: base pay, overtime, weekend and holiday premiums, allowances, late penalty, deductions, tax and net payable, plus the days behind it. Use for every 'how much will X be paid', 'is mahine ki tankhwah kitni banegi', 'what is her net salary', 'salary calculation' question. If payroll has already been run for that month the recorded payslip is returned (source 'payroll run'); otherwise the same engine prices it live from attendance (source 'estimate'), so always state which one you are quoting.",
    inputSchema: z.object({
      profileId: z.string().describe("The employee's profile id, from resolve_employee."),
      month: z.string().describe("YYYY-MM, e.g. 2026-09."),
    }),
    run: async ({ profileId, month }) => {
      const range = monthRange(month);
      if (!range) return "That month was not in YYYY-MM form, e.g. 2026-09.";

      // A completed run is the money that will actually be paid; an estimate
      // is only what the same rules say today. Prefer the run when it exists.
      const { data: periods } = await supabase
        .from("payroll_periods")
        .select("id, label, status")
        .lte("period_start", range.to)
        .gte("period_end", range.from);

      const periodIds = (periods ?? []).map((p) => p.id);
      if (periodIds.length > 0) {
        const { data: item } = await supabase
          .from("payroll_items")
          .select(
            "period_id, base_pay, ot_pay, weekend_pay, holiday_pay, allowances, gross, deductions, tax, net, regular_hours, ot_hours, days_present, days_absent, days_leave, status",
          )
          .eq("profile_id", profileId)
          .in("period_id", periodIds)
          .maybeSingle();

        if (item) {
          const period = (periods ?? []).find((p) => p.id === item.period_id);
          return JSON.stringify({
            source: "payroll run",
            period: period?.label ?? month,
            periodStatus: period?.status,
            basePay: Number(item.base_pay),
            overtimePay: Number(item.ot_pay),
            weekendPay: Number(item.weekend_pay),
            holidayPay: Number(item.holiday_pay),
            allowances: Number(item.allowances),
            gross: Number(item.gross),
            deductions: Number(item.deductions),
            tax: Number(item.tax),
            net: Number(item.net),
            regularHours: Number(item.regular_hours),
            overtimeHours: Number(item.ot_hours),
            daysPresent: item.days_present,
            daysAbsent: item.days_absent,
            daysOnLeave: item.days_leave,
          });
        }
      }

      const { estimates, skipped, usedDefaultRule } = await estimateSalaries(
        supabase,
        [profileId],
        range.from,
        range.to,
      );

      const skip = skipped[0];
      if (skip) {
        if (skip.reason === "contractor") {
          return `${skip.fullName} works for a contract firm. The firm is paid one agreed amount for the whole department, so there is no individual salary to calculate.`;
        }
        if (skip.reason === "payroll_exempt") {
          return `${skip.fullName} is not on payroll, so no salary is calculated here.`;
        }
        return `${skip.fullName} has no attendance recorded for ${month}, and their pay is worked out from attendance, so there is nothing to calculate yet.`;
      }

      const estimate = estimates[0];
      if (!estimate) {
        return "No access to that person's pay record, or they have no pay set up.";
      }

      const { result, employee } = estimate;
      return JSON.stringify({
        source: "estimate",
        name: employee.fullName,
        month,
        payClass: result.payClass,
        dailyRate: result.dailyRate,
        workingDaysPaid: result.workingDays,
        daysPresent: result.daysPresent,
        daysAbsent: result.daysAbsent,
        daysOnLeave: result.daysLeave,
        daysLate: result.daysLate,
        regularHours: result.hours.regular,
        overtimeHours: result.hours.overtime,
        basePay: result.basePay,
        overtimePay: result.otPay,
        weekendPay: result.weekendPay,
        holidayPay: result.holidayPay,
        allowances: result.allowances,
        latePenalty: result.latePenalty,
        gross: result.gross,
        deductions: result.deductions,
        tax: result.tax,
        net: result.net,
        note: usedDefaultRule
          ? "No rate rules are configured for this factory, so standard rates were used."
          : undefined,
      });
    },
  });

  const getSalaryCost = betaZodTool({
    name: "get_salary_cost",
    description:
      "Total wage cost for a month across a department, or across everyone visible when no department is given: gross, deductions, tax and net, with the headcount priced. Use for 'what does the dyeing unit cost us this month', 'total tankhwah kitni banti hai', 'monthly wage bill'. Prices live from attendance and pay terms, so it works before payroll has been run.",
    inputSchema: z.object({
      month: z.string().describe("YYYY-MM, e.g. 2026-09."),
      departmentId: z
        .string()
        .optional()
        .describe("Restrict to one department's id, from list_departments."),
    }),
    run: async ({ month, departmentId }) => {
      const range = monthRange(month);
      if (!range) return "That month was not in YYYY-MM form, e.g. 2026-09.";

      const ids = await peopleIn(departmentId);
      if (ids.length === 0) {
        return "No employees found there, or you do not have access to them.";
      }

      const { estimates, skipped, usedDefaultRule } = await estimateSalaries(
        supabase,
        ids,
        range.from,
        range.to,
      );

      if (estimates.length === 0 && skipped.length === 0) {
        return "No pay records visible for those people — you may not have access to salary data.";
      }

      let gross = 0;
      let deductions = 0;
      let tax = 0;
      let net = 0;
      for (const { result } of estimates) {
        gross += result.gross;
        deductions += result.deductions;
        tax += result.tax;
        net += result.net;
      }

      const contractors = skipped.filter((s) => s.reason === "contractor").length;

      return JSON.stringify({
        month,
        employeesPriced: estimates.length,
        gross: Math.round(gross),
        deductions: Math.round(deductions),
        tax: Math.round(tax),
        net: Math.round(net),
        contractWorkersNotPriced: contractors,
        note: [
          contractors > 0
            ? `${contractors} contract worker(s) are excluded — their firm is billed one agreed amount, not per person.`
            : null,
          usedDefaultRule
            ? "No rate rules are configured for this factory, so standard rates were used."
            : null,
        ]
          .filter(Boolean)
          .join(" "),
      });
    },
  });

  const getAttendanceSummary = betaZodTool({
    name: "get_attendance_summary",
    description:
      "Counts present, absent, on-leave and late days across a date range, optionally for one department. Use for questions like 'how many were absent this week' or 'attendance in the dyeing unit last month'. Returns nothing (an empty count) if the caller has no access to that data — that is not an error, it means say so plainly rather than guessing a number.",
    inputSchema: z.object({
      from: z.string().describe("Start date, YYYY-MM-DD, inclusive."),
      to: z.string().describe("End date, YYYY-MM-DD, inclusive."),
      departmentId: z
        .string()
        .optional()
        .describe("Restrict to one department's id, from list_departments or resolve_employee."),
    }),
    run: async ({ from, to, departmentId }) => {
      let profileIds: string[] | null = null;
      if (departmentId) {
        profileIds = await peopleIn(departmentId);
        if (profileIds.length === 0) {
          return "No employees found in that department, or you do not have access to it.";
        }
      }

      let query = supabase
        .from("attendance_days")
        .select("status, is_late")
        .gte("work_date", from)
        .lte("work_date", to);
      if (profileIds) query = query.in("profile_id", profileIds);

      const { data } = await query;
      if (!data || data.length === 0) {
        return "No attendance rows in range — either nothing has been recorded yet, or you do not have access to this data.";
      }

      const counts = { present: 0, absent: 0, leave: 0, off: 0, holiday: 0, partial: 0, late: 0 };
      for (const row of data) {
        const status = (row.status ?? "pending") as keyof typeof counts;
        if (status in counts && status !== "late") counts[status] += 1;
        if (row.is_late) counts.late += 1;
      }

      return JSON.stringify({ totalDays: data.length, ...counts });
    },
  });

  const getEmployeeAttendance = betaZodTool({
    name: "get_employee_attendance",
    description:
      "One person's attendance day by day: date, status, hours worked, minutes late, and their first and last punch. Use for 'how many days did Ali come this month', 'kitne din chutti ki', 'was she late on Tuesday'. Capped at 40 days, most recent first.",
    inputSchema: z.object({
      profileId: z.string().describe("The employee's profile id, from resolve_employee."),
      from: z.string().describe("Start date, YYYY-MM-DD, inclusive."),
      to: z.string().describe("End date, YYYY-MM-DD, inclusive."),
    }),
    run: async ({ profileId, from, to }) => {
      const { data } = await supabase
        .from("attendance_days")
        .select(
          "work_date, status, day_type, regular_hours, ot_hours, minutes_late, first_in, last_out",
        )
        .eq("profile_id", profileId)
        .gte("work_date", from)
        .lte("work_date", to)
        .order("work_date", { ascending: false })
        .limit(40);

      if (!data || data.length === 0) {
        return "No attendance recorded for that person in range, or you do not have access to it.";
      }

      const summary = { present: 0, absent: 0, leave: 0, late: 0, hours: 0 };
      for (const row of data) {
        if (row.status === "present" || row.status === "partial") summary.present += 1;
        if (row.status === "absent") summary.absent += 1;
        if (row.status === "leave") summary.leave += 1;
        if ((row.minutes_late ?? 0) > 0) summary.late += 1;
        summary.hours += Number(row.regular_hours ?? 0) + Number(row.ot_hours ?? 0);
      }

      return JSON.stringify({
        summary: { ...summary, hours: Math.round(summary.hours * 100) / 100 },
        days: data.map((row) => ({
          date: row.work_date,
          status: row.status,
          dayType: row.day_type,
          hours: Number(row.regular_hours ?? 0),
          overtimeHours: Number(row.ot_hours ?? 0),
          minutesLate: row.minutes_late ?? 0,
          in: row.first_in,
          out: row.last_out,
        })),
      });
    },
  });

  const getLiveAttendance = betaZodTool({
    name: "get_live_attendance",
    description:
      "Who is on the floor right now, for today only: counts of working, finished, not yet in, and those whose shift has started with no punch at all. Use for 'kaun aaya hai', 'who is in right now', 'how many are working today'. Names are capped at 25 per group.",
    inputSchema: z.object({
      departmentId: z.string().optional().describe("Restrict to one department's id."),
    }),
    run: async ({ departmentId }) => {
      const query = supabase
        .from("live_attendance")
        .select("full_name, live_status, first_in, last_out, minutes_late");
      const { data } = departmentId ? await query.eq("department_id", departmentId) : await query;

      if (!data || data.length === 0) {
        return "Nothing on the live board — either nobody is set to clock in, or you do not have access to it.";
      }

      const groups = new Map<string, string[]>();
      for (const row of data) {
        const status = row.live_status ?? "unknown";
        const list = groups.get(status) ?? [];
        if (list.length < 25) list.push(row.full_name ?? "Unknown");
        groups.set(status, list);
      }

      const counts: Record<string, number> = {};
      for (const row of data)
        counts[row.live_status ?? "unknown"] = (counts[row.live_status ?? "unknown"] ?? 0) + 1;

      return JSON.stringify({
        expectedToClockIn: data.length,
        counts,
        names: Object.fromEntries(groups),
        lateSoFar: data.filter((r) => (r.minutes_late ?? 0) > 0).length,
      });
    },
  });

  const getLateCheckins = betaZodTool({
    name: "get_late_checkins",
    description:
      "Lists individual late arrivals in a date range — who was late, on what date, and by how many minutes. Optionally restrict to one department. Use for 'who was late today' or 'late check-ins this month in the dyeing unit'. Capped at 30 rows, most recent first; if more exist, say the list is not exhaustive.",
    inputSchema: z.object({
      from: z.string().describe("Start date, YYYY-MM-DD, inclusive."),
      to: z.string().describe("End date, YYYY-MM-DD, inclusive."),
      departmentId: z.string().optional().describe("Restrict to one department's id."),
    }),
    run: async ({ from, to, departmentId }) => {
      let profileIds: string[] | null = null;
      if (departmentId) {
        profileIds = await peopleIn(departmentId);
        if (profileIds.length === 0) {
          return "No employees found in that department, or you do not have access to it.";
        }
      }

      let query = supabase
        .from("attendance_days")
        .select("profile_id, work_date, minutes_late")
        .eq("is_late", true)
        .gte("work_date", from)
        .lte("work_date", to)
        .order("work_date", { ascending: false })
        .limit(30);
      if (profileIds) query = query.in("profile_id", profileIds);

      const { data } = await query;
      if (!data || data.length === 0) {
        return "No late check-ins found in range, or you do not have access to this data.";
      }

      const nameOf = await namesOf(data.map((r) => r.profile_id));

      const rows = data.map((r) => ({
        name: nameOf.get(r.profile_id ?? "") ?? "Unknown",
        date: r.work_date,
        minutesLate: r.minutes_late ?? 0,
      }));

      return JSON.stringify(rows);
    },
  });

  const getOvertimeSummary = betaZodTool({
    name: "get_overtime_summary",
    description:
      "Totals worked hours split into regular and overtime across a date range, optionally for one department. Use for 'overtime this month' or 'how many overtime hours in the folding department'. These are hours only — for what the overtime is worth in rupees, use calculate_salary or get_salary_cost instead.",
    inputSchema: z.object({
      from: z.string().describe("Start date, YYYY-MM-DD, inclusive."),
      to: z.string().describe("End date, YYYY-MM-DD, inclusive."),
      departmentId: z.string().optional().describe("Restrict to one department's id."),
    }),
    run: async ({ from, to, departmentId }) => {
      const ids = await peopleIn(departmentId);
      if (ids.length === 0) {
        return "No employees found, or you do not have access to this data.";
      }

      const { data: dutyRows } = await supabase
        .from("profiles")
        .select("id, duty_hours")
        .in("id", ids);
      const dutyOf = new Map((dutyRows ?? []).map((p) => [p.id, Number(p.duty_hours ?? 8)]));

      const { data: days } = await supabase
        .from("attendance_days")
        .select("profile_id, work_date, day_type, status, regular_hours")
        .in("profile_id", ids)
        .gte("work_date", from)
        .lte("work_date", to);

      if (!days || days.length === 0) {
        return "No attendance in range, or you do not have access to this data.";
      }

      const byPerson = new Map<string, AttendanceDay[]>();
      for (const row of days) {
        if (!row.profile_id) continue;
        const list = byPerson.get(row.profile_id) ?? [];
        list.push({
          workDate: row.work_date,
          dayType: (row.day_type ?? "workday") as DayType,
          hoursWorked: Number(row.regular_hours ?? 0),
          status: (row.status ?? "pending") as AttendanceDay["status"],
        });
        byPerson.set(row.profile_id, list);
      }

      let regular = 0;
      let overtime = 0;
      for (const [profileId, personDays] of byPerson) {
        const buckets = accumulateHours(personDays, DEFAULT_PAY_RULE, dutyOf.get(profileId));
        regular += buckets.regular;
        overtime += buckets.overtime;
      }

      return JSON.stringify({
        employeesCounted: byPerson.size,
        regularHours: Math.round(regular * 100) / 100,
        overtimeHours: Math.round(overtime * 100) / 100,
      });
    },
  });

  const getHeadcount = betaZodTool({
    name: "get_headcount",
    description:
      "How many people work here: the active total, split by department and by whether they are the factory's own staff or a contract firm's. Use for 'how many workers do we have', 'kitne log kaam karte hain', 'how many in packaging'.",
    inputSchema: z.object({}),
    run: async () => {
      const [{ data: people }, { data: departments }] = await Promise.all([
        supabase.from("employee_directory").select("id, department_id, status"),
        supabase.from("departments").select("id, name"),
      ]);

      if (!people || people.length === 0) return "No employee records visible to you.";

      const nameOf = new Map((departments ?? []).map((d) => [d.id, d.name]));
      const active = people.filter((p) => p.status === "active");

      const byDepartment = new Map<string, number>();
      for (const person of active) {
        const label = nameOf.get(person.department_id ?? "") ?? "No department";
        byDepartment.set(label, (byDepartment.get(label) ?? 0) + 1);
      }

      return JSON.stringify({
        activeTotal: active.length,
        byDepartment: Object.fromEntries([...byDepartment.entries()].sort((a, b) => b[1] - a[1])),
      });
    },
  });

  const getLeaveBalance = betaZodTool({
    name: "get_leave_balance",
    description:
      "Shows one employee's leave balance for the current year, by leave type: annual quota, days used (approved requests), and days remaining. Resolve the person's id with resolve_employee first.",
    inputSchema: z.object({
      profileId: z.string().describe("The employee's profile id, from resolve_employee."),
    }),
    run: async ({ profileId }) => {
      const year = new Date().getFullYear();
      const yearStart = `${year}-01-01`;
      const yearEnd = `${year}-12-31`;

      const { data: types } = await supabase
        .from("leave_types")
        .select("id, name, annual_quota")
        .eq("is_active", true);
      if (!types || types.length === 0) return "No leave types configured.";

      const { data: requests } = await supabase
        .from("leave_requests")
        .select("leave_type_id, days")
        .eq("profile_id", profileId)
        .eq("status", "approved")
        .gte("from_date", yearStart)
        .lte("to_date", yearEnd);

      if (requests === null) {
        return "No access to this person's leave record.";
      }

      const usedByType = new Map<string, number>();
      for (const r of requests) {
        usedByType.set(r.leave_type_id, (usedByType.get(r.leave_type_id) ?? 0) + Number(r.days));
      }

      const rows = types.map((t) => {
        const used = usedByType.get(t.id) ?? 0;
        return {
          leaveType: t.name,
          annualQuota: Number(t.annual_quota),
          used,
          remaining: Math.max(0, Number(t.annual_quota) - used),
        };
      });

      return JSON.stringify(rows);
    },
  });

  const getLeaveRequests = betaZodTool({
    name: "get_leave_requests",
    description:
      "Leave requests overlapping a date range — who, which type, which dates, how many days, and whether it is still waiting for approval. Use for 'who is on leave this week', 'kitni chutti ki darkhwastein pending hain', 'has Ali's leave been approved'. Capped at 30, soonest first.",
    inputSchema: z.object({
      from: z.string().describe("Start date, YYYY-MM-DD, inclusive."),
      to: z.string().describe("End date, YYYY-MM-DD, inclusive."),
      status: z
        .enum(["pending", "approved", "rejected", "cancelled"])
        .optional()
        .describe("Only requests in this state. Omit for all of them."),
    }),
    run: async ({ from, to, status }) => {
      const query = supabase
        .from("leave_requests")
        .select("profile_id, leave_type_id, from_date, to_date, days, status, reason")
        .lte("from_date", to)
        .gte("to_date", from)
        .order("from_date")
        .limit(30);

      const { data } = status ? await query.eq("status", status) : await query;
      if (!data || data.length === 0) {
        return "No leave requests in that range, or you do not have access to them.";
      }

      const [nameOf, { data: types }] = await Promise.all([
        namesOf(data.map((r) => r.profile_id)),
        supabase.from("leave_types").select("id, name"),
      ]);
      const typeOf = new Map((types ?? []).map((t) => [t.id, t.name]));

      return JSON.stringify(
        data.map((r) => ({
          name: nameOf.get(r.profile_id) ?? "Unknown",
          leaveType: typeOf.get(r.leave_type_id) ?? "Leave",
          from: r.from_date,
          to: r.to_date,
          days: Number(r.days),
          status: r.status,
        })),
      );
    },
  });

  const getCalendar = betaZodTool({
    name: "get_calendar",
    description:
      "Holidays and non-working days declared on the factory calendar for a date range, and any off-day that was switched back on. Use for 'when is the next holiday', 'chutti kab hai', 'is Sunday a working day this week'.",
    inputSchema: z.object({
      from: z.string().describe("Start date, YYYY-MM-DD, inclusive."),
      to: z.string().describe("End date, YYYY-MM-DD, inclusive."),
    }),
    run: async ({ from, to }) => {
      const { data } = await supabase
        .from("calendar_days")
        .select("day, day_type, reason")
        .gte("day", from)
        .lte("day", to)
        .order("day");

      if (!data || data.length === 0) {
        return "Nothing special is marked on the calendar in that range — the normal working week applies.";
      }

      return JSON.stringify(
        data.map((d) => ({ date: d.day, dayType: d.day_type, reason: d.reason })),
      );
    },
  });

  const getPayrollSummary = betaZodTool({
    name: "get_payroll_summary",
    description:
      "Totals for payroll periods overlapping a given month (gross, deductions, tax, net, headcount, status) — the figures from an actual pay run. Use for 'has payroll been run', 'what was approved for August'. If no run exists yet, use get_salary_cost instead, which prices the month live.",
    inputSchema: z.object({
      month: z.string().describe("YYYY-MM, e.g. 2026-08."),
    }),
    run: async ({ month }) => {
      const range = monthRange(month);
      if (!range) return "That month was not in YYYY-MM form, e.g. 2026-09.";

      const { data } = await supabase
        .from("payroll_periods")
        .select(
          "label, period_start, period_end, status, headcount, total_gross, total_net, total_deductions, total_tax",
        )
        .lte("period_start", range.to)
        .gte("period_end", range.from);

      if (!data || data.length === 0) {
        return "No payroll period has been created for that month, or you do not have access to payroll data. If pay still needs to be worked out, get_salary_cost can price the month from attendance.";
      }

      return JSON.stringify(
        data.map((p) => ({
          label: p.label,
          status: p.status,
          headcount: p.headcount,
          gross: Number(p.total_gross),
          deductions: Number(p.total_deductions),
          tax: Number(p.total_tax),
          net: Number(p.total_net),
        })),
      );
    },
  });

  return {
    tools: [
      listDepartments,
      resolveEmployee,
      getEmployeeDetails,
      calculateSalary,
      getSalaryCost,
      getAttendanceSummary,
      getEmployeeAttendance,
      getLiveAttendance,
      getLateCheckins,
      getOvertimeSummary,
      getHeadcount,
      getLeaveBalance,
      getLeaveRequests,
      getCalendar,
      getPayrollSummary,
    ],
    contextNote: todayNote(),
  };
}
