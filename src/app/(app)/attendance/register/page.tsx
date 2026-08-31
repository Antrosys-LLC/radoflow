import type { Metadata } from "next";
import { CalendarDays, Clock, LogIn, LogOut, TriangleAlert, UserCheck, UserX } from "lucide-react";

import { AutoRefresh } from "@/components/auto-refresh";
import { Avatar, Card, SectionTitle } from "@/components/ui-kit";
import { requireAnyPermission } from "@/lib/auth/session";
import {
  buildRegister,
  summarise,
  type RegisterDay,
  type RegisterPerson,
  type RegisterState,
} from "@/lib/attendance/register";
import { matchesPerson } from "@/lib/people/match";
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

const STATE_META: Record<RegisterState, { label: string; tone: string }> = {
  present: { label: "Present", tone: "bg-success-soft text-success" },
  working: { label: "Still in", tone: "bg-warning-soft text-warning" },
  absent: { label: "Absent", tone: "bg-danger-soft text-danger" },
  not_required: { label: "Not required", tone: "bg-secondary text-muted-foreground" },
};

export default async function RegisterPage({
  searchParams,
}: {
  searchParams: Promise<{ date?: string; q?: string; dept?: string }>;
}) {
  const session = await requireAnyPermission(["attendance.view", "attendance.view.all"]);
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

  const { data: dayRows } =
    people.length > 0
      ? await supabase
          .from("attendance_days")
          .select(
            "profile_id, first_in, last_out, regular_hours, ot_hours, weekend_hours, holiday_hours, minutes_late, is_late",
          )
          .eq("work_date", date)
          .in(
            "profile_id",
            people.map((p) => p.id),
          )
      : { data: [] };

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
      {isToday ? <AutoRefresh seconds={15} /> : null}

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Tile
          icon={UserCheck}
          label="Present"
          value={totals.present + totals.working}
          tone="text-success"
        />
        <Tile icon={Clock} label="Still in" value={totals.working} tone="text-warning" />
        <Tile icon={UserX} label="Absent" value={totals.absent} tone="text-danger" />
        <Tile icon={TriangleAlert} label="Late" value={totals.late} tone="text-warning" />
      </div>

      <Card>
        <SectionTitle
          icon={CalendarDays}
          title="Check in / check out"
          subtitle={
            isToday
              ? "Today, refreshing on its own every 15 seconds"
              : "A settled day — figures will not change"
          }
        />

        <form className="mt-4 grid gap-3 sm:grid-cols-[11rem_1fr_12rem_auto]">
          <label className="block">
            <span className="text-xs font-semibold text-muted-foreground">Date</span>
            <input
              type="date"
              name="date"
              defaultValue={date}
              className="mt-1 w-full rounded-2xl border border-input bg-background px-4 py-2.5 text-sm outline-none focus:border-primary"
            />
          </label>
          <label className="block">
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
            <span className="text-xs font-semibold text-muted-foreground">Department</span>
            <select
              name="dept"
              defaultValue={params.dept ?? ""}
              disabled={!canSeeEveryone}
              className="mt-1 w-full rounded-2xl border border-input bg-background px-4 py-2.5 text-sm outline-none focus:border-primary disabled:opacity-60"
            >
              <option value="">Every department</option>
              {(departments ?? []).map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name}
                </option>
              ))}
            </select>
          </label>
          <button
            type="submit"
            className="mt-[1.35rem] h-[2.7rem] rounded-2xl bg-charcoal px-5 text-sm font-bold text-charcoal-foreground transition-opacity hover:opacity-90"
          >
            Show
          </button>
        </form>

        <p className="mt-3 text-xs text-muted-foreground">
          Showing {rows.length} {rows.length === 1 ? "person" : "people"} · {totals.expected}{" "}
          expected to attend
        </p>

        {rows.length === 0 ? (
          <p className="mt-6 rounded-2xl bg-secondary px-4 py-6 text-center text-sm text-muted-foreground">
            Nobody matches this search.
          </p>
        ) : (
          <div className="mt-4 overflow-x-auto">
            <table className="w-full min-w-[46rem] border-collapse text-sm">
              <thead>
                <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-muted-foreground">
                  <th className="pb-2 pr-3 font-semibold">Person</th>
                  <th className="pb-2 pr-3 font-semibold">Department</th>
                  <th className="pb-2 pr-3 font-semibold">Check in</th>
                  <th className="pb-2 pr-3 font-semibold">Check out</th>
                  <th className="pb-2 pr-3 text-right font-semibold">Hours</th>
                  <th className="pb-2 font-semibold">Status</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => {
                  const meta = STATE_META[row.state];
                  return (
                    <tr key={row.person.id} className="border-b border-border/60 last:border-0">
                      <td className="py-2.5 pr-3">
                        <div className="flex items-center gap-2.5">
                          <Avatar name={row.person.fullName} />
                          <div className="min-w-0">
                            <p className="truncate font-semibold text-foreground">
                              {row.person.fullName}
                            </p>
                            <p className="text-xs text-muted-foreground">
                              {row.person.employeeCode}
                            </p>
                          </div>
                        </div>
                      </td>
                      <td className="py-2.5 pr-3 text-muted-foreground">
                        {row.person.department ?? "—"}
                      </td>
                      <td className="py-2.5 pr-3">
                        {row.checkIn ? (
                          <span className="inline-flex items-center gap-1.5 font-medium tabular-nums text-foreground">
                            <LogIn className="h-3.5 w-3.5 text-success" aria-hidden />
                            {formatTime(row.checkIn)}
                          </span>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </td>
                      <td className="py-2.5 pr-3">
                        {row.checkOut ? (
                          <span className="inline-flex items-center gap-1.5 font-medium tabular-nums text-foreground">
                            <LogOut className="h-3.5 w-3.5 text-muted-foreground" aria-hidden />
                            {formatTime(row.checkOut)}
                          </span>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </td>
                      <td className="py-2.5 pr-3 text-right font-semibold tabular-nums text-foreground">
                        {row.hours > 0 ? formatHours(row.hours) : "—"}
                      </td>
                      <td className="py-2.5">
                        <span
                          className={cn(
                            "inline-block rounded-full px-2.5 py-1 text-xs font-bold",
                            meta.tone,
                          )}
                        >
                          {meta.label}
                        </span>
                        {row.isLate ? (
                          <span className="ml-1.5 text-xs font-semibold text-warning">
                            {row.minutesLate}m late
                          </span>
                        ) : null}
                      </td>
                    </tr>
                  );
                })}
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
        <p className="text-xl font-bold tabular-nums text-foreground">{value}</p>
      </div>
    </Card>
  );
}
