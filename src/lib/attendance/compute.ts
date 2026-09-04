import { splitIntoSessions } from "./sessions";
import { round2 } from "@/lib/payroll/hours";
import type { AttendanceStatus, DayType } from "@/lib/payroll/types";

/**
 * Turns raw biometric punches into a day's worked hours.
 *
 * Factory terminals are messy: workers punch for lunch, miss a punch when
 * leaving in a hurry, and most K50 units are configured without dedicated
 * in/out keys so every record arrives as "unknown". Pairing is delegated to
 * `splitIntoSessions`, which handles all three rather than assuming a clean
 * in/out sequence.
 */

export interface RawPunch {
  punchedAt: Date;
  direction: "in" | "out" | "unknown";
}

export interface ComputedDay {
  firstIn: Date | null;
  lastOut: Date | null;
  hoursWorked: number;
  /** Unpaid time between a clock-out and the next clock-in. */
  breakMinutes: number;
  /**
   * The clock-out was floored to the half hour, so payroll must not round
   * these hours a second time.
   */
  hoursAreFinal: boolean;
  status: AttendanceStatus;
  /** Set when the punch sequence could not be paired cleanly. */
  anomaly: string | null;
  /** Direction per punch in ascending time order, for writing back. */
  directions: ("in" | "out")[];
}

const EMPTY: ComputedDay = {
  firstIn: null,
  lastOut: null,
  hoursWorked: 0,
  breakMinutes: 0,
  hoursAreFinal: false,
  status: "absent",
  anomaly: null,
  directions: [],
};

/**
 * Rounds a leaving time down to :00 or :30.
 *
 * Always down. Someone who leaves at 11:45 is paid to 11:30 and someone who
 * leaves at 11:20 to 11:00 — the factory pays for completed half hours, and
 * rounding up would pay for time nobody worked.
 */
export function floorToHalfHour(at: Date): Date {
  const floored = new Date(at);
  floored.setMinutes(floored.getMinutes() < 30 ? 0 : 30, 0, 0);
  return floored;
}

export interface ComputeOptions {
  requiresAttendance?: boolean;
  /**
   * Floor the day's last clock-out to the half hour.
   *
   * Only true for someone with an enforced shift. A person with no fixed
   * finish has nothing to round against, so flooring them would simply take up
   * to twenty-nine minutes off a day they were asked to complete by hours.
   */
  floorFinalOut?: boolean;
}

export function computeDayFromPunches(
  punches: readonly RawPunch[],
  dayType: DayType,
  options: ComputeOptions = {},
): ComputedDay {
  const isNonWorking = dayType === "off" || dayType === "holiday";

  if (punches.length === 0) {
    if (options.requiresAttendance === false) {
      // Monthly staff who never clock in are not "absent".
      return { ...EMPTY, status: "present" };
    }
    return {
      ...EMPTY,
      status: isNonWorking ? (dayType === "holiday" ? "holiday" : "off") : "absent",
    };
  }

  const split = splitIntoSessions(punches);
  const first = split.sessions[0]!;
  const lastSession = split.sessions[split.sessions.length - 1]!;

  if (split.sessions.length === 1 && lastSession.out === null) {
    // One punch tells us they were here but not for how long. Flag it for a
    // supervisor rather than silently paying or docking a full shift.
    return {
      ...EMPTY,
      firstIn: first.in,
      status: "partial",
      anomaly: "Only one punch recorded — missing clock-out",
      directions: split.directions,
    };
  }

  /*
   * Flooring is applied to the day's closing punch only. An earlier session's
   * clock-out was followed by more work, so it is a break boundary rather than
   * a leaving time, and rounding it would shorten a stretch that was actually
   * worked.
   */
  let hoursWorked = split.workedHours;
  let lastOut = lastSession.out;
  let hoursAreFinal = false;

  if (options.floorFinalOut && lastOut) {
    const floored = floorToHalfHour(lastOut);
    // Never behind its own clock-in: a ten-minute session must not go negative.
    const clamped = floored.getTime() < lastSession.in.getTime() ? lastSession.in : floored;
    const lostMs = lastOut.getTime() - clamped.getTime();
    // split.workedHours is already rounded to the cent; subtracting the lost
    // minutes from it and rounding again can drift the total by a cent.
    // Sum the sessions' exact millisecond spans instead and round once.
    const totalMs = split.sessions.reduce(
      (sum, session) => sum + (session.out ? session.out.getTime() - session.in.getTime() : 0),
      0,
    );
    hoursWorked = round2(Math.max(0, totalMs - lostMs) / 3_600_000);
    lastOut = clamped;
    hoursAreFinal = true;
  }

  return {
    firstIn: first.in,
    lastOut,
    hoursWorked,
    breakMinutes: split.breakMinutes,
    hoursAreFinal,
    status: hoursWorked > 0 ? "present" : "partial",
    anomaly: split.hasOpenSession ? "Missing clock-out" : null,
    directions: split.directions,
  };
}

/**
 * The calendar date a punch belongs to.
 *
 * Night shifts cross midnight, so a punch before the cutoff hour is credited
 * to the previous day — otherwise a 22:00–04:00 shift looks like two half-days
 * of absence.
 *
 * The cutoff cannot be raised freely: a night worker clocking out at 06:00 and
 * a morning worker clocking in at 06:00 produce an identical timestamp, and
 * only the shift roster can tell them apart. The default of 05:00 is therefore
 * deliberately conservative — it protects the common case (early morning
 * arrivals stay on their own day) and leaves later-finishing night shifts to
 * be handled by passing a higher cutoff for those sites explicitly.
 */
export function workDateFor(punchedAt: Date, nightShiftCutoffHour = 5): string {
  const adjusted = new Date(punchedAt);
  if (adjusted.getHours() < nightShiftCutoffHour) {
    adjusted.setDate(adjusted.getDate() - 1);
  }
  return toDateKey(adjusted);
}

/**
 * How late an arrival was against the shift, in whole minutes.
 *
 * Measured from the shift start on the work date, with the grace period
 * already allowed, so a worker inside grace is exactly zero minutes late
 * rather than a small positive number that would trip the first penalty band.
 */
export function minutesLateAgainstShift(
  firstIn: Date,
  shiftStart: Date,
  graceMinutes: number,
): number {
  const allowedFrom = shiftStart.getTime() + graceMinutes * 60_000;
  const lateMs = firstIn.getTime() - allowedFrom;
  if (lateMs <= 0) return 0;
  return Math.floor(lateMs / 60_000);
}

export function toDateKey(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}
