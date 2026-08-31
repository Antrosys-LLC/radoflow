import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import type { AttendanceStatus } from "@/lib/payroll/types";
import { CheckCircle2, Clock3, XCircle } from "lucide-react";

export function Card({ className, children, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        "rounded-3xl border border-border bg-card p-6 shadow-[0_1px_2px_rgb(0_0_0/0.04),0_8px_24px_rgb(0_0_0/0.05)] transition-all duration-300 ease-in-out",
        className,
      )}
      {...props}
    >
      {children}
    </div>
  );
}

export function SectionTitle({
  icon: Icon,
  title,
  subtitle,
  action,
}: {
  icon: LucideIcon;
  title: string;
  subtitle?: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="mb-5 flex items-start justify-between gap-4">
      <div className="flex items-center gap-3">
        <span className="flex size-11 items-center justify-center rounded-2xl bg-primary-soft text-primary">
          <Icon className="size-5" />
        </span>
        <div>
          <h2 className="text-lg font-semibold tracking-tight text-foreground">{title}</h2>
          {subtitle ? <p className="text-sm text-muted-foreground">{subtitle}</p> : null}
        </div>
      </div>
      {action}
    </div>
  );
}

export function StatPill({
  icon: Icon,
  label,
  value,
  hint,
  tone = "neutral",
}: {
  icon: LucideIcon;
  label: string;
  value: string;
  hint?: string;
  tone?: "neutral" | "primary" | "success" | "warning" | "danger";
}) {
  const tones = {
    neutral: "bg-secondary text-foreground",
    primary: "bg-primary-soft text-primary",
    success: "bg-success-soft text-success",
    warning: "bg-warning-soft text-warning",
    danger: "bg-danger-soft text-danger",
  } as const;

  return (
    <div className="group rounded-3xl border border-border bg-card p-5 shadow-[0_1px_2px_rgb(0_0_0/0.04),0_8px_24px_rgb(0_0_0/0.05)] transition-all duration-300 ease-in-out hover:-translate-y-1 hover:shadow-[0_2px_6px_rgb(0_0_0/0.06),0_18px_40px_rgb(0_0_0/0.09)]">
      <span
        className={cn(
          "flex size-12 items-center justify-center rounded-2xl transition-all duration-300 ease-in-out group-hover:scale-105",
          tones[tone],
        )}
      >
        <Icon className="size-6" />
      </span>
      <p className="mt-4 text-sm font-medium text-muted-foreground">{label}</p>
      <p className="mt-1 text-2xl font-bold tracking-tight text-foreground">{value}</p>
      {hint ? <p className="mt-1 text-xs text-muted-foreground">{hint}</p> : null}
    </div>
  );
}

export function RadialDial({
  value,
  label,
  caption,
  size = 132,
}: {
  value: number;
  label: string;
  caption?: string;
  size?: number;
}) {
  const stroke = 12;
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const pct = Math.max(0, Math.min(100, value));
  const tone = pct >= 85 ? "var(--success)" : pct >= 70 ? "var(--warning)" : "var(--danger)";

  return (
    <div className="flex flex-col items-center gap-3">
      <div className="relative" style={{ width: size, height: size }}>
        <svg width={size} height={size} className="-rotate-90">
          <circle
            cx={size / 2}
            cy={size / 2}
            r={r}
            strokeWidth={stroke}
            stroke="var(--muted)"
            fill="none"
            strokeLinecap="round"
          />
          <circle
            cx={size / 2}
            cy={size / 2}
            r={r}
            strokeWidth={stroke}
            stroke={tone}
            fill="none"
            strokeLinecap="round"
            strokeDasharray={c}
            strokeDashoffset={c - (pct / 100) * c}
            className="transition-all duration-700 ease-in-out"
          />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-2xl font-bold tracking-tight text-foreground">
            {Math.round(pct)}%
          </span>
        </div>
      </div>
      <div className="text-center">
        <p className="text-sm font-semibold text-foreground">{label}</p>
        {caption ? <p className="text-xs text-muted-foreground">{caption}</p> : null}
      </div>
    </div>
  );
}

export function BarMeter({
  value,
  label,
  right,
}: {
  value: number;
  label: string;
  right?: string;
}) {
  return (
    <div>
      <div className="mb-2 flex items-center justify-between text-sm">
        <span className="font-medium text-foreground">{label}</span>
        {right ? <span className="text-muted-foreground">{right}</span> : null}
      </div>
      <div className="h-3 w-full overflow-hidden rounded-full bg-muted">
        <div
          className="h-full rounded-full bg-primary transition-all duration-700 ease-in-out"
          style={{ width: `${Math.max(0, Math.min(100, value))}%` }}
        />
      </div>
    </div>
  );
}

export function StatusBadge({ status }: { status: AttendanceStatus }) {
  const map = {
    present: { icon: CheckCircle2, text: "Present", cls: "bg-success-soft text-success" },
    partial: { icon: Clock3, text: "Partial", cls: "bg-warning-soft text-warning" },
    absent: { icon: XCircle, text: "Absent", cls: "bg-danger-soft text-danger" },
    leave: { icon: Clock3, text: "Leave", cls: "bg-info-soft text-info" },
    holiday: { icon: Clock3, text: "Holiday", cls: "bg-secondary text-muted-foreground" },
    off: { icon: Clock3, text: "Off day", cls: "bg-secondary text-muted-foreground" },
    pending: { icon: Clock3, text: "Pending", cls: "bg-warning-soft text-warning" },
  } as const;
  const { icon: Icon, text, cls } = map[status] ?? map.pending;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold",
        cls,
      )}
    >
      <Icon className="size-4" />
      {text}
    </span>
  );
}

export function Avatar({ name, className }: { name: string; className?: string }) {
  const init = name
    .split(" ")
    .map((p) => p[0])
    .slice(0, 2)
    .join("");
  return (
    <span
      className={cn(
        "flex size-10 shrink-0 items-center justify-center rounded-2xl bg-primary-soft text-sm font-bold text-primary",
        className,
      )}
    >
      {init}
    </span>
  );
}
