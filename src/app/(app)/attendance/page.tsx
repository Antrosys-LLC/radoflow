import type { Metadata } from "next";
import { CircleDot, Clock, LogIn, TriangleAlert, UserCheck, Users } from "lucide-react";

import { ATTENDANCE_REFRESH_SECONDS, AutoRefresh } from "@/components/auto-refresh";
import { Fill } from "@/components/fill";
import { Latin } from "@/components/latin";
import { Avatar, Card, SectionTitle } from "@/components/ui-kit";
import { requireAnyPermission } from "@/lib/auth/session";
import { dictionaryFor, type Dictionary } from "@/lib/i18n";
import { createClient } from "@/lib/supabase/server";
import { formatHours, formatTime, todayInPakistan } from "@/lib/time";
import { cn } from "@/lib/utils";

export const metadata: Metadata = {
  title: { absolute: "Attendance | Rado Dyeing and Textile" },
  description: "Live floor status — who is working now and whose shift started without them.",
};

// Live status; a cached page would show a stale floor.
export const dynamic = "force-dynamic";

type LiveStatus = "working" | "finished" | "missing" | "not_started" | "no_shift";

/**
 * The badge for each live status.
 *
 * `labelKey` rather than a label, because this table is module-level and the
 * language is only known once the request has a session.
 */
const STATUS_META: Record<
  LiveStatus,
  { labelKey: keyof Dictionary["attendance"]; tone: string; dot: string }
> = {
  working: { labelKey: "workingNow", tone: "bg-success-soft text-success", dot: "bg-success" },
  finished: {
    labelKey: "shiftFinished",
    tone: "bg-secondary text-muted-foreground",
    dot: "bg-muted-foreground",
  },
  missing: { labelKey: "notCheckedIn", tone: "bg-danger-soft text-danger", dot: "bg-danger" },
  not_started: {
    labelKey: "shiftNotStarted",
    tone: "bg-warning-soft text-warning",
    dot: "bg-warning",
  },
  no_shift: {
    labelKey: "noShiftAssigned",
    tone: "bg-warning-soft text-warning",
    dot: "bg-warning",
  },
};

export default async function AttendancePage() {
  const session = await requireAnyPermission(["attendance.view", "attendance.view.all"]);
  const t = dictionaryFor(session.profile.language);
  const supabase = await createClient();

  const { data: rows } = await supabase.from("live_attendance").select("*").order("full_name");

  const people = rows ?? [];
  const by = (status: LiveStatus) => people.filter((p) => p.live_status === status);

  const working = by("working");
  const missing = by("missing");
  const finished = by("finished");
  const pending = [...by("not_started"), ...by("no_shift")];
  const lateToday = people.filter((p) => p.is_late);

  return (
    <div className="space-y-5 pb-6">
      {/* The whole point of this board is what is true now. */}
      <AutoRefresh seconds={ATTENDANCE_REFRESH_SECONDS} />

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Tile
          icon={UserCheck}
          label={t.attendance.workingNow}
          value={working.length}
          hint={t.attendance.checkedInNotOut}
          tone="success"
        />
        <Tile
          icon={TriangleAlert}
          label={t.attendance.notCheckedIn}
          value={missing.length}
          hint={t.attendance.shiftStartedWithout}
          tone="danger"
        />
        <Tile
          icon={Clock}
          label={t.attendance.lateToday}
          value={lateToday.length}
          hint={t.attendance.arrivedAfterGrace}
          tone="warning"
        />
        <Tile
          icon={Users}
          label={t.attendance.shiftFinished}
          value={finished.length}
          hint={t.attendance.clockedOut}
          tone="neutral"
        />
      </div>

      <PeopleCard
        t={t}
        icon={TriangleAlert}
        title={t.attendance.notCheckedIn}
        subtitle={t.attendance.chaseFirst}
        people={missing}
        emptyText={t.attendance.everyoneCheckedIn}
        emptyTone="good"
      />

      <PeopleCard
        t={t}
        icon={CircleDot}
        title={t.attendance.onFloorNow}
        subtitle={t.attendance.checkedInStillWorking}
        people={working}
        emptyText={t.attendance.nobodyClockedIn}
      />

      {pending.length > 0 ? (
        <PeopleCard
          t={t}
          icon={Clock}
          title={t.attendance.shiftNotStartedYet}
          subtitle={t.attendance.notDueYet}
          people={pending}
        />
      ) : null}

      {finished.length > 0 ? (
        <PeopleCard
          t={t}
          icon={Users}
          title={t.attendance.finishedToday}
          subtitle={t.attendance.clockedOut}
          people={finished}
        />
      ) : null}
    </div>
  );
}

interface LiveRow {
  profile_id: string | null;
  employee_code: string | null;
  full_name: string | null;
  shift_name: string | null;
  shift_starts_at: string | null;
  first_in: string | null;
  last_out: string | null;
  regular_hours: number | null;
  minutes_late: number | null;
  is_late: boolean | null;
  live_status: string | null;
}

function PeopleCard({
  t,
  icon,
  title,
  subtitle,
  people,
  emptyText,
  emptyTone,
}: {
  t: Dictionary;
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  subtitle: string;
  people: LiveRow[];
  emptyText?: string;
  emptyTone?: "good";
}) {
  return (
    <Card className="p-4 sm:p-6">
      <SectionTitle
        icon={icon as never}
        title={
          <>
            {title} · <Latin>{people.length}</Latin>
          </>
        }
        subtitle={subtitle}
      />

      {people.length === 0 ? (
        <div
          className={cn(
            "rounded-2xl p-6 text-center text-sm font-semibold",
            emptyTone === "good"
              ? "bg-success-soft text-success"
              : "bg-secondary text-muted-foreground",
          )}
        >
          {emptyText ?? t.attendance.nobodyHere}
        </div>
      ) : (
        <div className="grid gap-2 sm:grid-cols-2">
          {people.map((person) => {
            const status = (person.live_status ?? "no_shift") as LiveStatus;
            const meta = STATUS_META[status] ?? STATUS_META.no_shift;

            return (
              <div
                key={person.profile_id}
                className="flex items-center gap-3 rounded-2xl bg-secondary p-3"
              >
                <Avatar name={person.full_name ?? "??"} />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold text-foreground">
                    <Latin>{person.full_name}</Latin>
                  </p>
                  <p className="truncate text-xs text-muted-foreground">
                    {/* The shift name is data the office typed, so it renders as
                        stored; the code beside it is not, and must not be able
                        to reorder. */}
                    <Latin>{person.employee_code}</Latin> ·{" "}
                    {person.shift_name ?? t.attendance.noShift}
                    {person.shift_starts_at ? (
                      <>
                        {" "}
                        <Fill
                          template={t.attendance.shiftFrom}
                          values={{ time: person.shift_starts_at.slice(0, 5) }}
                        />
                      </>
                    ) : null}
                  </p>
                  {person.is_late && person.minutes_late ? (
                    <p className="mt-0.5 text-xs font-bold text-warning">
                      <Fill
                        template={t.common.minutesLate}
                        values={{ minutes: person.minutes_late }}
                      />
                    </p>
                  ) : null}
                </div>

                <div className="shrink-0 text-end">
                  <span
                    className={cn(
                      "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-bold",
                      meta.tone,
                    )}
                  >
                    <span className={cn("size-1.5 rounded-full", meta.dot)} />
                    {t.attendance[meta.labelKey]}
                  </span>
                  {person.first_in ? (
                    <p className="mt-1 flex items-center justify-end gap-1 text-xs font-semibold text-foreground">
                      {/* Not flipped: mirroring this glyph turns "in" into the
                          log-out icon, which is the opposite of what it says. */}
                      <LogIn className="size-3" />
                      <Latin>{formatTime(person.first_in)}</Latin>
                    </p>
                  ) : null}
                  {person.regular_hours ? (
                    <p className="text-[11px] text-muted-foreground">
                      <Latin>{formatHours(person.regular_hours)}</Latin>
                    </p>
                  ) : null}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </Card>
  );
}

function Tile({
  icon: Icon,
  label,
  value,
  hint,
  tone,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: number;
  hint: string;
  tone: "success" | "danger" | "warning" | "neutral";
}) {
  const tones = {
    success: "bg-success-soft text-success",
    danger: "bg-danger-soft text-danger",
    warning: "bg-warning-soft text-warning",
    neutral: "bg-secondary text-foreground",
  } as const;

  return (
    <div className="rounded-3xl border border-border bg-card p-5 shadow-[0_1px_2px_rgb(0_0_0/0.04),0_8px_24px_rgb(0_0_0/0.05)]">
      <span className={cn("flex size-11 items-center justify-center rounded-2xl", tones[tone])}>
        <Icon className="size-5" />
      </span>
      <p className="mt-3 text-3xl font-bold tracking-tight tabular-nums text-foreground">
        <Latin>{value}</Latin>
      </p>
      <p className="text-sm font-semibold text-foreground">{label}</p>
      <p className="mt-0.5 text-xs text-muted-foreground">{hint}</p>
    </div>
  );
}

export const revalidate = 0;

/** Shown in the header so the numbers are unambiguous about which day. */
export function todayLabel() {
  return todayInPakistan();
}
