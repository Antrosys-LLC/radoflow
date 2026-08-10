import { createFileRoute } from "@tanstack/react-router";
import { Link } from "@tanstack/react-router";
import {
  BadgeCheck,
  CalendarClock,
  ClipboardCheck,
  Coins,
  Factory,
  PieChart,
  Users,
  Wallet,
  PlayCircle,
  TrendingUp,
} from "lucide-react";
import { toast } from "sonner";
import { BarMeter, Card, RadialDial, SectionTitle, StatPill } from "@/components/ui-kit";
import { useApp, useVisibleEmployees } from "@/lib/app-context";
import { DEPARTMENT_ATTENDANCE, FACTORIES, PAYROLL_SUMMARY, formatPKR } from "@/data/demo";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Executive Dashboard | Rado Attendance & Payroll" },
      {
        name: "description",
        content:
          "Live headcount, attendance rate, departmental performance and payroll totals for Rado Dyeing and Textile factories.",
      },
      { property: "og:title", content: "Executive Dashboard | Rado Attendance & Payroll" },
      {
        property: "og:description",
        content: "Real-time factory attendance and payroll overview for Rado Dyeing and Textile.",
      },
    ],
  }),
  component: Dashboard,
});

function Dashboard() {
  const { factory, role, isExecutive } = useApp();
  const employees = useVisibleEmployees();
  const depts = DEPARTMENT_ATTENDANCE[factory];
  const summary = PAYROLL_SUMMARY[factory];
  const factoryName = FACTORIES.find((f) => f.id === factory)!.name;

  const present = depts.reduce((s, d) => s + d.present, 0);
  const total = depts.reduce((s, d) => s + d.total, 0);
  const rate = (present / total) * 100;
  const net = summary.gross - summary.statutory - summary.tax;
  const pending = employees.filter((e) => e.status === "pending").length + 4;

  return (
    <div className="space-y-5 pb-6">
      <div className="rounded-3xl bg-charcoal p-7 text-charcoal-foreground shadow-[0_18px_40px_rgb(0_0_0/0.12)]">
        <p className="text-xs font-semibold uppercase tracking-widest text-primary">{role} view</p>
        <h1 className="mt-2 text-2xl font-bold tracking-tight sm:text-3xl">{factoryName}</h1>
        <p className="mt-2 max-w-xl text-sm opacity-70">
          Everything happening on the floor today — attendance, shifts, and payroll — in one glance.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-5">
        <StatPill icon={Users} label="Live headcount" value={`${present} / ${total}`} hint="Clocked in right now" tone="primary" />
        <StatPill icon={BadgeCheck} label="Today's attendance" value={`${rate.toFixed(1)}%`} hint="Across all departments" tone="success" />
        <StatPill icon={Wallet} label="Total gross payroll" value={formatPKR(summary.gross)} hint="Current cycle" tone="neutral" />
        <StatPill icon={Coins} label="Monthly budget" value={formatPKR(summary.budget)} hint={`${((summary.gross / summary.budget) * 100).toFixed(0)}% utilised`} tone="warning" />
        <StatPill icon={ClipboardCheck} label="Pending approvals" value={String(pending)} hint="Awaiting sign-off" tone="danger" />
      </div>

      <div className="grid grid-cols-1 gap-5 xl:grid-cols-3">
        <Card className="xl:col-span-2">
          <SectionTitle
            icon={Factory}
            title="Real-time factory overview"
            subtitle="Departmental attendance right now"
            action={
              <Link
                to="/attendance"
                className="inline-flex items-center gap-2 rounded-xl bg-secondary px-4 py-2 text-sm font-semibold text-foreground transition-all duration-300 ease-in-out hover:bg-primary-soft hover:text-primary"
              >
                <CalendarClock className="size-4" />
                Shifts
              </Link>
            }
          />
          <div className="grid grid-cols-2 gap-6 sm:grid-cols-4">
            {depts.map((d) => (
              <RadialDial
                key={d.department}
                value={(d.present / d.total) * 100}
                label={d.department}
                caption={`${d.present} of ${d.total} present`}
              />
            ))}
          </div>
        </Card>

        <Card>
          <SectionTitle icon={PieChart} title="Payroll summary" subtitle="Current pay cycle" />
          <div className="space-y-4">
            <Row label="Gross pay" value={formatPKR(summary.gross)} />
            <Row label="Statutory deductions" value={`- ${formatPKR(summary.statutory)}`} tone="danger" />
            <Row label="Tax allocation" value={`- ${formatPKR(summary.tax)}`} tone="danger" />
            <div className="rounded-2xl bg-primary-soft p-4">
              <p className="text-xs font-semibold uppercase tracking-wide text-primary">Net payroll</p>
              <p className="mt-1 text-2xl font-bold tracking-tight text-foreground">{formatPKR(net)}</p>
            </div>
            <BarMeter value={(summary.gross / summary.budget) * 100} label="Budget utilisation" right={`${((summary.gross / summary.budget) * 100).toFixed(0)}%`} />
            <button
              disabled={!isExecutive}
              onClick={() => toast.success("Payroll run queued for sign-off", { description: factoryName })}
              className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-primary px-4 py-3.5 text-sm font-bold text-primary-foreground shadow-[0_12px_30px_rgb(239_86_25/0.28)] transition-all duration-300 ease-in-out hover:-translate-y-0.5 disabled:cursor-not-allowed disabled:opacity-40"
            >
              <PlayCircle className="size-5" />
              Run &amp; Sign-off Payroll
            </button>
            {!isExecutive ? (
              <p className="text-center text-xs text-muted-foreground">Sign-off is limited to CEO, CFO and COO.</p>
            ) : null}
          </div>
        </Card>
      </div>

      <Card>
        <SectionTitle icon={TrendingUp} title="Department load" subtitle="Present vs. roster strength" />
        <div className="grid gap-5 sm:grid-cols-2">
          {depts.map((d) => (
            <BarMeter
              key={d.department}
              label={d.department}
              value={(d.present / d.total) * 100}
              right={`${d.present}/${d.total}`}
            />
          ))}
        </div>
      </Card>
    </div>
  );
}

function Row({ label, value, tone }: { label: string; value: string; tone?: "danger" }) {
  return (
    <div className="flex items-center justify-between rounded-2xl bg-secondary px-4 py-3">
      <span className="text-sm font-medium text-muted-foreground">{label}</span>
      <span className={tone === "danger" ? "text-sm font-bold text-danger" : "text-sm font-bold text-foreground"}>{value}</span>
    </div>
  );
}
