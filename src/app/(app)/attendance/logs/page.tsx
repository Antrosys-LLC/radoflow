import type { ReactNode } from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft, CalendarDays, Clock, ScrollText, TriangleAlert, Users } from "lucide-react";

import { ATTENDANCE_REFRESH_SECONDS, AutoRefresh } from "@/components/auto-refresh";
import { ExportButtons } from "@/components/export-buttons";
import { Fill } from "@/components/fill";
import { Latin } from "@/components/latin";
import { matchesPerson } from "@/lib/people/match";
import { AskAbout } from "@/components/assistant/ask-about";
import { Card, SectionTitle } from "@/components/ui-kit";
import { requireAnyPermission } from "@/lib/auth/session";
import { dictionaryFor, type Dictionary } from "@/lib/i18n";
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
  type AttendanceStatus,
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
 * A stored `attendance_status` in the reader's language.
 *
 * All seven members are read from `status.attendance`, which is where every
 * other database enum's values live too. They used to be split across
 * `common` and this screen's own group, which left one enum wearing labels in
 * two shapes; the words were the same in all three languages, so they are now
 * one set.
 *
 * Typed `Record<AttendanceStatus, …>` so that adding a member to the enum is a
 * typecheck error here rather than a raw `special_leave` appearing in a cell.
 * An unrecognised value still renders as itself: a bare enum name is ugly, but
 * it is the truth, and a wrong label on an attendance day is not.
 */
function statusLabel(t: Dictionary, status: string | null): string {
  const labels: Record<AttendanceStatus, string> = t.status.attendance;

  const stored = status ?? "pending";
  return labels[stored as AttendanceStatus] ?? stored;
}

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
  const t = dictionaryFor(session.profile.language);
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
          title={t.logs.title}
          subtitle={canSeeEveryone ? t.logs.subtitleAll : t.logs.subtitleMine}
          action={
            <div className="flex flex-wrap items-center gap-2">
              <AskAbout
                label={`${from} – ${to}`}
                context={{
                  surface: "attendance-log",
                  subject: `${from} to ${to}`,
                  facts: { from, to, people: visible.length, days: days.length },
                }}
              />
              <ExportButtons kind="attendance" params={{ from, to, dept: selectedDepts[0] }} />
              <Link
                href="/attendance"
                className="rounded-xl bg-secondary px-4 py-2.5 text-sm font-semibold text-foreground transition-colors hover:text-primary"
              >
                {t.logs.liveBoard}
              </Link>
            </div>
          }
        />

        {/* A plain GET form: the filters belong in the URL so a log can be
            linked to in a message about a disputed payslip. */}
        <form className="space-y-3">
          <div className="grid gap-3 sm:grid-cols-[1fr_1fr_9rem_9rem_auto]">
            <label className="block">
              <span className="text-xs font-semibold text-muted-foreground">{t.common.person}</span>
              <select
                name="person"
                defaultValue={personId}
                disabled={!canSeeEveryone}
                className="mt-1 w-full rounded-2xl border border-input bg-background px-4 py-2.5 text-sm outline-none focus:border-primary disabled:opacity-60"
              >
                <option value="">
                  {selectedDepts.length > 0 ? t.logs.everyoneInDepartments : t.logs.everyone}
                </option>
                {visible.map((p) => (
                  /*
                   * `dir` and the class rather than `<Latin>`: an <option> may
                   * only contain text, so the <bdi> element cannot go inside
                   * one. This is the same guarantee spelt out as attributes —
                   * without it a right-to-left page can show `1042-RD` for the
                   * code `RD-1042` in the very list used to pick a person.
                   */
                  <option key={p.id} value={p.id} dir="ltr" className="font-latin">
                    {p.full_name} · {p.employee_code}
                  </option>
                ))}
              </select>
            </label>
            <label className="block sm:col-span-1">
              <span className="text-xs font-semibold text-muted-foreground">{t.common.search}</span>
              <input
                type="search"
                name="q"
                defaultValue={params.q ?? ""}
                placeholder={t.common.searchPlaceholder}
                className="mt-1 w-full rounded-2xl border border-input bg-background px-4 py-2.5 text-sm outline-none focus:border-primary"
              />
            </label>
            <label className="block">
              <span className="text-xs font-semibold text-muted-foreground">{t.logs.from}</span>
              <input
                type="date"
                name="from"
                defaultValue={from}
                className="mt-1 w-full rounded-2xl border border-input bg-background px-4 py-2.5 text-sm outline-none focus:border-primary"
              />
            </label>
            <label className="block">
              <span className="text-xs font-semibold text-muted-foreground">{t.logs.to}</span>
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
              {t.common.show}
            </button>
          </div>

          {canSeeEveryone ? (
            <fieldset>
              <legend className="text-xs font-semibold text-muted-foreground">
                {t.logs.departmentsHint}
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
                        {/* A department name is a Latin string the office
                            typed — `Auto 01`, `Zafar Nug Packing` — so it is
                            isolated like every other stored value on this
                            screen, and like the person names in the
                            `<option>` list above. Left bare it would be set
                            in Nastaliq and left to the paragraph's direction,
                            which is the reordering this wave exists to
                            prevent. */}
                        <Latin>{d.name}</Latin>
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
          t={t}
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
          t={t}
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
  t,
  people,
  summarise,
  deptName,
  daysInMonth,
  from,
  to,
  selectedDepts,
}: {
  t: Dictionary;
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
          label={t.logs.people}
          value={rows.length}
          hint={
            selectedDepts.length > 0 ? (
              <Fill
                template={
                  selectedDepts.length === 1 ? t.logs.departmentCountOne : t.logs.departmentCount
                }
                values={{ count: selectedDepts.length }}
              />
            ) : (
              t.common.everyDepartment
            )
          }
        />
        <Tile
          icon={CalendarDays}
          label={t.logs.workingDays}
          value={totals.workingDays}
          hint={t.logs.attendedNotSunday}
        />
        <Tile
          icon={Clock}
          label={t.logs.overtimeHours}
          value={formatHours(totals.overtime)}
          hint={t.logs.overtimeCap}
        />
        <Tile
          icon={TriangleAlert}
          label={t.logs.lateArrivals}
          value={totals.late}
          hint={t.logs.pastGrace}
        />
      </div>

      <Card className="p-0">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[44rem] text-sm">
            <thead>
              {/* Column alignment is reading flow: the figures sit at the end
                  of the line, which is the right in English and the left in
                  Urdu, so every one of these is logical rather than physical. */}
              <tr className="border-b border-border text-start text-xs uppercase tracking-wide text-muted-foreground">
                <th className="px-4 py-3 font-semibold">{t.common.person}</th>
                <th className="px-4 py-3 font-semibold">{t.common.department}</th>
                <th className="px-4 py-3 text-end font-semibold">{t.logs.workingDays}</th>
                <th className="px-4 py-3 text-end font-semibold">{t.common.hours}</th>
                <th className="px-4 py-3 text-end font-semibold">{t.logs.overtime}</th>
                <th className="px-4 py-3 text-end font-semibold">{t.common.late}</th>
                <th className="px-4 py-3 text-end font-semibold">{t.logs.earned}</th>
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
                      <Latin>{row.person.full_name}</Latin>
                    </Link>
                    <span className="ms-2 text-xs text-muted-foreground">
                      <Latin>{row.person.employee_code}</Latin>
                    </span>
                  </td>
                  <td className="px-4 py-3 text-xs text-muted-foreground">
                    {/* The department name is data the office typed, so it
                        renders as stored — but isolated, like the chips in
                        the filter above and every other stored value here. */}
                    {row.person.department_id && deptName.get(row.person.department_id) ? (
                      <Latin>{deptName.get(row.person.department_id)}</Latin>
                    ) : (
                      "—"
                    )}
                    {row.contractor ? (
                      <span className="ms-2 rounded-full bg-warning-soft px-2 py-0.5 text-[10px] font-bold uppercase text-warning">
                        {t.logs.contract}
                      </span>
                    ) : null}
                  </td>
                  <td className="px-4 py-3 text-end tabular-nums">
                    <Latin>{row.workingDays}</Latin>
                  </td>
                  <td className="px-4 py-3 text-end tabular-nums">
                    <Latin>{formatHours(row.clocked)}</Latin>
                  </td>
                  <td
                    className={cn(
                      "px-4 py-3 text-end tabular-nums",
                      row.overtime > 0 && "font-semibold text-success",
                    )}
                  >
                    {row.overtime > 0 ? <Latin>{formatHours(row.overtime)}</Latin> : "—"}
                  </td>
                  <td
                    className={cn(
                      "px-4 py-3 text-end tabular-nums",
                      row.late > 0 && "font-semibold text-danger",
                    )}
                  >
                    {row.late > 0 ? <Latin>{row.late}</Latin> : "—"}
                  </td>
                  <td className="px-4 py-3 text-end font-semibold tabular-nums">
                    <Latin>Rs {money(row.earned)}</Latin>
                  </td>
                </tr>
              ))}

              {rows.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-4 py-10 text-center text-sm text-muted-foreground">
                    {t.common.nobodyMatches}
                  </td>
                </tr>
              ) : null}
            </tbody>
            {rows.length > 0 ? (
              <tfoot>
                <tr className="border-t border-border bg-secondary/60 font-bold">
                  <td className="px-4 py-3" colSpan={2}>
                    <Fill
                      template={rows.length === 1 ? t.logs.peopleCountOne : t.logs.peopleCount}
                      values={{ count: rows.length }}
                    />
                  </td>
                  <td className="px-4 py-3 text-end tabular-nums">
                    <Latin>{totals.workingDays}</Latin>
                  </td>
                  <td className="px-4 py-3" />
                  <td className="px-4 py-3 text-end tabular-nums">
                    <Latin>{formatHours(totals.overtime)}</Latin>
                  </td>
                  <td className="px-4 py-3 text-end tabular-nums">
                    {totals.late > 0 ? <Latin>{totals.late}</Latin> : "—"}
                  </td>
                  <td className="px-4 py-3 text-end tabular-nums">
                    <Latin>Rs {money(totals.earned)}</Latin>
                  </td>
                </tr>
              </tfoot>
            ) : null}
          </table>
        </div>
      </Card>

      <p className="px-1 text-xs text-muted-foreground">{t.logs.earnedNote}</p>
    </>
  );
}

/** One person, day by day. */
function PersonLog({
  t,
  person,
  summary,
  daysInMonth,
  from,
  to,
  departmentName,
  canApprove,
}: {
  t: Dictionary;
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
          label={t.logs.workingDays}
          value={summary.workingDays}
          hint={t.logs.attendedNotSunday}
        />
        <Tile
          icon={Clock}
          label={t.logs.hoursClocked}
          value={formatHours(summary.clocked)}
          hint={t.logs.acrossEveryDay}
        />
        <Tile
          icon={Clock}
          label={t.logs.overtimeHours}
          value={formatHours(summary.overtime)}
          hint={<Fill template={t.logs.overtimeBeyond} values={{ hours: `${dutyHours}h` }} />}
        />
        <Tile
          icon={TriangleAlert}
          label={t.logs.lateArrivals}
          value={summary.late}
          hint={person.flexible_hours ? t.logs.notTrackedFlexible : t.logs.pastGrace}
        />
      </div>

      <Card className="p-4 sm:p-5">
        <p className="text-sm font-bold text-foreground">
          <Latin>{person.full_name}</Latin>{" "}
          <span className="font-normal text-muted-foreground">
            · <Latin>{person.employee_code}</Latin>
            {/* The department name is data the office typed, so — like in
                the cohort table — it renders as stored, untranslated, and
                isolated so the paragraph cannot reorder it. */}
            {departmentName ? (
              <>
                {" · "}
                <Latin>{departmentName}</Latin>
              </>
            ) : null}
          </span>
        </p>

        {contractor ? (
          <p className="mt-2 text-sm text-warning">{t.logs.contractorNote}</p>
        ) : !person.requires_attendance ? (
          <p className="mt-2 text-sm text-muted-foreground">{t.logs.notPaidFromAttendance}</p>
        ) : perDay > 0 ? (
          <>
            <p className="mt-2 text-sm text-muted-foreground">
              <Fill
                template={t.logs.rateSentence}
                values={{
                  perDay: <strong className="text-foreground">Rs {money(perDay)}</strong>,
                  perHour: <strong className="text-foreground">Rs {money(perOtHour)}</strong>,
                  total: (
                    <strong className="text-foreground">
                      Rs {money(summary.workingDays * perDay + summary.overtime * perOtHour)}
                    </strong>
                  ),
                }}
              />
            </p>
            {/* The arithmetic behind the sentence above — every character in
                it is a figure or a mathematical symbol, so the whole line is
                one Latin run rather than four separate wraps. */}
            <p className="mt-1 text-xs text-muted-foreground">
              <Latin>
                {summary.workingDays} × {money(perDay)} + {formatHours(summary.overtime)} ×{" "}
                {money(perOtHour)}.
              </Latin>
            </p>
          </>
        ) : null}

        {person.flexible_hours ? (
          <p className="mt-2 text-xs text-muted-foreground">{t.logs.flexibleNote}</p>
        ) : null}

        {/* The payslip is the document this screen exists to justify, so it is
            downloadable from beside the days that produced it. */}
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <ExportButtons
            kind="payslip"
            params={{ person: person.id, from, to }}
            label={t.logs.payslip}
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
          className="mt-3 inline-flex items-center gap-1.5 text-xs font-semibold text-primary hover:underline"
        >
          {/* "Back" is a direction, so the arrow turns round with the page. */}
          <ArrowLeft className="size-3 rtl-flip" />
          {t.logs.backToEveryone}
        </Link>
      </Card>

      <Card className="p-0">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[48rem] text-sm">
            <thead>
              {/* Column alignment is reading flow, as in the cohort table
                  above: figures sit at the end of the line, logical rather
                  than physical. */}
              <tr className="border-b border-border text-start text-xs uppercase tracking-wide text-muted-foreground">
                <th className="px-4 py-3 font-semibold">{t.common.date}</th>
                <th className="px-4 py-3 font-semibold">{t.common.checkedIn}</th>
                <th className="px-4 py-3 font-semibold">{t.common.checkedOut}</th>
                <th className="px-4 py-3 text-end font-semibold">{t.logs.clocked}</th>
                <th className="px-4 py-3 text-end font-semibold">{t.logs.duty}</th>
                <th className="px-4 py-3 text-end font-semibold">{t.logs.overtime}</th>
                <th className="px-4 py-3 text-end font-semibold">{t.common.late}</th>
                <th className="px-4 py-3 font-semibold">{t.logs.counts}</th>
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
                      <span className="font-semibold text-foreground">
                        <Latin>{row.work_date}</Latin>
                      </span>
                      {sunday ? (
                        <span className="ms-2 rounded-full bg-warning-soft px-2 py-0.5 text-[10px] font-bold uppercase text-warning">
                          {t.logs.sunday}
                        </span>
                      ) : null}
                      {row.is_manual ? (
                        <span className="ms-2 rounded-full bg-secondary px-2 py-0.5 text-[10px] font-bold uppercase text-muted-foreground">
                          {t.logs.edited}
                        </span>
                      ) : null}
                      {row.approved_at ? (
                        <span className="ms-2 rounded-full bg-success-soft px-2 py-0.5 text-[10px] font-bold uppercase text-success">
                          {t.logs.approved}
                        </span>
                      ) : null}
                    </td>
                    <td className="px-4 py-3 tabular-nums">
                      {row.first_in ? <Latin>{formatTime(row.first_in)}</Latin> : "—"}
                    </td>
                    <td className="px-4 py-3 tabular-nums">
                      {row.last_out ? <Latin>{formatTime(row.last_out)}</Latin> : "—"}
                    </td>
                    <td className="px-4 py-3 text-end tabular-nums">
                      <Latin>{formatHours(clocked)}</Latin>
                      {unpaid > 0 ? (
                        <span
                          className="ms-1.5 text-[10px] font-bold uppercase text-muted-foreground"
                          title={t.logs.unpaidHint}
                        >
                          {/* The plus belongs to the figure, not to the
                              sentence. A plus sign is bidi-neutral, so left
                              outside the isolated run its position is decided
                              by the paragraph, and `+2.00` typesets as
                              `2.00 +` in Urdu — the same mechanism that turns
                              `RD-1042` into `1042-RD`. Passed as part of the
                              slot value, it goes through `<Latin>` with its
                              number, as one unit. */}
                          <Fill
                            template={t.logs.unpaidHours}
                            values={{ hours: `+${formatHours(unpaid)}` }}
                          />
                        </span>
                      ) : null}
                    </td>
                    <td className="px-4 py-3 text-end tabular-nums">
                      <Latin>{formatHours(buckets.regular)}</Latin>
                    </td>
                    <td
                      className={cn(
                        "px-4 py-3 text-end tabular-nums",
                        buckets.overtime > 0 && "font-semibold text-success",
                      )}
                    >
                      {buckets.overtime > 0 ? <Latin>{formatHours(buckets.overtime)}</Latin> : "—"}
                    </td>
                    <td
                      className={cn(
                        "px-4 py-3 text-end tabular-nums",
                        row.is_late && "font-semibold text-danger",
                      )}
                    >
                      {row.minutes_late ? <Latin>{row.minutes_late}m</Latin> : "—"}
                    </td>
                    <td className="px-4 py-3">
                      {attended && !sunday ? (
                        <span className="rounded-full bg-success-soft px-2.5 py-1 text-[10px] font-bold uppercase text-success">
                          <Fill template={t.logs.countsDay} values={{ count: 1 }} />
                        </span>
                      ) : (
                        <span className="text-xs text-muted-foreground">
                          {sunday ? t.logs.overtimeOnly : statusLabel(t, row.status)}
                        </span>
                      )}
                    </td>
                  </tr>
                );
              })}

              {summary.rows.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-4 py-10 text-center text-sm text-muted-foreground">
                    <Fill template={t.logs.noAttendanceBetween} values={{ from, to }} />
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
  value: ReactNode;
  hint: ReactNode;
}) {
  return (
    <Card className="p-4">
      <div className="flex items-center gap-2 text-muted-foreground">
        <Icon className="size-4" />
        <span className="text-xs font-semibold uppercase tracking-wide">{label}</span>
      </div>
      {/* `value` is always a figure — a count, a total, a formatted hour
          figure — so it is wrapped here, once, rather than at each of the
          eight call sites. */}
      <p className="mt-2 text-2xl font-bold tabular-nums text-foreground">
        <Latin>{value}</Latin>
      </p>
      <p className="mt-0.5 text-xs text-muted-foreground">{hint}</p>
    </Card>
  );
}
