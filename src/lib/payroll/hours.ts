import type { AttendanceDay, HourBuckets, PayRule } from "./types";

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
  const corrected = Math.round(scaled + (Math.sign(scaled) * Number.EPSILON * Math.abs(scaled)));
  return corrected / 100;
}

/** Money rounding is the same half-up rule, named for intent at call sites. */
export const roundMoney = round2;

const EMPTY_BUCKETS: HourBuckets = { regular: 0, overtime: 0, weekend: 0, holiday: 0 };

/**
 * Splits a day's worked hours into the buckets that attract different rates.
 *
 * The day type decides the shape of the split:
 *  - workday / special_working → up to the standard day is regular, the rest
 *    is overtime (only once it clears the overtime threshold).
 *  - weekend_working, or any work on an `off` day → every hour is weekend-rated.
 *    Overtime is deliberately *not* stacked on top, since the weekend
 *    multiplier already exceeds the overtime multiplier.
 *  - holiday → every hour is holiday-rated.
 */
export function splitDayHours(day: AttendanceDay, rule: PayRule): HourBuckets {
  const worked = roundHours(Math.max(0, day.hoursWorked), rule.roundToMinutes);
  if (worked <= 0) return { ...EMPTY_BUCKETS };

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
      const standard = rule.standardHoursPerDay;
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
      return { ...EMPTY_BUCKETS, regular: standard, overtime: excess };
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
export function accumulateHours(days: readonly AttendanceDay[], rule: PayRule): HourBuckets {
  return days.reduce<HourBuckets>(
    (total, day) => addBuckets(total, splitDayHours(day, rule)),
    { ...EMPTY_BUCKETS },
  );
}

/**
 * The hourly rate used for a monthly-salaried person's overtime.
 *
 * Derived from the contracted month so that overtime scales with salary
 * without needing a second rate field per employee.
 */
export function derivedHourlyRate(monthlySalary: number, rule: PayRule): number {
  const hoursPerMonth = rule.standardDaysPerMonth * rule.standardHoursPerDay;
  if (hoursPerMonth <= 0) return 0;
  return round2(monthlySalary / hoursPerMonth);
}
