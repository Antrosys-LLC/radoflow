import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { CalendarDays, Fingerprint, Gauge, LogIn, Minus, Plus, Sun } from "lucide-react";
import { toast } from "sonner";
import { Avatar, Card, SectionTitle, StatusBadge } from "@/components/ui-kit";
import { useApp } from "@/lib/app-context";
import { CHECK_INS } from "@/data/demo";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/attendance")({
  head: () => ({
    meta: [
      { title: "Attendance & Shifts | Rado Dyeing and Textile" },
      {
        name: "description",
        content:
          "Plan shifts, toggle off-days, activate weekend working and watch live ZKTeco K50 biometric check-ins.",
      },
      { property: "og:title", content: "Attendance & Shifts | Rado Dyeing and Textile" },
      {
        property: "og:description",
        content: "Shift calendar, rate multipliers and live biometric check-in stream.",
      },
    ],
  }),
  component: AttendancePage,
});

type DayState = "work" | "off" | "weekend-active";

function AttendancePage() {
  const { factory } = useApp();
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth();

  const [overrides, setOverrides] = useState<Record<number, DayState>>({});
  const [hourlyRate, setHourlyRate] = useState(320);
  const [otMultiplier, setOtMultiplier] = useState(1.5);
  const [weekendMultiplier, setWeekendMultiplier] = useState(2);

  const days = useMemo(() => {
    const first = new Date(year, month, 1);
    const count = new Date(year, month + 1, 0).getDate();
    const pad = first.getDay();
    return { pad, count };
  }, [year, month]);

  function stateFor(day: number): DayState {
    if (overrides[day]) return overrides[day];
    const dow = new Date(year, month, day).getDay();
    return dow === 0 || dow === 6 ? "off" : "work";
  }

  function toggleDay(day: number) {
    const current = stateFor(day);
    const next: DayState = current === "work" ? "off" : current === "off" ? "weekend-active" : "work";
    setOverrides((o) => ({ ...o, [day]: next }));
    toast.success(
      next === "work" ? "Marked as a normal workday" : next === "off" ? "Marked as an off-day" : "Activated as a paid working day",
      { description: `${new Date(year, month, day).toDateString()}` },
    );
  }

  const feed = CHECK_INS.filter((c) => c.factory === factory);

  return (
    <div className="space-y-5 pb-6">
      <div className="grid grid-cols-1 gap-5 xl:grid-cols-3">
        <Card className="xl:col-span-2">
          <SectionTitle
            icon={CalendarDays}
            title="Shift calendar"
            subtitle="Tap a day to cycle: workday → off-day → paid weekend shift"
          />
          <div className="mb-4 flex flex-wrap gap-2">
            <Legend cls="bg-secondary text-foreground" label="Workday" />
            <Legend cls="bg-danger-soft text-danger" label="Off-day" />
            <Legend cls="bg-primary-soft text-primary" label="Weekend / Off-day shift active" />
          </div>
          <div className="grid grid-cols-7 gap-2">
            {["S", "M", "T", "W", "T", "F", "S"].map((d, i) => (
              <div key={i} className="pb-1 text-center text-xs font-semibold text-muted-foreground">
                {d}
              </div>
            ))}
            {Array.from({ length: days.pad }).map((_, i) => (
              <div key={`pad-${i}`} />
            ))}
            {Array.from({ length: days.count }).map((_, i) => {
              const day = i + 1;
              const s = stateFor(day);
              return (
                <button
                  key={day}
                  onClick={() => toggleDay(day)}
                  className={cn(
                    "aspect-square rounded-2xl text-sm font-semibold transition-all duration-300 ease-in-out hover:-translate-y-0.5 hover:shadow-[0_10px_24px_rgb(0_0_0/0.08)]",
                    s === "work" && "bg-secondary text-foreground",
                    s === "off" && "bg-danger-soft text-danger",
                    s === "weekend-active" && "bg-primary-soft text-primary ring-2 ring-primary/40",
                    day === now.getDate() && "ring-2 ring-charcoal",
                  )}
                >
                  {day}
                </button>
              );
            })}
          </div>
        </Card>

        <Card>
          <SectionTitle icon={Gauge} title="Rate engine" subtitle="Applied to every payroll run" />
          <div className="space-y-4">
            <Stepper
              label="Standard hourly rate (8h day)"
              value={`₨ ${hourlyRate}`}
              onDec={() => setHourlyRate((v) => Math.max(50, v - 10))}
              onInc={() => setHourlyRate((v) => v + 10)}
            />
            <Stepper
              label="Overtime multiplier"
              value={`${otMultiplier.toFixed(2)}×`}
              onDec={() => setOtMultiplier((v) => Math.max(1, +(v - 0.25).toFixed(2)))}
              onInc={() => setOtMultiplier((v) => +(v + 0.25).toFixed(2))}
            />
            <Stepper
              label="Weekend / off-day shift"
              value={`${weekendMultiplier.toFixed(2)}×`}
              onDec={() => setWeekendMultiplier((v) => Math.max(1, +(v - 0.25).toFixed(2)))}
              onInc={() => setWeekendMultiplier((v) => +(v + 0.25).toFixed(2))}
            />
            <div className="flex items-start gap-3 rounded-2xl bg-warning-soft p-4">
              <Sun className="mt-0.5 size-5 shrink-0 text-warning" />
              <p className="text-xs font-medium text-foreground">
                An 8-hour weekend shift currently pays{" "}
                <span className="font-bold">₨ {(hourlyRate * weekendMultiplier * 8).toLocaleString()}</span> per worker.
              </p>
            </div>
          </div>
        </Card>
      </div>

      <Card>
        <SectionTitle
          icon={Fingerprint}
          title="ZKTeco K50 log stream"
          subtitle="Live biometric check-ins from the floor"
          action={
            <span className="inline-flex items-center gap-2 rounded-full bg-success-soft px-3 py-1.5 text-xs font-semibold text-success">
              <span className="relative flex size-2">
                <span className="absolute inline-flex size-full animate-ping rounded-full bg-success opacity-75" />
                <span className="relative inline-flex size-2 rounded-full bg-success" />
              </span>
              Syncing
            </span>
          }
        />
        <div className="grid gap-3 sm:grid-cols-2">
          {feed.map((c) => (
            <div
              key={c.id}
              className="flex items-center gap-3 rounded-2xl bg-secondary p-3 transition-all duration-300 ease-in-out hover:bg-primary-soft"
            >
              <Avatar name={c.name} />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold text-foreground">{c.name}</p>
                <p className="text-xs text-muted-foreground">
                  {c.employeeId} · {c.department}
                </p>
              </div>
              <span className="inline-flex items-center gap-1.5 rounded-full bg-card px-3 py-1.5 text-xs font-bold text-success">
                <LogIn className="size-4" />
                {c.time}
              </span>
            </div>
          ))}
        </div>
        <div className="mt-5 flex flex-wrap items-center gap-2">
          <StatusBadge status="present" />
          <StatusBadge status="pending" />
          <StatusBadge status="absent" />
          <span className="text-xs text-muted-foreground">Status colours used across every screen.</span>
        </div>
      </Card>
    </div>
  );
}

function Legend({ cls, label }: { cls: string; label: string }) {
  return (
    <span className={cn("inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-xs font-semibold", cls)}>
      <span className="size-2.5 rounded-full bg-current" />
      {label}
    </span>
  );
}

function Stepper({
  label,
  value,
  onDec,
  onInc,
}: {
  label: string;
  value: string;
  onDec: () => void;
  onInc: () => void;
}) {
  return (
    <div className="rounded-2xl bg-secondary p-4">
      <p className="text-xs font-semibold text-muted-foreground">{label}</p>
      <div className="mt-2 flex items-center justify-between gap-3">
        <button
          onClick={onDec}
          aria-label={`Decrease ${label}`}
          className="flex size-10 items-center justify-center rounded-xl bg-card text-foreground shadow-[0_4px_14px_rgb(0_0_0/0.06)] transition-all duration-300 ease-in-out hover:text-primary"
        >
          <Minus className="size-4" />
        </button>
        <span className="text-xl font-bold tracking-tight text-foreground">{value}</span>
        <button
          onClick={onInc}
          aria-label={`Increase ${label}`}
          className="flex size-10 items-center justify-center rounded-xl bg-primary text-primary-foreground shadow-[0_10px_24px_rgb(239_86_25/0.25)] transition-all duration-300 ease-in-out hover:-translate-y-0.5"
        >
          <Plus className="size-4" />
        </button>
      </div>
    </div>
  );
}
