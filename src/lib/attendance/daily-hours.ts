import { splitDayHours } from "@/lib/payroll/hours";
import type { AttendanceDay, PayRule, SundayPolicy } from "@/lib/payroll/types";

/**
 * Hours per calendar day, split into duty and overtime, summed over people.
 *
 * Extracted so the dashboard and the reports screen cannot disagree about the
 * same month. Both run it through `splitDayHours` — the function payroll uses —
 * rather than reading the stored `regular_hours` and `ot_hours` columns, for
 * the reason the reports screen already gives: a figure recomputed from the
 * payroll rules cannot drift away from the run, and a stored one can.
 *
 * The per-person terms matter and are easy to lose. Someone on a six-hour duty
 * crosses into overtime two hours before someone on eight, a worker who is not
 * overtime-eligible never crosses at all, and a Sunday is overtime regardless
 * of either. Summing raw hours would quietly flatten all three.
 */

/** One person's terms, reduced to what the split depends on. */
export interface DutyPerson {
  id: string;
  /** Contracted hours before overtime begins. Defaults to eight. */
  dutyHours: number;
  overtimeEligible?: boolean;
  sundayPolicy?: SundayPolicy;
}

/** Structurally the chart's `DayPoint`, without importing from a client file. */
export interface DailyHourPoint {
  date: string;
  duty: number;
  overtime: number;
}

/** Two decimals: hours are displayed to one, and summing raw floats drifts. */
function round(value: number): number {
  return Math.round(value * 100) / 100;
}

export function dailyHourTotals(
  people: readonly DutyPerson[],
  daysByPerson: ReadonlyMap<string, readonly AttendanceDay[]>,
  rule: PayRule,
): DailyHourPoint[] {
  const byDate = new Map<string, { duty: number; overtime: number }>();

  for (const person of people) {
    for (const day of daysByPerson.get(person.id) ?? []) {
      /*
       * Built by spreading rather than by assigning undefined: the project
       * runs with exactOptionalPropertyTypes, where an explicit undefined is
       * not the same as an absent key, and splitDayHours reads its own
       * defaults from absence.
       */
      const buckets = splitDayHours(day, rule, person.dutyHours, {
        ...(person.overtimeEligible === undefined
          ? {}
          : { overtimeEligible: person.overtimeEligible }),
        ...(person.sundayPolicy === undefined ? {} : { sundayPolicy: person.sundayPolicy }),
      });

      const entry = byDate.get(day.workDate) ?? { duty: 0, overtime: 0 };
      entry.duty += buckets.regular;
      entry.overtime += buckets.overtime;
      byDate.set(day.workDate, entry);
    }
  }

  return [...byDate.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([date, value]) => ({
      date,
      duty: round(value.duty),
      overtime: round(value.overtime),
    }));
}
