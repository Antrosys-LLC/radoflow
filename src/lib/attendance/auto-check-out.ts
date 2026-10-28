import { zonedWallClockToUtc } from "@/lib/devices/timezone";
import { PAKISTAN_TIMEZONE } from "@/lib/time";

import { minutesOf, type ShiftClock } from "./shift-now";

/**
 * When somebody who never scanned out is checked out for them.
 *
 * The rule the office asked for: a person is closed at the end of their duty,
 * and a person who is paid overtime is closed at the end of duty plus the
 * overtime ceiling (`pay_rules.ot_daily_cap_hours`, four hours). Hours past
 * that ceiling are never paid, so stamping the check-out there costs nothing
 * the payroll would have granted anyway — and it is the ceiling, not the
 * check-in, that decides, so a late arrival is not given a longer day.
 *
 * Someone on an enforced shift is measured from the shift's own clock on the
 * date the check-in was credited to, which is what keeps a night worker's 04:00
 * on the morning after. Someone with no shift to keep — flexible hours — has
 * no clock, so their duty hours run from the moment they checked in.
 *
 * Pure: one open check-in in, one instant out. The runner supplies the rows.
 */

const HOUR_MS = 3_600_000;

export interface OpenCheckIn {
  /** The open check-in. */
  at: Date;
  /** The work date the check-in was credited to, `YYYY-MM-DD`. */
  workDate: string;
}

export interface AutoCheckOutPerson {
  /** The shift the person came in for; null when they keep no shift. */
  shift: ShiftClock | null;
  flexibleHours: boolean;
  /** Hours the salary covers: eight for most, twelve for guards. */
  dutyHours: number;
  overtimeEligible: boolean;
  /** `pay_rules.ot_daily_cap_hours`. */
  overtimeCapHours: number;
  /**
   * The longest one stretch of attendance can be before the day is split in
   * two (`presenceWindowHours`). A check-out further out than this would not
   * close the check-in at all, so the stamp is held inside it.
   */
  windowHours: number;
}

/** The instant after which the open check-in is closed for the person. */
export function autoCheckOutAt(open: OpenCheckIn, person: AutoCheckOutPerson): Date {
  const overtime = person.overtimeEligible ? person.overtimeCapHours : 0;
  const fromCheckIn = open.at.getTime() + (person.dutyHours + overtime) * HOUR_MS;

  let due = fromCheckIn;

  const shift = person.shift;
  if (shift && !person.flexibleHours) {
    const start = minutesOf(shift.startsAt);
    const end = minutesOf(shift.endsAt);
    const startsAt =
      start === null
        ? null
        : zonedWallClockToUtc(`${open.workDate} ${shift.startsAt.slice(0, 8)}`, PAKISTAN_TIMEZONE);

    if (start !== null && end !== null && startsAt) {
      // A shift whose duty is longer than its clock (a twelve-hour guard on the
      // day shift) runs for its duty, not for the clock.
      const span = ((end - start + 1440) % 1440 || 1440) / 60;
      const dutyEnd = startsAt.getTime() + Math.max(span, person.dutyHours) * HOUR_MS;
      due = dutyEnd + overtime * HOUR_MS;
    }
  }

  // A check-in scanned after its own deadline (a day-shift man turning up at
  // 21:00) still gets its duty hours rather than a zero-length day.
  if (due <= open.at.getTime()) due = fromCheckIn;

  const latest = open.at.getTime() + person.windowHours * HOUR_MS;
  return new Date(Math.min(due, latest));
}
