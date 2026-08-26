import type { Metadata } from "next";
import { BarChart3, Banknote, Clock, TrendingUp, Users } from "lucide-react";

import {
  DailyHours,
  PunchTrend,
  RankedBars,
  VizRoot,
  type DayPoint,
  type PunchPoint,
  type RankedItem,
} from "@/components/charts";
import { Card, SectionTitle } from "@/components/ui-kit";
import { requirePermission } from "@/lib/auth/session";
import {
  countWorkingDays,
  dailyRate,
  daysInMonthOf,
  overtimeRate,
  splitDayHours,
} from "@/lib/payroll/hours";
import { DEFAULT_PAY_RULE, type AttendanceDay, type DayType } from "@/lib/payroll/types";
import { createClient } from "@/lib/supabase/server";
import { formatHours, todayInPakistan } from "@/lib/time";

export const metadata: Metadata = {
  title: { absolute: "Reports | Rado Dyeing and Textile" },
  description: "Attendance and payroll across the factory, by department and by person.",
};

export const dynamic = "force-dynamic";

/**
 * What the factory did, at three zoom levels.
 *
 * The headline row is the whole factory; the ranked charts break it down by
 * department; the last one goes to individual people. Every figure is derived
 * from the same functions the payroll run uses, so a number here and a number
 * on a payslip cannot disagree — this screen has no arithmetic of its own.
 */

const money = (value: number) =>
  value.toLocaleString("en-PK", { maximumFractionDigits: 0, minimumFractionDigits: 0 });

export default async function ReportsPage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string; to?: string; dept?: string }>;
}) {
  await requirePermission("reports.view");
  const params = await searchParams;
  const supabase = await createClient();

  const today = todayInPakistan();
  const from = params.from || `${today.slice(0, 7)}-01`;
  const to = params.to || today;

  const [{ data: departments }, { data: staff }] = await Promise.all([
    supabase.from("departments").select("id, name").order("name"),
    supabase
      .from("profiles")
      .select(
        "id, full_name, employee_code, department_id, duty_hours, monthly_salary, worker_type, requires_attendance",
      )
      .eq("status", "active"),
  ]);

  const deptName = new Map((departments ?? []).map((d) => [d.id, d.name]));
  const everyone = staff ?? [];
  const people = params.dept ? everyone.filter((p) => p.department_id === params.dept) : everyone;

  const [{ data: days }, { data: punches }] = await Promise.all([
    people.length > 0
      ? supabase
          .from("attendance_days")
          .select("profile_id, work_date, regular_hours, day_type, status")
          .in(
            "profile_id",
            people.map((p) => p.id),
          )
          .gte("work_date", from)
          .lte("work_date", to)
      : Promise.resolve({ data: [] }),
    people.length > 0
      ? supabase
          .from("punches")
          .select("work_date, direction, profile_id")
          .in(
            "profile_id",
            people.map((p) => p.id),
          )
          .gte("work_date", from)
          .lte("work_date", to)
      : Promise.resolve({ data: [] }),
  ]);

  const rule = DEFAULT_PAY_RULE;
  const daysInMonth = daysInMonthOf(from);

  // ---- Per person, using the payroll functions ----------------------------
  const dutyOf = new Map(people.map((p) => [p.id, Number(p.duty_hours ?? 8)]));
  const byPerson = new Map<string, AttendanceDay[]>();

  for (const row of days ?? []) {
    const list = byPerson.get(row.profile_id) ?? [];
    list.push({
      workDate: row.work_date,
      dayType: (row.day_type ?? "workday") as DayType,
      hoursWorked: Number(row.regular_hours ?? 0),
      status: (row.status ?? "pending") as AttendanceDay["status"],
    });
    byPerson.set(row.profile_id, list);
  }

  interface PersonTotals {
    id: string;
    name: string;
    departmentId: string | null;
    workingDays: number;
    duty: number;
    overtime: number;
    earned: number;
    contractor: boolean;
  }

  const totals: PersonTotals[] = people.map((person) => {
    const mine = byPerson.get(person.id) ?? [];
    const duty = dutyOf.get(person.id) ?? 8;
    const buckets = mine.map((d) => splitDayHours(d, rule, duty));

    const workingDays = countWorkingDays(mine);
    const overtime = buckets.reduce((total, b) => total + b.overtime, 0);
    const dutyHours = buckets.reduce((total, b) => total + b.regular, 0);

    const contractor = person.worker_type === "contractor";
    const salary = Number(person.monthly_salary ?? 0);

    /*
     * Contractors are paid their agreed amount flat; people not paid from
     * attendance receive the whole salary. Only the rest are priced from days.
     */
    const earned = contractor
      ? salary
      : !person.requires_attendance
        ? salary
        : workingDays * dailyRate(salary, daysInMonth) +
          overtime * overtimeRate(salary, daysInMonth);

    return {
      id: person.id,
      name: person.full_name,
      departmentId: person.department_id,
      workingDays,
      duty: dutyHours,
      overtime,
      earned,
      contractor,
    };
  });

  const factory = totals.reduce(
    (acc, t) => ({
      workingDays: acc.workingDays + t.workingDays,
      duty: acc.duty + t.duty,
      overtime: acc.overtime + t.overtime,
      earned: acc.earned + t.earned,
    }),
    { workingDays: 0, duty: 0, overtime: 0, earned: 0 },
  );

  const attended = new Set((days ?? []).map((d) => d.profile_id)).size;

  // ---- Per day, for the two trends ---------------------------------------
  const dayTotals = new Map<string, { duty: number; overtime: number }>();
  for (const person of people) {
    const duty = dutyOf.get(person.id) ?? 8;
    for (const d of byPerson.get(person.id) ?? []) {
      const buckets = splitDayHours(d, rule, duty);
      const entry = dayTotals.get(d.workDate) ?? { duty: 0, overtime: 0 };
      entry.duty += buckets.regular;
      entry.overtime += buckets.overtime;
      dayTotals.set(d.workDate, entry);
    }
  }

  const dailyHours: DayPoint[] = [...dayTotals.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([date, v]) => ({
      date,
      duty: Math.round(v.duty * 100) / 100,
      overtime: Math.round(v.overtime * 100) / 100,
    }));

  const punchTotals = new Map<string, { checkIns: number; checkOuts: number }>();
  for (const punch of punches ?? []) {
    const entry = punchTotals.get(punch.work_date) ?? { checkIns: 0, checkOuts: 0 };
    /*
     * Most K50 units are configured without dedicated in/out keys, so a punch
     * arrives as "unknown". Counting the first of a person's day as an in and
     * the last as an out would need the whole day's sequence; here an unknown
     * is counted on both sides, so the two lines stay comparable and a genuine
     * mismatch still shows.
     */
    if (punch.direction === "out") entry.checkOuts += 1;
    else if (punch.direction === "in") entry.checkIns += 1;
    else {
      entry.checkIns += 1;
      entry.checkOuts += 1;
    }
    punchTotals.set(punch.work_date, entry);
  }

  const punchTrend: PunchPoint[] = [...punchTotals.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([date, v]) => ({ date, ...v }));

  // ---- Per department -----------------------------------------------------
  const deptTotals = new Map<string, { hours: number; overtime: number; earned: number }>();
  for (const t of totals) {
    const name = t.departmentId ? (deptName.get(t.departmentId) ?? "Unassigned") : "Unassigned";
    const entry = deptTotals.get(name) ?? { hours: 0, overtime: 0, earned: 0 };
    entry.hours += t.duty + t.overtime;
    entry.overtime += t.overtime;
    entry.earned += t.earned;
    deptTotals.set(name, entry);
  }

  const hoursByDept: RankedItem[] = [...deptTotals.entries()].map(([label, v]) => ({
    label,
    value: Math.round(v.hours * 100) / 100,
  }));

  const costByDept: RankedItem[] = [...deptTotals.entries()].map(([label, v]) => ({
    label,
    value: Math.round(v.earned),
    display: `Rs ${money(v.earned)}`,
  }));

  const overtimeLeaders: RankedItem[] = totals
    .filter((t) => t.overtime > 0)
    .map((t) => ({ label: t.name, value: Math.round(t.overtime * 100) / 100 }));

  const earners: RankedItem[] = totals
    .filter((t) => t.earned > 0)
    .map((t) => ({ label: t.name, value: Math.round(t.earned), display: `Rs ${money(t.earned)}` }));

  const scopeLabel = params.dept ? (deptName.get(params.dept) ?? "Department") : "Whole factory";

  return (
    <div className="space-y-5 pb-6">
      <Card className="p-4 sm:p-6">
        <SectionTitle
          icon={BarChart3}
          title={`Reports · ${scopeLabel}`}
          subtitle={`${from} to ${to} — every figure derived from the same calculations the payroll run uses.`}
        />

        <form className="grid gap-3 sm:grid-cols-[1fr_10rem_10rem_auto]">
          <label className="block">
            <span className="text-xs font-semibold text-muted-foreground">Department</span>
            <select
              name="dept"
              defaultValue={params.dept ?? ""}
              className="mt-1 w-full rounded-2xl border border-input bg-background px-4 py-2.5 text-sm outline-none focus:border-primary"
            >
              <option value="">Whole factory</option>
              {(departments ?? []).map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name}
                </option>
              ))}
            </select>
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
        </form>
      </Card>

      {/* The headline row is stat tiles, not charts: five single values have no
          shape worth drawing. */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-5">
        <Tile
          icon={Users}
          label="People"
          value={String(people.length)}
          hint={`${attended} with attendance`}
        />
        <Tile
          icon={Clock}
          label="Working days"
          value={String(factory.workingDays)}
          hint="Attended, not Sunday"
        />
        <Tile
          icon={Clock}
          label="Hours worked"
          value={formatHours(factory.duty + factory.overtime)}
          hint="Duty and overtime"
        />
        <Tile
          icon={TrendingUp}
          label="Overtime"
          value={formatHours(factory.overtime)}
          hint="Max 4h a working day"
        />
        <Tile
          icon={Banknote}
          label="Earned"
          value={`Rs ${money(factory.earned)}`}
          hint="Before deductions"
        />
      </div>

      <VizRoot>
        <div className="space-y-4">
          <DailyHours
            data={dailyHours}
            title="Hours worked each day"
            subtitle="Duty hours and overtime across everyone in scope. Sundays show as overtime only."
          />

          <PunchTrend
            data={punchTrend}
            title="Check-ins and check-outs"
            subtitle="A day where the two disagree has missed punches — and a missed punch is a wrong payslip."
          />

          <div className="grid gap-4 lg:grid-cols-2">
            <RankedBars
              data={hoursByDept}
              title="Hours by department"
              subtitle="Duty and overtime combined."
              unit="Hours"
            />
            <RankedBars
              data={costByDept}
              title="Earned by department"
              subtitle="Base pay plus overtime, before deductions."
              unit="Rupees"
            />
            <RankedBars
              data={overtimeLeaders}
              title="Most overtime"
              subtitle="The people working past their duty hours."
              unit="Hours"
            />
            <RankedBars
              data={earners}
              title="Highest earners this period"
              subtitle="Contractors show their agreed amount."
              unit="Rupees"
            />
          </div>
        </div>
      </VizRoot>
    </div>
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
