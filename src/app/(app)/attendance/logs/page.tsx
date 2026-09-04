import type { Metadata } from "next";
import Link from "next/link";
import { CalendarDays, Clock, ScrollText, TriangleAlert, Users } from "lucide-react";

import { ATTENDANCE_REFRESH_SECONDS, AutoRefresh } from "@/components/auto-refresh";
import { ExportButtons } from "@/components/export-buttons";
import { matchesPerson } from "@/lib/people/match";
import { Card, SectionTitle } from "@/components/ui-kit";
import { requireAnyPermission } from "@/lib/auth/session";
import {
  countWorkingDays,
  dailyRate,
  isSunday,
  overtimeRate,
  splitDayHours,
} from "@/lib/payroll/hours";
import {
  DEFAULT_PAY_RULE,
  type AttendanceDay,
  type DayType,
  type HourBuckets,
} from "@/lib/payroll/types";
import { selectInBatches } from "@/lib/supabase/in-batches";
import { createClient } from "@/lib/supabase/server";
import { formatHours, formatTime, todayInPakistan } from "@/lib/time";
import { cn } from "@/lib/utils";

import { ApproveRange } from "./approve-range";

export const metadata: Metadata = {
  title: { absolute: "Attendance Log | Rado Dyeing and Textile" },
  description: "Every check-in, check-out and the pay it produces, by person or department.",
};

export const dynamic = "force-dynamic";

/**
 * The audit trail behind a payslip.
 *
 * The live board answers "who is here now". This answers the question that
 * follows a disputed payslip — "which days did you count, and what did each one
 * pay" — and scales from one person to the whole factory.
 *
 * Two views, chosen by what is asked for rather than by a toggle: pick one
 * person and you get their days; pick departments and you get a row per person,
 * each linking through to their days. Nobody wants ten thousand day rows.
 *
 * Every figure is recomputed here from the same functions payroll uses rather
 * than read from stored columns, so this screen and the run cannot drift apart.
 */

/** The default window: the month so far. */
function defaultRange(): { from: string; to: string } {
  const today = todayInPakistan();
  return { from: `${today.slice(0, 7)}-01`, to: today };
}

const money = (value: number) =>
  value.toLocaleString("en-PK", { maximumFractionDigits: 0, minimumFractionDigits: 0 });

/**
 * One stored attendance day.
 *
 * Named rather than inferred from the query: the empty-cohort branch returns a
 * literal `[]`, which infers as `never[]` and makes every field below an error
 * that has nothing to do with the actual shape.
 */
interface DayRow {
  profile_id: string;
  work_date: string;
  first_in: string | null;
  last_out: string | null;
  regular_hours: number;
  day_type: DayType | null;
  status: string | null;
  minutes_late: number;
  is_late: boolean;
  is_manual: boolean;
  locked: boolean;
  approved_by: string | null;
  approved_at: string | null;
  hours_are_final: boolean;
}

/** One person's days, already split into the buckets payroll would pay. */
interface Summary {
  rows: DayRow[];
  asDays: AttendanceDay[];
  buckets: HourBuckets[];
  workingDays: number;
  overtime: number;
  clocked: number;
  late: number;
}

export default async function AttendanceLogPage({
  searchParams,
}: {
  searchParams: Promise<{
    from?: string;
    to?: string;
    person?: string;
    dept?: string | string[];
    q?: string;
  }>;
}) {
  const session = await requireAnyPermission(["attendance.view", "attendance.view.all"]);
  const params = await searchParams;
  const supabase = await createClient();

  const fallback = defaultRange();
  const from = params.from || fallback.from;
  const to = params.to || fallback.to;

  /*
   * Seeing anyone else's log is a separate capability from seeing your own.
   * A manager with plain attendance.view is held to their own record here;
   * the row-level policies enforce the same thing underneath, so this only
   * decides whether the filters are worth showing.
   */
  const canSeeEveryone = session.isSuperuser || session.permissions.has("attendance.view.all");
  const canApprove = session.permissions.has("attendance.approve");

  const selectedDepts = params.dept
    ? Array.isArray(params.dept)
      ? params.dept
      : [params.dept]
    : [];

  const [{ data: departments }, { data: staff }] = await Promise.all([
    supabase.from("departments").select("id, name").order("name"),
    supabase
      .from("profiles")
      .select(
        "id, full_name, employee_code, department_id, duty_hours, monthly_salary, worker_type, requires_attendance, flexible_hours",
      )
      .eq("status", "active")
      .order("full_name"),
  ]);

  const allPeople = staff ?? [];
  const deptName = new Map((departments ?? []).map((d) => [d.id, d.name]));

  // Without the wider permission the only log on offer is your own.
  const visible = canSeeEveryone ? allPeople : allPeople.filter((p) => p.id === session.userId);

  const byDept =
    selectedDepts.length > 0
      ? visible.filter((p) => p.department_id && selectedDepts.includes(p.department_id))
      : visible;

  const scoped = byDept.filter((p) => matchesPerson(p, params.q ?? ""));

  const personId = params.person || (canSeeEveryone ? "" : session.userId);
  const person = personId ? allPeople.find((p) => p.id === personId) : undefined;

  // One person → their days. Otherwise → a row per person in scope.
  const cohort = person ? [person] : scoped;
  const cohortIds = cohort.map((p) => p.id);

  const batched = await selectInBatches<DayRow>(
    cohortIds,
    (ids) =>
      supabase
        .from("attendance_days")
        .select(
          "profile_id, work_date, first_in, last_out, regular_hours, day_type, status, minutes_late, is_late, is_manual, locked, approved_by, approved_at, hours_are_final",
        )
        .in("profile_id", ids)
        .gte("work_date", from)
        .lte("work_date", to),
    `Could not read attendance for ${from} to ${to}`,
  );

  // Each batch comes back ordered within itself; the merged list still needs sorting.
  const days = batched.sort((a, b) => (a.work_date < b.work_date ? 1 : -1));

  const rule = DEFAULT_PAY_RULE;
  const daysInMonth = new Date(Number(from.slice(0, 4)), Number(from.slice(5, 7)), 0).getDate();

  const byProfile = new Map<string, DayRow[]>();
  for (const row of (days ?? []) as DayRow[]) {
    const list = byProfile.get(row.profile_id) ?? [];
    list.push(row);
    byProfile.set(row.profile_id, list);
  }

  /** Turns one person's stored days into the buckets payroll would produce. */
  function summarise(profileId: string, dutyHours: number): Summary {
    const rows = byProfile.get(profileId) ?? [];
    const asDays: AttendanceDay[] = rows.map((row) => ({
      workDate: row.work_date,
      dayType: (row.day_type ?? "workday") as DayType,
      hoursWorked: Number(row.regular_hours ?? 0),
      status: (row.status ?? "pending") as AttendanceDay["status"],
      minutesLate: row.minutes_late ?? 0,
      // Without this, splitDayHours() below rounds a day payroll already
      // floored a second time, and this screen's "buckets payroll would
      // produce" stop being that.
      hoursAreFinal: row.hours_are_final ?? false,
    }));

    const buckets = asDays.map((d) => splitDayHours(d, rule, dutyHours));

    return {
      rows,
      asDays,
      buckets,
      workingDays: countWorkingDays(asDays),
      overtime: buckets.reduce((total, b) => total + b.overtime, 0),
      clocked: rows.reduce((total, r) => total + Number(r.regular_hours ?? 0), 0),
      late: rows.filter((r) => r.is_late).length,
    };
  }

  /*
   * A log whose window reaches today is still filling up, so it refreshes on
   * the same half-minute the terminals are polled on and new punches appear
   * without anyone reloading. A window that ended in the past cannot change,
   * and re-rendering a closed month on a timer is pure load.
   */
  const showsToday = to >= todayInPakistan();

  return (
    <div className="space-y-5 pb-6">
      {showsToday ? <AutoRefresh seconds={ATTENDANCE_REFRESH_SECONDS} /> : null}

      <Card className="p-4 sm:p-6">
        <SectionTitle
          icon={ScrollText}
          title="Attendance log"
          subtitle={
            canSeeEveryone
              ? "Every punch and the pay it produces — one person, chosen departments, or everyone."
              : "Every punch of yours, and the pay it produces."
          }
          action={
            <div className="flex flex-wrap items-center gap-2">
              <ExportButtons kind="attendance" params={{ from, to, dept: selectedDepts[0] }} />
              <Link
                href="/attendance"
                className="rounded-xl bg-secondary px-4 py-2.5 text-sm font-semibold text-foreground transition-colors hover:text-primary"
              >
                Live board
              </Link>
            </div>
          }
        />

        {/* A plain GET form: the filters belong in the URL so a log can be
            linked to in a message about a disputed payslip. */}
        <form className="space-y-3">
          <div className="grid gap-3 sm:grid-cols-[1fr_1fr_9rem_9rem_auto]">
            <label className="block">
              <span className="text-xs font-semibold text-muted-foreground">Person</span>
              <select
                name="person"
                defaultValue={personId}
                disabled={!canSeeEveryone}
                className="mt-1 w-full rounded-2xl border border-input bg-background px-4 py-2.5 text-sm outline-none focus:border-primary disabled:opacity-60"
              >
                <option value="">
                  {selectedDepts.length > 0 ? "Everyone in the departments below" : "Everyone"}
                </option>
                {visible.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.full_name} · {p.employee_code}
                  </option>
                ))}
              </select>
            </label>
            <label className="block sm:col-span-1">
              <span className="text-xs font-semibold text-muted-foreground">Search</span>
              <input
                type="search"
                name="q"
                defaultValue={params.q ?? ""}
                placeholder="Name, code or CNIC"
                className="mt-1 w-full rounded-2xl border border-input bg-background px-4 py-2.5 text-sm outline-none focus:border-primary"
              />
            </label>
            <label className="block">
              <span className="text-xs font-semibold text-muted-foreground">From</span>
              <input
                type="date"
                name="from"
                defaultValue={from}
                className="mt-1 w-full rounded-2xl border border-input bg-background px-4 py-2.5 text-sm outline-none focus:border-primary"
              />
            </label>
            <label className="block">
              <span className="text-xs font-semibold text-muted-foreground">To</span>
              <input
                type="date"
                name="to"
                defaultValue={to}
                className="mt-1 w-full rounded-2xl border border-input bg-background px-4 py-2.5 text-sm outline-none focus:border-primary"
              />
            </label>
            <button
              type="submit"
              className="mt-[1.35rem] h-[2.7rem] rounded-2xl bg-charcoal px-5 text-sm font-bold text-charcoal-foreground transition-opacity hover:opacity-90"
            >
              Show
            </button>
          </div>

          {canSeeEveryone ? (
            <fieldset>
              <legend className="text-xs font-semibold text-muted-foreground">
                Departments — none ticked means every department
              </legend>
              {/* Checkboxes rather than a multi-select: picking four of
                  thirty-four with ctrl-click is a trap on a touch screen. */}
              <div className="mt-2 flex flex-wrap gap-1.5">
                {(departments ?? []).map((d) => {
                  const checked = selectedDepts.includes(d.id);
                  return (
                    /*
                     * The tick state is styled from the checkbox itself with
                     * peer-checked, not from the server-rendered value. Styling it
                     * from `checked` alone left the chip looking identical until the
                     * form was submitted, so ticking a department appeared to do
                     * nothing and the filter read as broken. `defaultChecked` still
                     * seeds the state from the URL on load.
                     */
                    <label key={d.id} className="cursor-pointer">
                      <input
                        type="checkbox"
                        name="dept"
                        value={d.id}
                        defaultChecked={checked}
                        className="peer sr-only"
                      />
                      <span
                        className={cn(
                          "block rounded-xl border px-3 py-1.5 text-xs font-semibold transition-colors",
                          "border-border bg-card text-muted-foreground hover:text-foreground",
                          "peer-checked:border-primary peer-checked:bg-primary/10 peer-checked:text-primary",
                          // The checkbox is visually hidden, so without this the
                          // chips cannot be navigated by keyboard.
                          "peer-focus-visible:ring-2 peer-focus-visible:ring-primary peer-focus-visible:ring-offset-1",
                        )}
                      >
                        {d.name}
                      </span>
                    </label>
                  );
                })}
              </div>
            </fieldset>
          ) : null}
        </form>
      </Card>

      {person ? (
        <PersonLog
          person={person}
          summary={summarise(person.id, Number(person.duty_hours ?? 8))}
          daysInMonth={daysInMonth}
          from={from}
          to={to}
          departmentName={person.department_id ? deptName.get(person.department_id) : undefined}
          canApprove={canApprove}
        />
      ) : (
        <Cohort
          people={cohort}
          summarise={summarise}
          deptName={deptName}
          daysInMonth={daysInMonth}
          from={from}
          to={to}
          selectedDepts={selectedDepts}
        />
      )}
    </div>
  );
}

/** A row per person, for a department or the whole factory. */
function Cohort({
  people,
  summarise,
  deptName,
  daysInMonth,
  from,
  to,
  selectedDepts,
}: {
  people: {
    id: string;
    full_name: string;
    employee_code: string;
    department_id: string | null;
    duty_hours: number;
    monthly_salary: number;
    worker_type: string;
  }[];
  summarise: (profileId: string, dutyHours: number) => Summary;
  deptName: Map<string, string>;
  daysInMonth: number;
  from: string;
  to: string;
  selectedDepts: string[];
}) {
  const rows = people.map((p) => {
    const s = summarise(p.id, Number(p.duty_hours ?? 8));
    const contractor = p.worker_type === "contractor";
    const perDay = contractor ? 0 : dailyRate(Number(p.monthly_salary ?? 0), daysInMonth);
    const perOt = contractor ? 0 : overtimeRate(Number(p.monthly_salary ?? 0), daysInMonth);

    return {
      person: p,
      ...s,
      contractor,
      earned: contractor
        ? Number(p.monthly_salary ?? 0)
        : s.workingDays * perDay + s.overtime * perOt,
    };
  });

  const totals = rows.reduce(
    (acc, r) => ({
      workingDays: acc.workingDays + r.workingDays,
      overtime: acc.overtime + r.overtime,
      late: acc.late + r.late,
      earned: acc.earned + r.earned,
    }),
    { workingDays: 0, overtime: 0, late: 0, earned: 0 },
  );

  return (
    <>
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Tile
          icon={Users}
          label="People"
          value={String(rows.length)}
          hint={
            selectedDepts.length > 0
              ? `${selectedDepts.length} department${selectedDepts.length === 1 ? "" : "s"}`
              : "Every department"
          }
        />
        <Tile
          icon={CalendarDays}
          label="Working days"
          value={String(totals.workingDays)}
          hint="Attended, not Sunday"
        />
        <Tile
          icon={Clock}
          label="Overtime hours"
          value={formatHours(totals.overtime)}
          hint="Capped at 4h a working day"
        />
        <Tile
          icon={TriangleAlert}
          label="Late arrivals"
          value={String(totals.late)}
          hint="Past the grace period"
        />
      </div>

      <Card className="p-0">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[44rem] text-sm">
            <thead>
              <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-muted-foreground">
                <th className="px-4 py-3 font-semibold">Person</th>
                <th className="px-4 py-3 font-semibold">Department</th>
                <th className="px-4 py-3 text-right font-semibold">Working days</th>
                <th className="px-4 py-3 text-right font-semibold">Hours</th>
                <th className="px-4 py-3 text-right font-semibold">Overtime</th>
                <th className="px-4 py-3 text-right font-semibold">Late</th>
                <th className="px-4 py-3 text-right font-semibold">Earned</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.person.id} className="border-b border-border/60 last:border-0">
                  <td className="px-4 py-3">
                    <Link
                      href={`/attendance/logs?person=${row.person.id}&from=${from}&to=${to}`}
                      className="font-semibold text-foreground hover:text-primary"
                    >
                      {row.person.full_name}
                    </Link>
                    <span className="ml-2 text-xs text-muted-foreground">
                      {row.person.employee_code}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-xs text-muted-foreground">
                    {row.person.department_id
                      ? (deptName.get(row.person.department_id) ?? "—")
                      : "—"}
                    {row.contractor ? (
                      <span className="ml-2 rounded-full bg-warning-soft px-2 py-0.5 text-[10px] font-bold uppercase text-warning">
                        Contract
                      </span>
                    ) : null}
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums">{row.workingDays}</td>
                  <td className="px-4 py-3 text-right tabular-nums">{formatHours(row.clocked)}</td>
                  <td
                    className={cn(
                      "px-4 py-3 text-right tabular-nums",
                      row.overtime > 0 && "font-semibold text-success",
                    )}
                  >
                    {row.overtime > 0 ? formatHours(row.overtime) : "—"}
                  </td>
                  <td
                    className={cn(
                      "px-4 py-3 text-right tabular-nums",
                      row.late > 0 && "font-semibold text-danger",
                    )}
                  >
                    {row.late || "—"}
                  </td>
                  <td className="px-4 py-3 text-right font-semibold tabular-nums">
                    Rs {money(row.earned)}
                  </td>
                </tr>
              ))}

              {rows.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-4 py-10 text-center text-sm text-muted-foreground">
                    Nobody matches these filters.
                  </td>
                </tr>
              ) : null}
            </tbody>
            {rows.length > 0 ? (
              <tfoot>
                <tr className="border-t border-border bg-secondary/60 font-bold">
                  <td className="px-4 py-3" colSpan={2}>
                    {rows.length} {rows.length === 1 ? "person" : "people"}
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums">{totals.workingDays}</td>
                  <td className="px-4 py-3" />
                  <td className="px-4 py-3 text-right tabular-nums">
                    {formatHours(totals.overtime)}
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums">{totals.late || "—"}</td>
                  <td className="px-4 py-3 text-right tabular-nums">Rs {money(totals.earned)}</td>
                </tr>
              </tfoot>
            ) : null}
          </table>
        </div>
      </Card>

      <p className="px-1 text-xs text-muted-foreground">
        Earned is base pay plus overtime, before deductions — a contractor&apos;s is their agreed
        amount. The payroll run recalculates all of it from the same figures.
      </p>
    </>
  );
}

/** One person, day by day. */
function PersonLog({
  person,
  summary,
  daysInMonth,
  from,
  to,
  departmentName,
  canApprove,
}: {
  person: {
    id: string;
    full_name: string;
    employee_code: string;
    duty_hours: number;
    monthly_salary: number;
    worker_type: string;
    requires_attendance: boolean;
    flexible_hours: boolean;
  };
  summary: Summary;
  daysInMonth: number;
  from: string;
  to: string;
  departmentName: string | undefined;
  canApprove: boolean;
}) {
  const dutyHours = Number(person.duty_hours ?? 8);
  const contractor = person.worker_type === "contractor";
  const perDay = dailyRate(Number(person.monthly_salary ?? 0), daysInMonth);
  const perOtHour = overtimeRate(Number(person.monthly_salary ?? 0), daysInMonth);

  return (
    <>
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Tile
          icon={CalendarDays}
          label="Working days"
          value={String(summary.workingDays)}
          hint="Attended, not Sunday"
        />
        <Tile
          icon={Clock}
          label="Hours clocked"
          value={formatHours(summary.clocked)}
          hint="Across every day shown"
        />
        <Tile
          icon={Clock}
          label="Overtime hours"
          value={formatHours(summary.overtime)}
          hint={`Beyond ${dutyHours}h, max 4 a day`}
        />
        <Tile
          icon={TriangleAlert}
          label="Late arrivals"
          value={String(summary.late)}
          hint={person.flexible_hours ? "Not tracked — flexible hours" : "Past the grace period"}
        />
      </div>

      <Card className="p-4 sm:p-5">
        <p className="text-sm font-bold text-foreground">
          {person.full_name}{" "}
          <span className="font-normal text-muted-foreground">
            · {person.employee_code}
            {departmentName ? ` · ${departmentName}` : ""}
          </span>
        </p>

        {contractor ? (
          <p className="mt-2 text-sm text-warning">
            Paid as a contractor. These hours are recorded so the invoice can be checked, but they
            do not price anything — the agreed amount is paid flat.
          </p>
        ) : !person.requires_attendance ? (
          <p className="mt-2 text-sm text-muted-foreground">
            Not paid from attendance. The contracted salary is paid in full, so these punches are a
            record of presence rather than the basis of the payslip.
          </p>
        ) : perDay > 0 ? (
          <>
            <p className="mt-2 text-sm text-muted-foreground">
              At <strong className="text-foreground">Rs {money(perDay)}</strong> a day and{" "}
              <strong className="text-foreground">Rs {money(perOtHour)}</strong> an overtime hour,
              the days below come to{" "}
              <strong className="text-foreground">
                Rs {money(summary.workingDays * perDay + summary.overtime * perOtHour)}
              </strong>{" "}
              before deductions.
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              {summary.workingDays} × {money(perDay)} + {formatHours(summary.overtime)} ×{" "}
              {money(perOtHour)}.
            </p>
          </>
        ) : null}

        {person.flexible_hours ? (
          <p className="mt-2 text-xs text-muted-foreground">
            No in or out time is enforced for this person, so they are never recorded late.
          </p>
        ) : null}

        {/* The payslip is the document this screen exists to justify, so it is
            downloadable from beside the days that produced it. */}
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <ExportButtons
            kind="payslip"
            params={{ person: person.id, from, to }}
            label="Payslip"
            formats={["pdf"]}
          />

          {canApprove ? (
            <ApproveRange
              profileId={person.id}
              from={from}
              to={to}
              approvedCount={summary.rows.filter((r) => r.approved_at).length}
              totalCount={summary.rows.length}
            />
          ) : null}
        </div>

        <Link
          href={`/attendance/logs?from=${from}&to=${to}`}
          className="mt-3 inline-block text-xs font-semibold text-primary hover:underline"
        >
          ← Back to everyone
        </Link>
      </Card>

      <Card className="p-0">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[48rem] text-sm">
            <thead>
              <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-muted-foreground">
                <th className="px-4 py-3 font-semibold">Date</th>
                <th className="px-4 py-3 font-semibold">In</th>
                <th className="px-4 py-3 font-semibold">Out</th>
                <th className="px-4 py-3 text-right font-semibold">Clocked</th>
                <th className="px-4 py-3 text-right font-semibold">Duty</th>
                <th className="px-4 py-3 text-right font-semibold">Overtime</th>
                <th className="px-4 py-3 text-right font-semibold">Late</th>
                <th className="px-4 py-3 font-semibold">Counts</th>
              </tr>
            </thead>
            <tbody>
              {summary.rows.map((row, index) => {
                const buckets = summary.buckets[index]!;
                const sunday = isSunday(row.work_date);
                const attended = row.status === "present" || row.status === "partial";
                const clocked = Number(row.regular_hours ?? 0);
                // Anything past duty + the ceiling is recorded but never paid.
                const unpaid = Math.max(0, clocked - buckets.regular - buckets.overtime);

                return (
                  <tr
                    key={row.work_date}
                    className={cn(
                      "border-b border-border/60 last:border-0",
                      sunday && "bg-secondary/60",
                    )}
                  >
                    <td className="px-4 py-3">
                      <span className="font-semibold text-foreground">{row.work_date}</span>
                      {sunday ? (
                        <span className="ml-2 rounded-full bg-warning-soft px-2 py-0.5 text-[10px] font-bold uppercase text-warning">
                          Sunday
                        </span>
                      ) : null}
                      {row.is_manual ? (
                        <span className="ml-2 rounded-full bg-secondary px-2 py-0.5 text-[10px] font-bold uppercase text-muted-foreground">
                          Edited
                        </span>
                      ) : null}
                      {row.approved_at ? (
                        <span className="ml-2 rounded-full bg-success-soft px-2 py-0.5 text-[10px] font-bold uppercase text-success">
                          Approved
                        </span>
                      ) : null}
                    </td>
                    <td className="px-4 py-3 tabular-nums">
                      {row.first_in ? formatTime(row.first_in) : "—"}
                    </td>
                    <td className="px-4 py-3 tabular-nums">
                      {row.last_out ? formatTime(row.last_out) : "—"}
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums">
                      {formatHours(clocked)}
                      {unpaid > 0 ? (
                        <span
                          className="ml-1.5 text-[10px] font-bold uppercase text-muted-foreground"
                          title="Past the daily overtime ceiling — recorded, not paid"
                        >
                          +{formatHours(unpaid)} unpaid
                        </span>
                      ) : null}
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums">
                      {formatHours(buckets.regular)}
                    </td>
                    <td
                      className={cn(
                        "px-4 py-3 text-right tabular-nums",
                        buckets.overtime > 0 && "font-semibold text-success",
                      )}
                    >
                      {buckets.overtime > 0 ? formatHours(buckets.overtime) : "—"}
                    </td>
                    <td
                      className={cn(
                        "px-4 py-3 text-right tabular-nums",
                        row.is_late && "font-semibold text-danger",
                      )}
                    >
                      {row.minutes_late ? `${row.minutes_late}m` : "—"}
                    </td>
                    <td className="px-4 py-3">
                      {attended && !sunday ? (
                        <span className="rounded-full bg-success-soft px-2.5 py-1 text-[10px] font-bold uppercase text-success">
                          1 day
                        </span>
                      ) : (
                        <span className="text-xs text-muted-foreground">
                          {sunday ? "overtime only" : row.status}
                        </span>
                      )}
                    </td>
                  </tr>
                );
              })}

              {summary.rows.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-4 py-10 text-center text-sm text-muted-foreground">
                    No attendance recorded between {from} and {to}.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </Card>
    </>
  );
}

function Tile({
  icon: Icon,
  label,
  value,
  hint,
}: {
  icon: typeof Clock;
  label: string;
  value: string;
  hint: string;
}) {
  return (
    <Card className="p-4">
      <div className="flex items-center gap-2 text-muted-foreground">
        <Icon className="size-4" />
        <span className="text-xs font-semibold uppercase tracking-wide">{label}</span>
      </div>
      <p className="mt-2 text-2xl font-bold tabular-nums text-foreground">{value}</p>
      <p className="mt-0.5 text-xs text-muted-foreground">{hint}</p>
    </Card>
  );
}
