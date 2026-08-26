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
 * Splits a day's worked hours into the buckets that attract different rates.
 *
 * Sunday is decided first and overrides everything: it is never a working day,
 * so every hour worked on one is overtime, whatever the calendar says the day
 * type is. The rest of the week falls to the day type:
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
  const worked = roundHours(Math.max(0, day.hoursWorked), rule.roundToMinutes);
  if (worked <= 0) return { ...EMPTY_BUCKETS };

  const earnsOvertime = terms.overtimeEligible ?? true;

  // Sunday first: the day type would otherwise route these hours to the
  // weekend bucket and pay them at the weekend rate instead of overtime.
  if (isSunday(day.workDate)) {
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
