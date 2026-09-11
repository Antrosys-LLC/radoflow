import { dailyRate, daysInMonthOf } from "@/lib/payroll/hours";

/**
 * A monthly salary, broken down to the hour and the minute.
 *
 * The factory quotes pay one way — "thirty thousand a month" — and settles
 * arguments another: an hour short, twenty minutes late, half a day covered.
 * Those questions are asked constantly and were being answered on the back of
 * an envelope, so this puts the same arithmetic payroll uses in one place and
 * lets every screen show it.
 *
 * The chain is deliberately the one payroll already follows, not a new one:
 * a month divides into that month's own calendar days, a day divides into the
 * hours the salary is stated to cover, and an hour into sixty minutes. Two
 * different divisors for one salary is how a payslip and a screen come to
 * disagree by a few rupees, which is the kind of gap nobody can explain and
 * everybody remembers.
 *
 * Calendar days rather than a fixed 26 or 30: `dailyRate` uses the real length
 * of the month, so February pays slightly more a day than January for the same
 * salary, and this has to match it exactly.
 */

export interface DerivedRates {
  /** Days the month actually has — the divisor behind everything below. */
  daysInMonth: number;
  perDay: number;
  perHour: number;
  perMinute: number;
  /**
   * What an overtime hour is worth: an eighth of the daily rate, whatever the
   * duty day is. Kept beside the plain hourly figure because they differ for
   * anybody on a twelve-hour duty day, and confusing the two overpays or
   * underpays every overtime hour that person works.
   */
  perOvertimeHour: number;
}

/** Two decimal places — money, and the same rounding payroll applies. */
function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

/**
 * Four decimal places for a per-minute figure.
 *
 * A minute of a 30,000 salary is about two and a half rupees; rounded to
 * paisa, twenty minutes of lateness priced from the rounded figure drifts from
 * the same twenty minutes priced from the hour. Kept fine here and rounded
 * once, at the point an actual deduction is worked out.
 */
function round4(value: number): number {
  return Math.round(value * 10000) / 10000;
}

export function deriveRates(
  monthlySalary: number,
  dutyHours: number,
  /** Any date inside the month being priced. Defaults to this month. */
  onDate: string = new Date().toISOString().slice(0, 10),
): DerivedRates {
  const daysInMonth = daysInMonthOf(onDate);
  const perDay = dailyRate(Math.max(0, monthlySalary), daysInMonth);

  // A duty day of zero or less would divide by zero and report an infinite
  // hourly rate on a screen. Eight is the factory's standard day and the same
  // fallback the rest of the app uses for a missing duty figure.
  const hours = dutyHours > 0 ? dutyHours : 8;

  const perHour = round2(perDay / hours);

  return {
    daysInMonth,
    perDay,
    perHour,
    // Derived from the unrounded hourly figure, not from `perHour` — rounding
    // twice compounds the error, and this is the finest figure of the four.
    perMinute: round4(perDay / hours / 60),
    perOvertimeHour: round2(perDay / 8),
  };
}
