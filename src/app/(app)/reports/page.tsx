import type { Metadata } from "next";
import { BarChart3, Banknote, Clock, TrendingUp, Users } from "lucide-react";

import {
  DailyHours,
  DonutChart,
  PunchTrend,
  RadialArea,
  RankedBars,
  ScatterPlot,
  VizRoot,
  type DayPoint,
  type PunchPoint,
  type RankedItem,
  type ScatterPoint,
  type Slice,
} from "@/components/charts";
import { AskAbout } from "@/components/assistant/ask-about";
import { ExportButtons } from "@/components/export-buttons";
import { Fill } from "@/components/fill";
import { Latin } from "@/components/latin";
import { Card, SectionTitle } from "@/components/ui-kit";
import { requirePermission } from "@/lib/auth/session";
import { dictionaryFor } from "@/lib/i18n";
import { dailyHourTotals } from "@/lib/attendance/daily-hours";
import {
  countWorkingDays,
  dailyRate,
  daysInMonthOf,
  overtimeRate,
  splitDayHours,
} from "@/lib/payroll/hours";
import { DEFAULT_PAY_RULE, type AttendanceDay, type DayType } from "@/lib/payroll/types";
import { selectInBatches } from "@/lib/supabase/in-batches";
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
  const session = await requirePermission("reports.view");
  const t = dictionaryFor(session.profile.language);
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
        "id, full_name, employee_code, department_id, duty_hours, monthly_salary, worker_type, requires_attendance, overtime_eligible, sunday_policy",
      )
      .eq("status", "active"),
  ]);

  const deptName = new Map((departments ?? []).map((d) => [d.id, d.name]));
  const everyone = staff ?? [];
  const people = params.dept ? everyone.filter((p) => p.department_id === params.dept) : everyone;

  /*
   * Both reads, batched by id and run concurrently.
   *
   * Batched because PostgREST takes its filters in the URI: four hundred
   * profile ids is a fifteen-kilobyte request line, which is slow at best and
   * rejected at worst — and a rejected read hands back no rows, which this
   * screen would draw as a factory that did no work all month. That is the
   * exact failure `selectInBatches` exists to prevent, and this screen was the
   * one place still building the long URI by hand.
   */
  const profileIds = people.map((person) => person.id);

  const [days, punches] = await Promise.all([
    selectInBatches(
      profileIds,
      (batch) =>
        supabase
          .from("attendance_days")
          .select("profile_id, work_date, regular_hours, day_type, status, hours_are_final")
          .in("profile_id", batch)
          .gte("work_date", from)
          .lte("work_date", to),
      `Could not read attendance for ${from} to ${to}`,
    ),
    selectInBatches(
      profileIds,
      (batch) =>
        supabase
          .from("punches")
          .select("work_date, direction, profile_id")
          .in("profile_id", batch)
          .gte("work_date", from)
          .lte("work_date", to),
      `Could not read punches for ${from} to ${to}`,
    ),
  ]);

  const rule = DEFAULT_PAY_RULE;
  const daysInMonth = daysInMonthOf(from);

  // ---- Per person, using the payroll functions ----------------------------
  const dutyOf = new Map(people.map((p) => [p.id, Number(p.duty_hours ?? 8)]));
  const byPerson = new Map<string, AttendanceDay[]>();

  for (const row of days) {
    const list = byPerson.get(row.profile_id) ?? [];
    list.push({
      workDate: row.work_date,
      dayType: (row.day_type ?? "workday") as DayType,
      hoursWorked: Number(row.regular_hours ?? 0),
      status: (row.status ?? "pending") as AttendanceDay["status"],
      // Without this, a day payroll already floored gets rounded a second
      // time here, and this screen's numbers stop agreeing with a payslip
      // for the same month — the guarantee this page's own header comment
      // makes.
      hoursAreFinal: row.hours_are_final ?? false,
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
    const buckets = mine.map((d) =>
      splitDayHours(d, rule, duty, {
        overtimeEligible: person.overtime_eligible,
        sundayPolicy: person.sunday_policy,
      }),
    );

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
    (acc, row) => ({
      workingDays: acc.workingDays + row.workingDays,
      duty: acc.duty + row.duty,
      overtime: acc.overtime + row.overtime,
      earned: acc.earned + row.earned,
    }),
    { workingDays: 0, duty: 0, overtime: 0, earned: 0 },
  );

  const attended = new Set(days.map((d) => d.profile_id)).size;

  // ---- Per day, for the two trends ---------------------------------------
  // Shared with the dashboard so the two screens cannot disagree about a month.
  const dailyHours: DayPoint[] = dailyHourTotals(
    people.map((person) => ({
      id: person.id,
      dutyHours: dutyOf.get(person.id) ?? 8,
      overtimeEligible: person.overtime_eligible,
      sundayPolicy: person.sunday_policy,
    })),
    byPerson,
    rule,
  );

  const punchTotals = new Map<string, { checkIns: number; checkOuts: number }>();
  for (const punch of punches) {
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
  for (const person of totals) {
    const name = person.departmentId
      ? (deptName.get(person.departmentId) ?? t.common.unassigned)
      : t.common.unassigned;
    const entry = deptTotals.get(name) ?? { hours: 0, overtime: 0, earned: 0 };
    entry.hours += person.duty + person.overtime;
    entry.overtime += person.overtime;
    entry.earned += person.earned;
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
    .filter((row) => row.overtime > 0)
    .map((row) => ({ label: row.name, value: Math.round(row.overtime * 100) / 100 }));

  const earners: RankedItem[] = totals
    .filter((row) => row.earned > 0)
    .map((row) => ({
      label: row.name,
      value: Math.round(row.earned),
      display: `Rs ${money(row.earned)}`,
    }));

  // Headcount by department, as shares — the question a pie actually answers.
  const headcountByDept: Slice[] = [...deptTotals.keys()].map((label) => ({
    label,
    value: totals.filter(
      (row) =>
        (row.departmentId
          ? (deptName.get(row.departmentId) ?? t.common.unassigned)
          : t.common.unassigned) === label,
    ).length,
  }));

  const salaryByDept: Slice[] = [...deptTotals.entries()].map(([label, v]) => ({
    label,
    value: Math.round(v.earned),
  }));

  /*
   * How each arrangement is spread across the workforce. Five categories at
   * most, which is what a donut can carry without becoming a colour quiz.
   */
  const arrangements: Slice[] = [
    { label: t.reports.arrangement.standard, value: 0 },
    { label: t.reports.arrangement.twelveHour, value: 0 },
    { label: t.reports.arrangement.noOvertime, value: 0 },
    { label: t.reports.arrangement.contractors, value: 0 },
    { label: t.reports.arrangement.notFromAttendance, value: 0 },
  ];

  for (const person of people) {
    if (person.worker_type === "contractor") arrangements[3]!.value++;
    else if (!person.requires_attendance) arrangements[4]!.value++;
    else if (!person.overtime_eligible) arrangements[2]!.value++;
    else if (Number(person.duty_hours) >= 12) arrangements[1]!.value++;
    else arrangements[0]!.value++;
  }

  /*
   * Salary against hours worked, one dot per person.
   *
   * The outliers are the point: somebody high on the salary axis and flat on
   * the hours axis is either not tracked by a terminal or is not turning up,
   * and the two look identical on a table of averages.
   */
  const scatter: ScatterPoint[] = totals
    .filter((row) => !row.contractor)
    .map((row) => ({
      label: row.name,
      x: Math.round((row.duty + row.overtime) * 10) / 10,
      y: Math.round(row.earned),
      group: row.departmentId
        ? (deptName.get(row.departmentId) ?? t.common.unassigned)
        : t.common.unassigned,
    }));

  const overtimeByDept: Slice[] = [...deptTotals.entries()]
    .map(([label, v]) => ({ label, value: Math.round(v.overtime * 100) / 100 }))
    .filter((d) => d.value > 0);

  const exportParams = { from, to, dept: params.dept };

  // A department name as the office typed it, or the whole factory. Either
  // way it lands in the heading through `<Fill>`, which wraps it — a
  // department called "Dyeing 2" must not be reordered inside an Urdu title.
  const scopeLabel = params.dept
    ? (deptName.get(params.dept) ?? t.common.department)
    : t.reports.wholeFactory;

  return (
    <div className="space-y-5 pb-6">
      <Card className="p-4 sm:p-6">
        <SectionTitle
          icon={BarChart3}
          title={<Fill template={t.reports.title} values={{ scope: scopeLabel }} />}
          subtitle={<Fill template={t.reports.periodHint} values={{ from, to }} />}
          action={
            <div className="flex flex-wrap items-center gap-2">
              {/* The headline figures, handed over with the question. Asking
                  "why is overtime up" against a screen the assistant cannot
                  see was the gap this closes. */}
              <AskAbout
                label={`${scopeLabel} · ${from} – ${to}`}
                context={{
                  surface: "reports",
                  subject: `${scopeLabel}, ${from} to ${to}`,
                  facts: {
                    people: people.length,
                    withAttendance: attended,
                    workingDays: factory.workingDays,
                    dutyHours: Math.round(factory.duty * 10) / 10,
                    overtimeHours: Math.round(factory.overtime * 10) / 10,
                    earnedRs: Math.round(factory.earned),
                  },
                }}
              />
              <ExportButtons kind="payroll" params={exportParams} />
            </div>
          }
        />

        <form className="grid gap-3 sm:grid-cols-[1fr_10rem_10rem_auto]">
          <label className="block">
            <span className="text-xs font-semibold text-muted-foreground">
              {t.common.department}
            </span>
            <select
              name="dept"
              defaultValue={params.dept ?? ""}
              className="mt-1 w-full rounded-2xl border border-input bg-background px-4 py-2.5 text-sm outline-none focus:border-primary"
            >
              <option value="">{t.reports.wholeFactory}</option>
              {(departments ?? []).map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name}
                </option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className="text-xs font-semibold text-muted-foreground">{t.reports.from}</span>
            <input
              type="date"
              name="from"
              defaultValue={from}
              className="mt-1 w-full rounded-2xl border border-input bg-background px-4 py-2.5 text-sm outline-none focus:border-primary"
            />
          </label>
          <label className="block">
            <span className="text-xs font-semibold text-muted-foreground">{t.reports.to}</span>
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
        </form>
      </Card>

      {/* The headline row is stat tiles, not charts: five single values have no
          shape worth drawing. */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-5">
        <Tile
          icon={Users}
          label={t.reports.people}
          value={String(people.length)}
          hint={<Fill template={t.reports.peopleHint} values={{ count: attended }} />}
        />
        <Tile
          icon={Clock}
          label={t.reports.workingDays}
          value={String(factory.workingDays)}
          hint={t.reports.workingDaysHint}
        />
        <Tile
          icon={Clock}
          label={t.reports.hoursWorked}
          value={formatHours(factory.duty + factory.overtime)}
          hint={t.reports.hoursWorkedHint}
        />
        <Tile
          icon={TrendingUp}
          label={t.reports.overtime}
          value={formatHours(factory.overtime)}
          hint={t.reports.overtimeHint}
        />
        <Tile
          icon={Banknote}
          label={t.reports.earned}
          value={`Rs ${money(factory.earned)}`}
          hint={t.reports.earnedHint}
        />
      </div>

      <VizRoot>
        <div className="space-y-4">
          <DailyHours
            data={dailyHours}
            title={t.reports.dailyHours}
            subtitle={t.reports.dailyHoursHint}
          />

          <PunchTrend
            data={punchTrend}
            title={t.reports.punches}
            subtitle={t.reports.punchesHint}
          />

          <div className="grid gap-4 lg:grid-cols-2">
            <RankedBars
              data={hoursByDept}
              title={t.reports.hoursByDept}
              subtitle={t.reports.hoursByDeptHint}
              unit={t.reports.unitHours}
            />
            <RankedBars
              data={costByDept}
              title={t.reports.earnedByDept}
              subtitle={t.reports.earnedByDeptHint}
              unit={t.reports.unitRupees}
            />
            <RankedBars
              data={overtimeLeaders}
              title={t.reports.mostOvertime}
              subtitle={t.reports.mostOvertimeHint}
              unit={t.reports.unitHours}
            />
            <RankedBars
              data={earners}
              title={t.reports.topEarners}
              subtitle={t.reports.topEarnersHint}
              unit={t.reports.unitRupees}
            />

            <DonutChart
              data={headcountByDept}
              title={t.reports.headcount}
              subtitle={t.reports.headcountHint}
              unit={t.reports.unitPeople}
            />

            <DonutChart
              data={arrangements}
              title={t.reports.arrangements}
              subtitle={t.reports.arrangementsHint}
              unit={t.reports.unitPeople}
            />

            <DonutChart
              data={salaryByDept}
              title={t.reports.wageBill}
              subtitle={t.reports.wageBillHint}
              unit={t.reports.unitRupeesLower}
              format="money"
            />

            <RadialArea
              data={overtimeByDept}
              title={t.reports.overtimeByDept}
              subtitle={t.reports.overtimeByDeptHint}
              format="hours"
            />
          </div>

          <ScatterPlot
            data={scatter}
            title={t.reports.earningsAgainstHours}
            subtitle={t.reports.earningsAgainstHoursHint}
            xLabel={t.reports.axisHours}
            yLabel={t.reports.axisEarned}
            formatY="money"
            formatX="hours"
          />
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
  /** Always digits, so it is wrapped rather than translated. */
  value: string;
  hint: React.ReactNode;
}) {
  return (
    <Card className="p-4">
      <div className="flex items-center gap-2 text-muted-foreground">
        <Icon className="size-4" />
        <span className="text-xs font-semibold uppercase tracking-wide">{label}</span>
      </div>
      <p className="mt-2 text-2xl font-bold tabular-nums text-foreground">
        <Latin>{value}</Latin>
      </p>
      <p className="mt-0.5 text-xs text-muted-foreground">{hint}</p>
    </Card>
  );
}
