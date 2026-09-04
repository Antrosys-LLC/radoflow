import type { AttendanceDay, HourBuckets, PayRule, SundayPolicy } from "./types";

/**
 * Rounds worked hours to the site's configured granularity.
 *
 * Rounding happens once, on the day's total, rather than per punch pair — so a
 * worker cannot lose minutes twice by clocking out for lunch.
 */
export function roundHours(hours: number, roundToMinutes: number): number {
  if (roundToMinutes <= 0) return round2(hours);
  const step = roundToMinutes / 60;
  return round2(Math.round(hours / step) * step);
}

/** Half-up to 2 decimals, guarding against binary-float representation error. */
export function round2(value: number): number {
  const scaled = value * 100;
  // 1.005 * 100 is 100.49999999999999 in IEEE-754; nudge before rounding.
  const corrected = Math.round(scaled + Math.sign(scaled) * Number.EPSILON * Math.abs(scaled));
  return corrected / 100;
}

/** Money rounding is the same half-up rule, named for intent at call sites. */
export const roundMoney = round2;

const EMPTY_BUCKETS: HourBuckets = { regular: 0, overtime: 0, weekend: 0, holiday: 0 };

/**
 * The parts of one person's arrangement that change how a day is split.
 *
 * Passed as an object rather than as more positional arguments: both are
 * optional and both are about overtime, and a call reading
 * `splitDayHours(day, rule, 8, false, "off")` says nothing about which is which.
 */
export interface DutyTerms {
  /** False pays no overtime at all, on any day. Defaults to true. */
  overtimeEligible?: boolean;
  /** `adjust_in_leave` repays a worked Sunday with a day off, not with money. */
  sundayPolicy?: SundayPolicy;
}

/**
 * True when a `YYYY-MM-DD` work date falls on a Sunday.
 *
 * Parsed as UTC deliberately. `new Date("2026-08-30")` is already UTC midnight,
 * but `new Date(2026, 7, 30)` is local midnight, and west of Greenwich those
 * two land on different weekdays. Payroll must not decide that a Sunday was a
 * Saturday because of where the server happens to be.
 */
export function isSunday(workDate: string): boolean {
  const parsed = new Date(`${workDate}T00:00:00Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.getUTCDay() === 0;
}

/** Calendar days in the month a `YYYY-MM-DD` date falls in: 28, 29, 30 or 31. */
export function daysInMonthOf(workDate: string): number {
  const parsed = new Date(`${workDate}T00:00:00Z`);
  if (Number.isNaN(parsed.getTime())) return 30;
  // Day 0 of the next month is the last day of this one.
  return new Date(Date.UTC(parsed.getUTCFullYear(), parsed.getUTCMonth() + 1, 0)).getUTCDate();
}

/**
 * What one day of a monthly salary is worth.
 *
 * Divided by the real length of the month, so the same salary is worth more
 * per day in February than in August. The salary figure is a daily rate rather
 * than a guaranteed take-home: Sundays are never working days, so nobody is
 * paid for all 30 or 31 of them.
 */
export function dailyRate(monthlySalary: number, daysInMonth: number): number {
  if (daysInMonth <= 0) return 0;
  return round2(monthlySalary / daysInMonth);
}

/**
 * The rupee value of one overtime hour: an eighth of the daily rate.
 *
 * Always an eighth, including for someone whose duty day is twelve hours. Their
 * overtime hour is therefore worth more than their duty hour, which is the
 * point — otherwise the extra time carries no reward.
 *
 * This deliberately derives a premium from basic pay, reversing the rule the
 * rest of this module follows for weekend and holiday rates. See the design
 * note in docs/superpowers/specs/2026-08-25-duty-hours-and-salary-formula-design.md.
 */
export function overtimeRate(monthlySalary: number, daysInMonth: number): number {
  return round2(dailyRate(monthlySalary, daysInMonth) / 8);
}

/**
 * A day's worked hours at the granularity payroll should price.
 *
 * One place, because `splitDayHours` and `excessHours` must agree: if the
 * ceiling measured a differently-rounded figure from the one being paid, the
 * flagged-hours total would drift away from the hours it is meant to describe.
 */
export function workedHoursOf(day: AttendanceDay, rule: PayRule): number {
  const worked = Math.max(0, day.hoursWorked);
  return day.hoursAreFinal ? round2(worked) : roundHours(worked, rule.roundToMinutes);
}

/**
 * Splits a day's worked hours into the buckets that attract different rates.
 *
 * Sunday is decided first, but only when the calendar left it at its default:
 * a Sunday with `day_type: "off"` is never a working day, so every hour
 * worked on one is overtime. A *specific* Sunday the calendar has explicitly
 * overridden — to `workday`, `special_working`, `weekend_working` or
 * `holiday`, because the factory ran it as an ordinary shift and gave a
 * different weekday off in exchange — is deliberately not caught by this
 * branch, and falls through to be treated exactly like that day type on any
 * other date. `resolve_day_type()` only ever returns something other than
 * `off`/`workday`-from-the-weekly-pattern when a `calendar_days` row exists
 * for that exact date, so this cannot be tripped by accident. The rest of the
 * week falls to the day type:
 *  - workday / special_working → up to the person's duty hours is regular, the
 *    rest is overtime (only once it clears the overtime threshold).
 *  - weekend_working, or any work on an `off` day → every hour is weekend-rated.
 *    Overtime is deliberately *not* stacked on top, since the weekend rate
 *    already exceeds the overtime rate.
 *  - holiday → every hour is holiday-rated.
 *
 * `dutyHours` is how many hours this person's salary covers. A guard's twelve
 * are all duty; an operator's salary covers eight and their last four on the
 * same shift are overtime. Omitted, it falls back to the site's standard day,
 * which is what every caller wanted before duty hours existed.
 */
export function splitDayHours(
  day: AttendanceDay,
  rule: PayRule,
  dutyHours?: number,
  terms: DutyTerms = {},
): HourBuckets {
  const worked = workedHoursOf(day, rule);
  if (worked <= 0) return { ...EMPTY_BUCKETS };

  const earnsOvertime = terms.overtimeEligible ?? true;

  // Sunday first, but only while the calendar has not overridden this exact
  // date — otherwise the day type would route these hours to the weekend
  // bucket and pay them at the weekend rate instead of overtime.
  if (isSunday(day.workDate) && day.dayType === "off") {
    /*
     * Two arrangements pay nothing for a Sunday. Someone on no overtime at all
     * earns none here either; someone whose Sunday is "adjusted in leave" is
     * repaid with a day off rather than with money. The hours are still
     * dropped rather than moved to another bucket, so a Sunday cannot quietly
     * become paid duty time.
     */
    if (!earnsOvertime || terms.sundayPolicy === "adjust_in_leave") {
      return { ...EMPTY_BUCKETS };
    }
    return { ...EMPTY_BUCKETS, overtime: worked };
  }

  switch (day.dayType) {
    case "holiday":
      return { ...EMPTY_BUCKETS, holiday: worked };

    case "weekend_working":
    case "off":
      // Turning up on a day the factory was closed is paid at the weekend rate
      // for the whole shift.
      return { ...EMPTY_BUCKETS, weekend: worked };

    case "workday":
    case "special_working": {
      const standard = dutyHours && dutyHours > 0 ? dutyHours : rule.standardHoursPerDay;
      if (worked <= standard) {
        return { ...EMPTY_BUCKETS, regular: worked };
      }
      const excess = round2(worked - standard);
      const threshold = rule.otThresholdMinutes / 60;
      if (excess < threshold) {
        // Short overruns are absorbed into the standard day rather than
        // generating a few paisa of overtime.
        return { ...EMPTY_BUCKETS, regular: worked };
      }

      /*
       * Overtime stops at the daily ceiling. Hours past it are dropped rather
       * than moved into the regular bucket: paying them at the duty rate would
       * quietly reintroduce the uncapped cost the ceiling exists to prevent,
       * and a terminal left running overnight would show up as a raise.
       */
      // Someone on no overtime keeps the duty hours and nothing more.
      if (!earnsOvertime) return { ...EMPTY_BUCKETS, regular: standard };

      const cap = rule.otDailyCapHours;
      const payable = cap >= 0 ? Math.min(excess, cap) : excess;

      if (payable <= 0) return { ...EMPTY_BUCKETS, regular: standard };
      return { ...EMPTY_BUCKETS, regular: standard, overtime: round2(payable) };
    }

    default:
      return { ...EMPTY_BUCKETS, regular: worked };
  }
}

/**
 * Worked hours a day's buckets do not account for — dropped by the overtime
 * ceiling rather than paid or moved anywhere else.
 *
 * A normal long day (someone forgot to clock out, a machine breakdown ran
 * late) is meant to lose hours here — that is what the ceiling in
 * {@link splitDayHours} exists to do, deliberately. But the same number is
 * also what a genuine double shift looks like from the outside: two real
 * duty periods back to back collapse into one `hoursWorked` figure with no
 * record of the seam between them, so the engine cannot tell "one very long
 * day" from "two ordinary ones" — that seam is only visible in the raw
 * punches, not in the single total this function is given.
 *
 * This deliberately does not try to guess which case it is and split the day
 * itself: a wrong guess would misprice real wages, and the gap between a
 * lunch break and a shift change is not something a fixed duration threshold
 * can tell apart safely. Instead this only reports the size of the gap, so a
 * supervisor can look at the punches for a flagged day and decide — the same
 * human-in-the-loop pattern as every other ambiguous case in this system.
 */
export function excessHours(
  day: AttendanceDay,
  rule: PayRule,
  dutyHours?: number,
  terms: DutyTerms = {},
): number {
  const worked = workedHoursOf(day, rule);
  if (worked <= 0) return 0;

  // A default (uncalendared) Sunday and every premium-rated day type pay the
  // whole shift, uncapped, just under a different bucket — nothing is
  // dropped there, whatever the total. Only an ordinary working day's
  // overtime has a ceiling to overflow.
  const isDefaultSunday = isSunday(day.workDate) && day.dayType === "off";
  const isOrdinaryDay = day.dayType === "workday" || day.dayType === "special_working";
  if (isDefaultSunday || !isOrdinaryDay) return 0;

  const earnsOvertime = terms.overtimeEligible ?? true;
  if (!earnsOvertime) return 0;

  const standard = dutyHours && dutyHours > 0 ? dutyHours : rule.standardHoursPerDay;
  if (worked <= standard) return 0;

  const excess = round2(worked - standard);
  const threshold = rule.otThresholdMinutes / 60;
  if (excess < threshold) return 0;

  const cap = rule.otDailyCapHours;
  if (cap < 0) return 0;

  return Math.max(0, round2(excess - cap));
}

/** Adds a day's buckets into a running period total. */
export function addBuckets(total: HourBuckets, day: HourBuckets): HourBuckets {
  return {
    regular: round2(total.regular + day.regular),
    overtime: round2(total.overtime + day.overtime),
    weekend: round2(total.weekend + day.weekend),
    holiday: round2(total.holiday + day.holiday),
  };
}

/** Sums a period's attendance into hour buckets. */
export function accumulateHours(
  days: readonly AttendanceDay[],
  rule: PayRule,
  dutyHours?: number,
  terms: DutyTerms = {},
): HourBuckets {
  return days.reduce<HourBuckets>(
    (total, day) => addBuckets(total, splitDayHours(day, rule, dutyHours, terms)),
    { ...EMPTY_BUCKETS },
  );
}

/**
 * Days that earn base pay: attended, and not a Sunday.
 *
 * Length does not matter here. Someone who clocks two hours and someone who
 * clocks eight both earn one working day; hours only count above the duty
 * boundary, where they become overtime. Absence and leave earn nothing,
 * because neither was attended.
 */
export function countWorkingDays(days: readonly AttendanceDay[]): number {
  return days.reduce((total, day) => {
    if (isSunday(day.workDate)) return total;
    const attended = day.status === "present" || day.status === "partial";
    return attended ? total + 1 : total;
  }, 0);
}
