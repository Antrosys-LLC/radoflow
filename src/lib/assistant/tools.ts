import { betaZodTool } from "@anthropic-ai/sdk/helpers/beta/zod";
import * as z from "zod/v4";

import { accumulateHours } from "@/lib/payroll/hours";
import { DEFAULT_PAY_RULE, type AttendanceDay, type DayType } from "@/lib/payroll/types";
import type { createClient } from "@/lib/supabase/server";

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
 * DEFAULT_PAY_RULE is used for the overtime split rather than the real
 * site-specific `pay_rules` row, matching what the Reports screen already
 * does — see src/app/(app)/reports/page.tsx. This keeps the assistant's
 * numbers consistent with what a manager sees on that screen, even though
 * neither is the exact figure a payroll run would produce.
 */

function todayNote(): string {
  return `Today's date, in Pakistan Standard Time, is ${new Date().toISOString().slice(0, 10)}. Resolve relative phrases ("this month", "last week", "today") against this before calling any tool — every tool takes concrete YYYY-MM-DD dates, never relative words.`;
}

export function buildAssistantTools(supabase: SupabaseServerClient) {
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
        const { data: people } = await supabase
          .from("employee_directory")
          .select("id")
          .eq("department_id", departmentId);
        profileIds = (people ?? []).map((p) => p.id).filter((id): id is string => !!id);
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
        const { data: people } = await supabase
          .from("employee_directory")
          .select("id")
          .eq("department_id", departmentId);
        profileIds = (people ?? []).map((p) => p.id).filter((id): id is string => !!id);
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

      const ids = [...new Set(data.map((r) => r.profile_id).filter((id): id is string => !!id))];
      const { data: people } = await supabase
        .from("employee_directory")
        .select("id, full_name")
        .in("id", ids);
      const nameOf = new Map((people ?? []).map((p) => [p.id, p.full_name]));

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
      "Totals worked hours split into regular and overtime across a date range, optionally for one department. Use for 'overtime this month' or 'how many overtime hours in the folding department'. These are hours only, not rupee amounts — a payroll run is the source of truth for pay.",
    inputSchema: z.object({
      from: z.string().describe("Start date, YYYY-MM-DD, inclusive."),
      to: z.string().describe("End date, YYYY-MM-DD, inclusive."),
      departmentId: z.string().optional().describe("Restrict to one department's id."),
    }),
    run: async ({ from, to, departmentId }) => {
      let people: { id: string; duty_hours: number | null }[] | null = null;
      const peopleQuery = supabase
        .from("employee_directory")
        .select("id, requires_attendance")
        .eq("status", "active");
      const { data: directory } = departmentId
        ? await peopleQuery.eq("department_id", departmentId)
        : await peopleQuery;

      if (!directory || directory.length === 0) {
        return "No employees found, or you do not have access to this data.";
      }

      const ids = directory.map((p) => p.id).filter((id): id is string => !!id);
      const { data: dutyRows } = await supabase
        .from("profiles")
        .select("id, duty_hours")
        .in("id", ids);
      people = (dutyRows ?? []) as { id: string; duty_hours: number | null }[];
      const dutyOf = new Map(people.map((p) => [p.id, Number(p.duty_hours ?? 8)]));

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

  const getPayrollSummary = betaZodTool({
    name: "get_payroll_summary",
    description:
      "Totals for payroll periods overlapping a given month (gross, deductions, tax, net, headcount, status). Use for 'payroll cost this month' or 'what's the net payable for August'. Returns nothing if the caller lacks payroll.view — that means say plainly this cannot be answered, never estimate a figure.",
    inputSchema: z.object({
      month: z.string().describe("YYYY-MM, e.g. 2026-08."),
    }),
    run: async ({ month }) => {
      const from = `${month}-01`;
      const to = `${month}-31`;

      const { data } = await supabase
        .from("payroll_periods")
        .select(
          "label, period_start, period_end, status, headcount, total_gross, total_net, total_deductions, total_tax",
        )
        .lte("period_start", to)
        .gte("period_end", from);

      if (!data || data.length === 0) {
        return "No payroll period found for that month, or you do not have access to payroll data.";
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
      getAttendanceSummary,
      getLateCheckins,
      getOvertimeSummary,
      getLeaveBalance,
      getPayrollSummary,
    ],
    contextNote: todayNote(),
  };
}
