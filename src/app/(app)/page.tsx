import type { Metadata } from "next";
import Link from "next/link";
import {
  ArrowRight,
  BadgeCheck,
  CircleDot,
  Clock,
  Fingerprint,
  TriangleAlert,
  UserCheck,
  Users,
  Wallet,
} from "lucide-react";

import { ATTENDANCE_REFRESH_SECONDS, AutoRefresh } from "@/components/auto-refresh";
import { DailyHours, VizRoot } from "@/components/charts";
import { BarMeter, Card, SectionTitle, StatPill } from "@/components/ui-kit";
import { dailyHourTotals } from "@/lib/attendance/daily-hours";
import { DEFAULT_PAY_RULE, type AttendanceDay, type DayType } from "@/lib/payroll/types";
import { requireSession } from "@/lib/auth/session";
import { selectInBatches } from "@/lib/supabase/in-batches";
import { createClient } from "@/lib/supabase/server";
import { formatDate, formatHours, formatPKR, formatTime, todayInPakistan } from "@/lib/time";
import { cn } from "@/lib/utils";

export const metadata: Metadata = {
  title: { absolute: "Dashboard | Rado Attendance & Payroll" },
  description: "Live headcount, attendance and payroll for Rado Dyeing and Textile.",
};

export const dynamic = "force-dynamic";

/**
 * The landing screen, assembled from whatever the signed-in role may see.
 *
 * Every block is permission-gated rather than role-gated, so a custom role
 * built in the control centre gets a coherent dashboard without any change
 * here. An Employee sees only their own card; the CEO sees all of it.
 */
export default async function DashboardPage() {
  const session = await requireSession();
  const supabase = await createClient();
  const can = (p: string) => session.permissions.has(p);

  const seesFloor = can("attendance.view") || can("attendance.view.all");
  const seesPayroll = can("payroll.view");
  const seesDevices = can("devices.view");
  const seesDirectory = can("directory.view");

  const today = todayInPakistan();

  const [liveResult, meResult, payrollResult, devicesResult, deptResult] = await Promise.all([
    seesFloor ? supabase.from("live_attendance").select("*") : Promise.resolve({ data: null }),
    supabase
      .from("attendance_days")
      .select("first_in, last_out, regular_hours, minutes_late, is_late, status")
      .eq("profile_id", session.userId)
      .eq("work_date", today)
      .maybeSingle(),
    seesPayroll
      ? supabase
          .from("payroll_periods")
          .select("id, label, status, total_net, total_gross, headcount, period_end")
          .order("period_start", { ascending: false })
          .limit(1)
      : Promise.resolve({ data: null }),
    seesDevices
      ? supabase.from("devices").select("id, name, status, last_seen_at").eq("is_active", true)
      : Promise.resolve({ data: null }),
    seesDirectory
      ? supabase.from("departments").select("id, name")
      : Promise.resolve({ data: null }),
  ]);

  const live = liveResult.data ?? [];
  const me = meResult.data;
  const period = payrollResult.data?.[0] ?? null;
  const devices = devicesResult.data ?? [];
  const departments = deptResult.data ?? [];

  const working = live.filter((p) => p.live_status === "working");
  const missing = live.filter((p) => p.live_status === "missing");
  const lateToday = live.filter((p) => p.is_late);
  const onlineDevices = devices.filter((d) => d.status === "online");

  // Attendance per department, from the same rows the floor board uses.
  const deptName = new Map(departments.map((d) => [d.id, d.name]));
  const byDepartment = new Map<string, { present: number; total: number }>();
  for (const person of live) {
    const key = person.department_id ?? "none";
    const entry = byDepartment.get(key) ?? { present: 0, total: 0 };
    entry.total += 1;
    if (person.live_status === "working" || person.live_status === "finished") entry.present += 1;
    byDepartment.set(key, entry);
  }

  /*
   * Hours per day for the month so far.
   *
   * A manager sees the whole factory and everyone else sees themselves, the
   * same way every other block on this page is gated. Run through the shared
   * helper rather than summing the stored columns, so this chart, the reports
   * screen and the payroll run cannot tell three different stories about the
   * same month.
   */
  const monthStart = today.slice(0, 7) + "-01";
  const canSeeEveryone = session.isSuperuser || session.permissions.has("attendance.view.all");

  const staffQuery = supabase
    .from("profiles")
    .select("id, duty_hours, overtime_eligible, sunday_policy")
    .eq("status", "active");

  const { data: chartPeople } = canSeeEveryone
    ? await staffQuery
    : await staffQuery.eq("id", session.userId);

  const chartIds = (chartPeople ?? []).map((p) => p.id);

  const monthDays = await selectInBatches(
    chartIds,
    (ids) =>
      supabase
        .from("attendance_days")
        .select("profile_id, work_date, day_type, regular_hours, status")
        .in("profile_id", ids)
        .gte("work_date", monthStart)
        .lte("work_date", today),
    `Could not read attendance for ${monthStart} to ${today}`,
  );

  const monthByPerson = new Map<string, AttendanceDay[]>();
  for (const row of monthDays ?? []) {
    const list = monthByPerson.get(row.profile_id) ?? [];
    list.push({
      workDate: row.work_date,
      dayType: (row.day_type ?? "workday") as DayType,
      hoursWorked: Number(row.regular_hours ?? 0),
      status: (row.status ?? "pending") as AttendanceDay["status"],
    });
    monthByPerson.set(row.profile_id, list);
  }

  const monthHours = dailyHourTotals(
    (chartPeople ?? []).map((person) => ({
      id: person.id,
      dutyHours: Number(person.duty_hours ?? 8),
      overtimeEligible: person.overtime_eligible,
      sundayPolicy: person.sunday_policy,
    })),
    monthByPerson,
    DEFAULT_PAY_RULE,
  );

  const roleLabel = session.roles.map((r) => r.name).join(" · ") || "No role";
  const firstName = session.profile.fullName.split(" ")[0] ?? session.profile.fullName;

  return (
    <div className="space-y-5 pb-6">
      {/* The floor changes while this page is open; nobody should have to reload. */}
      <AutoRefresh seconds={ATTENDANCE_REFRESH_SECONDS} />

      <div className="rounded-3xl bg-charcoal p-7 text-charcoal-foreground shadow-[0_18px_40px_rgb(0_0_0/0.12)]">
        <p className="text-xs font-semibold uppercase tracking-widest text-primary">
          {roleLabel} · {formatDate(today)}
        </p>
        <h1 className="mt-2 text-2xl font-bold tracking-tight sm:text-3xl">
          Good day, {firstName}
        </h1>
        <p className="mt-2 max-w-xl text-sm opacity-70">
          {seesFloor
            ? "Everything happening on the floor today — attendance, shifts and payroll — in one glance."
            : "Your attendance, leave and payslips, all in one place."}
        </p>
      </div>

      {/* Own status. Everyone has this, including the CEO. */}
      <Card>
        <SectionTitle
          icon={CircleDot}
          title="You today"
          subtitle={
            session.profile.requiresAttendance
              ? "From the biometric terminal"
              : "Your role does not require clocking in"
          }
        />
        {session.profile.requiresAttendance ? (
          <div className="grid gap-3 sm:grid-cols-4">
            <Fact label="Checked in" value={me?.first_in ? formatTime(me.first_in) : "Not yet"} />
            <Fact label="Checked out" value={me?.last_out ? formatTime(me.last_out) : "—"} />
            <Fact label="Hours today" value={formatHours(me?.regular_hours ?? 0)} />
            <Fact
              label="Punctuality"
              value={me?.is_late ? `${me.minutes_late} min late` : me?.first_in ? "On time" : "—"}
              {...(me?.is_late
                ? { tone: "warning" as const }
                : me?.first_in
                  ? { tone: "success" as const }
                  : {})}
            />
          </div>
        ) : (
          <p className="rounded-2xl bg-secondary px-4 py-3 text-sm text-muted-foreground">
            You are on a monthly salary and are not tracked by the terminals.
          </p>
        )}
      </Card>

      {seesFloor ? (
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          <StatPill
            icon={UserCheck}
            label="Working now"
            value={String(working.length)}
            hint="Clocked in, not yet out"
            tone="success"
          />
          <StatPill
            icon={TriangleAlert}
            label="Not checked in"
            value={String(missing.length)}
            hint="Shift started without them"
            tone={missing.length > 0 ? "danger" : "neutral"}
          />
          <StatPill
            icon={Clock}
            label="Late today"
            value={String(lateToday.length)}
            hint="After the grace period"
            tone={lateToday.length > 0 ? "warning" : "neutral"}
          />
          <StatPill
            icon={Users}
            label="Tracked staff"
            value={String(live.length)}
            hint="Requiring attendance"
            tone="primary"
          />
        </div>
      ) : null}

      <VizRoot>
        <DailyHours
          data={monthHours}
          title={canSeeEveryone ? "Hours worked this month" : "Your hours this month"}
          subtitle={
            canSeeEveryone
              ? "Every day this month across the factory. Green is duty, orange is overtime."
              : "Your hours each day this month. Green is duty, orange is overtime."
          }
          dutyColor="var(--success)"
        />
      </VizRoot>

      <div className="grid gap-5 xl:grid-cols-3">
        {seesFloor ? (
          <Card className="xl:col-span-2">
            <SectionTitle
              icon={Users}
              title="Attendance by department"
              subtitle="Present against expected headcount, right now"
              action={
                <Link
                  href="/attendance"
                  className="inline-flex items-center gap-2 rounded-xl bg-secondary px-4 py-2 text-sm font-semibold text-foreground transition-all duration-300 hover:bg-primary-soft hover:text-primary"
                >
                  Floor board
                  <ArrowRight className="size-4" />
                </Link>
              }
            ></SectionTitle>

            {byDepartment.size === 0 ? (
              <Empty text="Nobody is set to require attendance yet." />
            ) : (
              <div className="grid gap-5 sm:grid-cols-2">
                {[...byDepartment.entries()].map(([id, stats]) => (
                  <BarMeter
                    key={id}
                    label={deptName.get(id) ?? "Unassigned"}
                    value={stats.total > 0 ? (stats.present / stats.total) * 100 : 0}
                    right={`${stats.present}/${stats.total}`}
                  />
                ))}
              </div>
            )}

            {missing.length > 0 ? (
              <div className="mt-5 rounded-2xl bg-danger-soft p-4">
                <p className="text-sm font-bold text-danger">{missing.length} not checked in</p>
                <p className="mt-1 text-xs text-foreground">
                  {missing
                    .slice(0, 6)
                    .map((p) => p.full_name)
                    .join(", ")}
                  {missing.length > 6 ? ` and ${missing.length - 6} more` : ""}
                </p>
              </div>
            ) : null}
          </Card>
        ) : null}

        <div className="space-y-5">
          {seesPayroll ? (
            <Card>
              <SectionTitle icon={Wallet} title="Latest pay run" subtitle="Most recent period" />
              {period ? (
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-semibold text-foreground">{period.label}</span>
                    <span className="rounded-full bg-secondary px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide text-muted-foreground">
                      {period.status}
                    </span>
                  </div>
                  <Fact label="Gross" value={formatPKR(Number(period.total_gross))} />
                  <div className="rounded-2xl bg-primary-soft p-4">
                    <p className="text-xs font-semibold uppercase tracking-wide text-primary">
                      Net payable
                    </p>
                    <p className="mt-1 text-2xl font-bold tracking-tight text-foreground">
                      {formatPKR(Number(period.total_net))}
                    </p>
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      {period.headcount} employee{period.headcount === 1 ? "" : "s"} · to{" "}
                      {formatDate(period.period_end)}
                    </p>
                  </div>
                  <Link
                    href="/payroll"
                    className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-primary px-4 py-3 text-sm font-bold text-primary-foreground shadow-[0_10px_24px_rgb(239_86_25/0.25)] transition-all hover:-translate-y-0.5"
                  >
                    Open payroll
                    <ArrowRight className="size-4" />
                  </Link>
                </div>
              ) : (
                <Empty text="No pay period has been created yet." />
              )}
            </Card>
          ) : null}

          {seesDevices ? (
            <Card>
              <SectionTitle
                icon={Fingerprint}
                title="Terminals"
                subtitle={`${onlineDevices.length} of ${devices.length} online`}
              />
              <div className="space-y-2">
                {devices.map((device) => (
                  <Link
                    key={device.id}
                    href={`/devices/${device.id}`}
                    className="flex items-center justify-between gap-3 rounded-2xl bg-secondary px-4 py-3 transition-all hover:bg-primary-soft"
                  >
                    <span className="min-w-0 truncate text-sm font-semibold text-foreground">
                      {device.name}
                    </span>
                    <span
                      className={cn(
                        "shrink-0 rounded-full px-2.5 py-1 text-[10px] font-bold uppercase",
                        device.status === "online"
                          ? "bg-success-soft text-success"
                          : "bg-danger-soft text-danger",
                      )}
                    >
                      {device.status}
                    </span>
                  </Link>
                ))}
                {devices.length === 0 ? <Empty text="No terminals registered." /> : null}
              </div>
            </Card>
          ) : null}

          {!seesFloor && !seesPayroll && !seesDevices ? (
            <Card>
              <SectionTitle
                icon={BadgeCheck}
                title="Your records"
                subtitle="Everything available to you"
              />
              <Link
                href="/me/profile"
                className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-primary px-4 py-3 text-sm font-bold text-primary-foreground transition-all hover:-translate-y-0.5"
              >
                Open my profile
                <ArrowRight className="size-4" />
              </Link>
            </Card>
          ) : null}
        </div>
      </div>
    </div>
  );
}

function Fact({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone?: "success" | "warning";
}) {
  return (
    <div className="rounded-2xl bg-secondary px-4 py-3">
      <p className="text-[11px] font-bold uppercase tracking-wide text-muted-foreground">{label}</p>
      <p
        className={cn(
          "mt-0.5 truncate text-sm font-bold",
          tone === "success" && "text-success",
          tone === "warning" && "text-warning",
          !tone && "text-foreground",
        )}
      >
        {value}
      </p>
    </div>
  );
}

function Empty({ text }: { text: string }) {
  return (
    <div className="rounded-2xl bg-secondary p-6 text-center text-sm text-muted-foreground">
      {text}
    </div>
  );
}
