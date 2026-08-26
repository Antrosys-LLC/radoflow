import type { Metadata } from "next";
import Link from "next/link";
import { CalendarDays, Clock, ScrollText, TriangleAlert } from "lucide-react";

import { Card, SectionTitle } from "@/components/ui-kit";
import { requirePermission } from "@/lib/auth/session";
import { splitDayHours, dailyRate, isSunday, overtimeRate } from "@/lib/payroll/hours";
import { DEFAULT_PAY_RULE, type AttendanceDay, type DayType } from "@/lib/payroll/types";
import { createClient } from "@/lib/supabase/server";
import { formatHours, formatTime, todayInPakistan } from "@/lib/time";
import { cn } from "@/lib/utils";

export const metadata: Metadata = {
  title: { absolute: "Attendance Log | Rado Dyeing and Textile" },
  description: "Every check-in, check-out and the pay it produces, day by day.",
};

export const dynamic = "force-dynamic";

/**
 * The audit trail behind a payslip.
 *
 * The live board answers "who is here now". This answers the question that
 * follows a disputed payslip — "which days did you count, and what did each
 * one pay" — by showing the punches, the hours they produced, and the split
 * into duty and overtime, on one row per day.
 *
 * The split is recomputed here from the same functions payroll uses rather
 * than read from stored columns, so what this screen shows and what the run
 * pays cannot drift apart.
 */

/** The default window: the month so far. */
function defaultRange(): { from: string; to: string } {
  const today = todayInPakistan();
  return { from: `${today.slice(0, 7)}-01`, to: today };
}

export default async function AttendanceLogPage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string; to?: string; person?: string }>;
}) {
  const session = await requirePermission("attendance.view");
  const params = await searchParams;
  const supabase = await createClient();

  const fallback = defaultRange();
  const from = params.from || fallback.from;
  const to = params.to || fallback.to;

  const { data: staff } = await supabase
    .from("profiles")
    .select("id, full_name, employee_code, duty_hours, monthly_salary, worker_type, pay_class")
    .eq("status", "active")
    .order("full_name");

  const people = staff ?? [];

  /*
   * Defaults to the viewer when they are in the list, so someone opening their
   * own log does not first have to find themselves in a dropdown of hundreds.
   */
  const selectedId =
    params.person || (people.some((p) => p.id === session.userId) ? session.userId : people[0]?.id);

  const person = people.find((p) => p.id === selectedId);

  const { data: days } = selectedId
    ? await supabase
        .from("attendance_days")
        .select(
          "work_date, first_in, last_out, regular_hours, ot_hours, weekend_hours, holiday_hours, day_type, status, minutes_late, is_late, is_manual, note",
        )
        .eq("profile_id", selectedId)
        .gte("work_date", from)
        .lte("work_date", to)
        .order("work_date", { ascending: false })
    : { data: [] };

  const { data: punches } = selectedId
    ? await supabase
        .from("punches")
        .select("work_date, punched_at, direction, source")
        .eq("profile_id", selectedId)
        .gte("work_date", from)
        .lte("work_date", to)
        .order("punched_at")
    : { data: [] };

  const punchesByDate = new Map<string, { punched_at: string; direction: string }[]>();
  for (const punch of punches ?? []) {
    const list = punchesByDate.get(punch.work_date) ?? [];
    list.push({ punched_at: punch.punched_at, direction: punch.direction });
    punchesByDate.set(punch.work_date, list);
  }

  const dutyHours = Number(person?.duty_hours ?? 8);
  const rule = DEFAULT_PAY_RULE;

  // The month of the range start decides the divisor, matching how a run prices.
  const daysInMonth = new Date(Number(from.slice(0, 4)), Number(from.slice(5, 7)), 0).getDate();
  const perDay = dailyRate(Number(person?.monthly_salary ?? 0), daysInMonth);
  const perOtHour = overtimeRate(Number(person?.monthly_salary ?? 0), daysInMonth);

  const rows = (days ?? []).map((row) => {
    const day: AttendanceDay = {
      workDate: row.work_date,
      dayType: (row.day_type ?? "workday") as DayType,
      hoursWorked: Number(row.regular_hours ?? 0),
      status: (row.status ?? "pending") as AttendanceDay["status"],
      minutesLate: row.minutes_late ?? 0,
    };

    const buckets = splitDayHours(day, rule, dutyHours);
    const sunday = isSunday(row.work_date);
    const attended = row.status === "present" || row.status === "partial";

    return {
      ...row,
      buckets,
      sunday,
      // The same test countWorkingDays applies, shown per row so the total is
      // checkable rather than asserted.
      countsAsWorkingDay: attended && !sunday,
      punches: punchesByDate.get(row.work_date) ?? [],
    };
  });

  const workingDays = rows.filter((r) => r.countsAsWorkingDay).length;
  const otHours = rows.reduce((total, r) => total + r.buckets.overtime, 0);
  const lateDays = rows.filter((r) => r.is_late).length;
  const clockedHours = rows.reduce((total, r) => total + Number(r.regular_hours ?? 0), 0);

  const isContractor = person?.worker_type === "contractor";
  const money = (value: number) =>
    value.toLocaleString("en-PK", { maximumFractionDigits: 2, minimumFractionDigits: 2 });

  return (
    <div className="space-y-5 pb-6">
      <Card className="p-4 sm:p-6">
        <SectionTitle
          icon={ScrollText}
          title="Attendance log"
          subtitle="Every punch, the hours it produced, and how those hours are paid."
          action={
            <Link
              href="/attendance"
              className="rounded-xl bg-secondary px-4 py-2.5 text-sm font-semibold text-foreground transition-colors hover:text-primary"
            >
              Live board
            </Link>
          }
        />

        {/* A plain GET form: the filters belong in the URL so a log can be
            linked to in an email about a disputed payslip. */}
        <form className="grid gap-3 sm:grid-cols-[1fr_10rem_10rem_auto]">
          <label className="block">
            <span className="text-xs font-semibold text-muted-foreground">Person</span>
            <select
              name="person"
              defaultValue={selectedId ?? ""}
              className="mt-1 w-full rounded-2xl border border-input bg-background px-4 py-2.5 text-sm outline-none focus:border-primary"
            >
              {people.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.full_name} · {p.employee_code}
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

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Tile
          icon={CalendarDays}
          label="Working days"
          value={String(workingDays)}
          hint="Attended, not Sunday"
        />
        <Tile
          icon={Clock}
          label="Hours clocked"
          value={formatHours(clockedHours)}
          hint="Across every day shown"
        />
        <Tile
          icon={Clock}
          label="Overtime hours"
          value={formatHours(otHours)}
          hint={`Beyond ${dutyHours}h, plus Sundays`}
        />
        <Tile
          icon={TriangleAlert}
          label="Late arrivals"
          value={String(lateDays)}
          hint="Past the grace period"
        />
      </div>

      {person && !isContractor && perDay > 0 ? (
        <Card className="p-4 sm:p-5">
          <p className="text-sm text-muted-foreground">
            At <strong className="text-foreground">Rs {money(perDay)}</strong> a day and{" "}
            <strong className="text-foreground">Rs {money(perOtHour)}</strong> an overtime hour, the
            days above come to{" "}
            <strong className="text-foreground">
              Rs {money(workingDays * perDay + otHours * perOtHour)}
            </strong>{" "}
            before deductions.
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            {workingDays} × {money(perDay)} + {formatHours(otHours)} × {money(perOtHour)}. The
            payroll run recalculates this from the same figures.
          </p>
        </Card>
      ) : null}

      {isContractor ? (
        <Card className="p-4 sm:p-5">
          <p className="text-sm text-warning">
            {person?.full_name} is a contractor. These hours are recorded so the invoice can be
            checked, but they do not price anything — the agreed amount is paid flat.
          </p>
        </Card>
      ) : null}

      <Card className="p-0">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[54rem] text-sm">
            <thead>
              <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-muted-foreground">
                <th className="px-4 py-3 font-semibold">Date</th>
                <th className="px-4 py-3 font-semibold">In</th>
                <th className="px-4 py-3 font-semibold">Out</th>
                <th className="px-4 py-3 font-semibold">Punches</th>
                <th className="px-4 py-3 text-right font-semibold">Clocked</th>
                <th className="px-4 py-3 text-right font-semibold">Duty</th>
                <th className="px-4 py-3 text-right font-semibold">Overtime</th>
                <th className="px-4 py-3 text-right font-semibold">Late</th>
                <th className="px-4 py-3 font-semibold">Counts</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr
                  key={row.work_date}
                  className={cn(
                    "border-b border-border/60 last:border-0",
                    row.sunday && "bg-secondary/60",
                  )}
                >
                  <td className="px-4 py-3">
                    <span className="font-semibold text-foreground">{row.work_date}</span>
                    {row.sunday ? (
                      <span className="ml-2 rounded-full bg-warning-soft px-2 py-0.5 text-[10px] font-bold uppercase text-warning">
                        Sunday
                      </span>
                    ) : null}
                    {row.is_manual ? (
                      <span className="ml-2 rounded-full bg-secondary px-2 py-0.5 text-[10px] font-bold uppercase text-muted-foreground">
                        Edited
                      </span>
                    ) : null}
                  </td>
                  <td className="px-4 py-3 tabular-nums">
                    {row.first_in ? formatTime(row.first_in) : "—"}
                  </td>
                  <td className="px-4 py-3 tabular-nums">
                    {row.last_out ? formatTime(row.last_out) : "—"}
                  </td>
                  <td className="px-4 py-3 text-xs text-muted-foreground">
                    {row.punches.length > 0
                      ? row.punches.map((p) => formatTime(p.punched_at)).join(" · ")
                      : "none"}
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums">
                    {formatHours(Number(row.regular_hours ?? 0))}
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums">
                    {formatHours(row.buckets.regular)}
                  </td>
                  <td
                    className={cn(
                      "px-4 py-3 text-right tabular-nums",
                      row.buckets.overtime > 0 && "font-semibold text-success",
                    )}
                  >
                    {row.buckets.overtime > 0 ? formatHours(row.buckets.overtime) : "—"}
                  </td>
                  <td
                    className={cn(
                      "px-4 py-3 text-right tabular-nums",
                      row.is_late && "font-semibold text-danger",
                    )}
                  >
                    {row.minutes_late ? `${row.minutes_late}m` : "—"}
                  </td>
                  <td className="px-4 py-3">
                    {row.countsAsWorkingDay ? (
                      <span className="rounded-full bg-success-soft px-2.5 py-1 text-[10px] font-bold uppercase text-success">
                        1 day
                      </span>
                    ) : (
                      <span className="text-xs text-muted-foreground">
                        {row.sunday ? "overtime only" : row.status}
                      </span>
                    )}
                  </td>
                </tr>
              ))}

              {rows.length === 0 ? (
                <tr>
                  <td colSpan={9} className="px-4 py-10 text-center text-sm text-muted-foreground">
                    No attendance recorded between {from} and {to}.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </Card>
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
