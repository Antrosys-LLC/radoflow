import type { Metadata } from "next";
import { CircleDot, Clock, LogIn, TriangleAlert, UserCheck, Users } from "lucide-react";

import { AutoRefresh } from "@/components/auto-refresh";
import { Avatar, Card, SectionTitle } from "@/components/ui-kit";
import { requirePermission } from "@/lib/auth/session";
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

const STATUS_META: Record<LiveStatus, { label: string; tone: string; dot: string }> = {
  working: { label: "Working now", tone: "bg-success-soft text-success", dot: "bg-success" },
  finished: { label: "Shift finished", tone: "bg-secondary text-muted-foreground", dot: "bg-muted-foreground" },
  missing: { label: "Not checked in", tone: "bg-danger-soft text-danger", dot: "bg-danger" },
  not_started: { label: "Shift not started", tone: "bg-warning-soft text-warning", dot: "bg-warning" },
  no_shift: { label: "No shift assigned", tone: "bg-warning-soft text-warning", dot: "bg-warning" },
};

export default async function AttendancePage() {
  await requirePermission("attendance.view");
  const supabase = await createClient();

  const { data: rows } = await supabase
    .from("live_attendance")
    .select("*")
    .order("full_name");

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
      <AutoRefresh seconds={15} />

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Tile
          icon={UserCheck}
          label="Working now"
          value={working.length}
          hint="Checked in, not yet out"
          tone="success"
        />
        <Tile
          icon={TriangleAlert}
          label="Not checked in"
          value={missing.length}
          hint="Shift started without them"
          tone="danger"
        />
        <Tile
          icon={Clock}
          label="Late today"
          value={lateToday.length}
          hint="Arrived after grace period"
          tone="warning"
        />
        <Tile
          icon={Users}
          label="Shift finished"
          value={finished.length}
          hint="Clocked out"
          tone="neutral"
        />
      </div>

      <PeopleCard
        icon={TriangleAlert}
        title="Not checked in"
        subtitle="Their shift has started and no punch has arrived — chase these first"
        people={missing}
        emptyText="Everyone on shift has checked in."
        emptyTone="good"
      />

      <PeopleCard
        icon={CircleDot}
        title="On the floor now"
        subtitle="Checked in and still working"
        people={working}
        emptyText="Nobody is currently clocked in."
      />

      {pending.length > 0 ? (
        <PeopleCard
          icon={Clock}
          title="Shift not started yet"
          subtitle="Not due on the floor at this time"
          people={pending}
        />
      ) : null}

      {finished.length > 0 ? (
        <PeopleCard
          icon={Users}
          title="Finished today"
          subtitle="Clocked out"
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
  icon,
  title,
  subtitle,
  people,
  emptyText,
  emptyTone,
}: {
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
        title={`${title} · ${people.length}`}
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
          {emptyText ?? "Nobody here right now."}
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
                    {person.full_name}
                  </p>
                  <p className="truncate text-xs text-muted-foreground">
                    {person.employee_code} · {person.shift_name ?? "No shift"}
                    {person.shift_starts_at ? ` from ${person.shift_starts_at.slice(0, 5)}` : ""}
                  </p>
                  {person.is_late && person.minutes_late ? (
                    <p className="mt-0.5 text-xs font-bold text-warning">
                      {person.minutes_late} min late
                    </p>
                  ) : null}
                </div>

                <div className="shrink-0 text-right">
                  <span
                    className={cn(
                      "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-bold",
                      meta.tone,
                    )}
                  >
                    <span className={cn("size-1.5 rounded-full", meta.dot)} />
                    {meta.label}
                  </span>
                  {person.first_in ? (
                    <p className="mt-1 flex items-center justify-end gap-1 text-xs font-semibold text-foreground">
                      <LogIn className="size-3" />
                      {formatTime(person.first_in)}
                    </p>
                  ) : null}
                  {person.regular_hours ? (
                    <p className="text-[11px] text-muted-foreground">
                      {formatHours(person.regular_hours)}
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
      <p className="mt-3 text-3xl font-bold tracking-tight tabular-nums text-foreground">{value}</p>
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
