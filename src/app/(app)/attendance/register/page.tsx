import type { Metadata } from "next";
import { CalendarDays, Clock, LogIn, LogOut, TriangleAlert, UserCheck, UserX } from "lucide-react";

import { ATTENDANCE_REFRESH_SECONDS, AutoRefresh } from "@/components/auto-refresh";
import { Fill } from "@/components/fill";
import { Latin } from "@/components/latin";
import { Avatar, Card, SectionTitle } from "@/components/ui-kit";
import { requireAnyPermission } from "@/lib/auth/session";
import { dictionaryFor, type Dictionary } from "@/lib/i18n";
import {
  buildRegister,
  summarise,
  type RegisterDay,
  type RegisterPerson,
  type RegisterState,
} from "@/lib/attendance/register";
import { matchesPerson } from "@/lib/people/match";
import { selectInBatches } from "@/lib/supabase/in-batches";
import { createClient } from "@/lib/supabase/server";
import { formatHours, formatTime, todayInPakistan } from "@/lib/time";
import { cn } from "@/lib/utils";

export const metadata: Metadata = {
  title: { absolute: "Check In / Out | Rado Dyeing and Textile" },
  description: "Every person's check-in and check-out for a single day.",
};

export const dynamic = "force-dynamic";

/**
 * The daily register.
 *
 * Deliberately the whole roster for one day, not a list of punches: the rows
 * worth acting on are the empty ones, and a list built from attendance rows
 * cannot show a person who never arrived. The live board answers "who is here
 * now" and the attendance log answers "what did this pay" — this answers the
 * question asked at the end of a shift.
 */

/**
 * The badge colour for each state, and only the colour.
 *
 * The words are read from the dictionary at render time instead: a
 * module-level constant is built once for the process and cannot know which
 * language this particular request is being drawn in.
 */
const STATE_TONE: Record<RegisterState, string> = {
  present: "bg-success-soft text-success",
  working: "bg-warning-soft text-warning",
  absent: "bg-danger-soft text-danger",
  not_required: "bg-secondary text-muted-foreground",
};

/**
 * A register state in the reader's language.
 *
 * Two of the four are `attendance_status` members — `present` and `absent` —
 * so they are read from `status.attendance`, where the database enum's labels
 * live, rather than repeated in this screen's group. The other two are states
 * this screen derives and no column stores.
 *
 * Typed `Record<RegisterState, …>` so that adding a state to the union is a
 * typecheck error here rather than a blank badge found on the floor.
 */
function stateLabel(t: Dictionary, state: RegisterState): string {
  const labels: Record<RegisterState, string> = {
    present: t.status.attendance.present,
    working: t.register.stillIn,
    absent: t.status.attendance.absent,
    not_required: t.register.notRequired,
  };
  return labels[state];
}

export default async function RegisterPage({
  searchParams,
}: {
  searchParams: Promise<{ date?: string; q?: string; dept?: string }>;
}) {
  const session = await requireAnyPermission(["attendance.view", "attendance.view.all"]);
  const t = dictionaryFor(session.profile.language);
  const params = await searchParams;
  const supabase = await createClient();

  const date = params.date || todayInPakistan();
  const canSeeEveryone = session.isSuperuser || session.permissions.has("attendance.view.all");

  const [{ data: departments }, { data: staff }] = await Promise.all([
    supabase.from("departments").select("id, name").order("name"),
    supabase
      .from("profiles")
      .select("id, full_name, employee_code, department_id, requires_attendance")
      .eq("status", "active")
      .order("full_name"),
  ]);

  const deptName = new Map((departments ?? []).map((d) => [d.id, d.name]));

  // Without the wider permission the only row on offer is your own. The
  // row-level policies enforce this underneath too; this decides what to draw.
  const visible = (staff ?? []).filter((p) => canSeeEveryone || p.id === session.userId);
  const byDept = params.dept ? visible.filter((p) => p.department_id === params.dept) : visible;
  const scoped = byDept.filter((p) => matchesPerson(p, params.q ?? ""));

  const people: RegisterPerson[] = scoped.map((p) => ({
    id: p.id,
    fullName: p.full_name,
    employeeCode: p.employee_code,
    department: p.department_id ? (deptName.get(p.department_id) ?? null) : null,
    requiresAttendance: p.requires_attendance,
  }));

  const dayRows = await selectInBatches(
    people.map((p) => p.id),
    (ids) =>
      supabase
        .from("attendance_days")
        .select(
          "profile_id, first_in, last_out, regular_hours, ot_hours, weekend_hours, holiday_hours, minutes_late, is_late",
        )
        .eq("work_date", date)
        .in("profile_id", ids),
    `Could not read attendance for ${date}`,
  );

  const days: RegisterDay[] = (dayRows ?? []).map((row) => ({
    profileId: row.profile_id,
    firstIn: row.first_in,
    lastOut: row.last_out,
    // Every bucket, not just regular: a Sunday shift is still hours worked.
    hoursWorked:
      Number(row.regular_hours ?? 0) +
      Number(row.ot_hours ?? 0) +
      Number(row.weekend_hours ?? 0) +
      Number(row.holiday_hours ?? 0),
    minutesLate: Number(row.minutes_late ?? 0),
    isLate: Boolean(row.is_late),
  }));

  const rows = buildRegister(people, days);
  const totals = summarise(rows);
  const isToday = date === todayInPakistan();

  return (
    <div className="space-y-5 pb-6">
      {/* Only today's register changes under the reader; a past date is settled. */}
      {isToday ? <AutoRefresh seconds={ATTENDANCE_REFRESH_SECONDS} /> : null}

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Tile
          icon={UserCheck}
          label={t.status.attendance.present}
          value={totals.present + totals.working}
          tone="text-success"
        />
        <Tile icon={Clock} label={t.register.stillIn} value={totals.working} tone="text-warning" />
        <Tile
          icon={UserX}
          label={t.status.attendance.absent}
          value={totals.absent}
          tone="text-danger"
        />
        <Tile icon={TriangleAlert} label={t.common.late} value={totals.late} tone="text-warning" />
      </div>

      <Card>
        <SectionTitle
          icon={CalendarDays}
          title={t.register.title}
          subtitle={
            isToday ? (
              /*
               * The interval is a slot rather than a number written into the
               * sentence: it is set by `ATTENDANCE_REFRESH_SECONDS`, and the
               * English promised fifteen seconds long after the timer had been
               * moved to thirty.
               */
              <Fill
                template={t.register.subtitleToday}
                values={{ seconds: ATTENDANCE_REFRESH_SECONDS }}
              />
            ) : (
              t.register.subtitleSettled
            )
          }
        />

        <form className="mt-4 grid gap-3 sm:grid-cols-[11rem_1fr_12rem_auto]">
          <label className="block">
            <span className="text-xs font-semibold text-muted-foreground">{t.common.date}</span>
            <input
              type="date"
              name="date"
              defaultValue={date}
              className="mt-1 w-full rounded-2xl border border-input bg-background px-4 py-2.5 text-sm outline-none focus:border-primary"
            />
          </label>
          <label className="block">
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
            <span className="text-xs font-semibold text-muted-foreground">
              {t.common.department}
            </span>
            <select
              name="dept"
              defaultValue={params.dept ?? ""}
              disabled={!canSeeEveryone}
              className="mt-1 w-full rounded-2xl border border-input bg-background px-4 py-2.5 text-sm outline-none focus:border-primary disabled:opacity-60"
            >
              <option value="">{t.common.everyDepartment}</option>
              {(departments ?? []).map((d) => (
                /*
                 * `dir` and the class rather than `<Latin>`: an <option> may
                 * only contain text, so the <bdi> element cannot go inside one.
                 * A department name is a name — it is not translated, and it is
                 * not to be reordered or set in Nastaliq either.
                 */
                <option key={d.id} value={d.id} dir="ltr" className="font-latin">
                  {d.name}
                </option>
              ))}
            </select>
          </label>
          <button
            type="submit"
            className="mt-[1.35rem] h-[2.7rem] rounded-2xl bg-charcoal px-5 text-sm font-bold text-charcoal-foreground transition-opacity hover:opacity-90"
          >
            {t.common.show}
          </button>
        </form>

        <p className="mt-3 text-xs text-muted-foreground">
          <Fill
            template={rows.length === 1 ? t.register.showingOne : t.register.showing}
            values={{ count: rows.length, expected: totals.expected }}
          />
        </p>

        {rows.length === 0 ? (
          <p className="mt-6 rounded-2xl bg-secondary px-4 py-6 text-center text-sm text-muted-foreground">
            {t.common.nobodyMatches}
          </p>
        ) : (
          <div className="mt-4 overflow-x-auto">
            <table className="w-full min-w-[46rem] border-collapse text-sm">
              <thead>
                <tr className="border-b border-border text-start text-xs uppercase tracking-wide text-muted-foreground">
                  <th className="pb-2 pe-3 font-semibold">{t.common.person}</th>
                  <th className="pb-2 pe-3 font-semibold">{t.common.department}</th>
                  <th className="pb-2 pe-3 font-semibold">{t.register.checkIn}</th>
                  <th className="pb-2 pe-3 font-semibold">{t.register.checkOut}</th>
                  <th className="pb-2 pe-3 text-end font-semibold">{t.common.hours}</th>
                  <th className="pb-2 font-semibold">{t.common.status}</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.person.id} className="border-b border-border/60 last:border-0">
                    <td className="py-2.5 pe-3">
                      <div className="flex items-center gap-2.5">
                        <Avatar name={row.person.fullName} />
                        <div className="min-w-0">
                          <p className="truncate font-semibold text-foreground">
                            <Latin>{row.person.fullName}</Latin>
                          </p>
                          <p className="text-xs text-muted-foreground">
                            <Latin>{row.person.employeeCode}</Latin>
                          </p>
                        </div>
                      </div>
                    </td>
                    <td className="py-2.5 pe-3 text-muted-foreground">
                      {row.person.department ? <Latin>{row.person.department}</Latin> : "—"}
                    </td>
                    <td className="py-2.5 pe-3">
                      {row.checkIn ? (
                        <span className="inline-flex items-center gap-1.5 font-medium tabular-nums text-foreground">
                          <LogIn className="h-3.5 w-3.5 text-success" aria-hidden />
                          <Latin>{formatTime(row.checkIn)}</Latin>
                        </span>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </td>
                    <td className="py-2.5 pe-3">
                      {row.checkOut ? (
                        <span className="inline-flex items-center gap-1.5 font-medium tabular-nums text-foreground">
                          <LogOut className="h-3.5 w-3.5 text-muted-foreground" aria-hidden />
                          <Latin>{formatTime(row.checkOut)}</Latin>
                        </span>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </td>
                    <td className="py-2.5 pe-3 text-end font-semibold tabular-nums text-foreground">
                      {row.hours > 0 ? <Latin>{formatHours(row.hours)}</Latin> : "—"}
                    </td>
                    <td className="py-2.5">
                      <span
                        className={cn(
                          "inline-block rounded-full px-2.5 py-1 text-xs font-bold",
                          STATE_TONE[row.state],
                        )}
                      >
                        {stateLabel(t, row.state)}
                      </span>
                      {row.isLate ? (
                        <span className="ms-1.5 text-xs font-semibold text-warning">
                          <Fill
                            template={t.common.minutesLate}
                            values={{ minutes: row.minutesLate }}
                          />
                        </span>
                      ) : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}

function Tile({
  icon: Icon,
  label,
  value,
  tone,
}: {
  icon: typeof UserCheck;
  label: string;
  value: number;
  tone: string;
}) {
  return (
    <Card className="flex items-center gap-3">
      <Icon className={cn("h-5 w-5", tone)} aria-hidden />
      <div>
        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          {label}
        </p>
        {/* Always a headcount, so it is wrapped here once rather than at each
            of the four call sites. */}
        <p className="text-xl font-bold tabular-nums text-foreground">
          <Latin>{value}</Latin>
        </p>
      </div>
    </Card>
  );
}
