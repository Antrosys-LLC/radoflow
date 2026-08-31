import { round2 } from "@/lib/payroll/hours";
import type { AttendanceStatus, DayType } from "@/lib/payroll/types";

/**
 * Turns raw biometric punches into a day's worked hours.
 *
 * Factory terminals are messy: workers punch for lunch, miss a punch when
 * leaving in a hurry, and most K50 units are configured without dedicated
 * in/out keys so every record arrives as "unknown". The pairing below handles
 * all three rather than assuming a clean in/out sequence.
 */

export interface RawPunch {
  punchedAt: Date;
  direction: "in" | "out" | "unknown";
}

export interface ComputedDay {
  firstIn: Date | null;
  lastOut: Date | null;
  hoursWorked: number;
  status: AttendanceStatus;
  /** Set when the punch sequence could not be paired cleanly. */
  anomaly: string | null;
}

const EMPTY: ComputedDay = {
  firstIn: null,
  lastOut: null,
  hoursWorked: 0,
  status: "absent",
  anomaly: null,
};

export function computeDayFromPunches(
  punches: readonly RawPunch[],
  dayType: DayType,
  options: { requiresAttendance?: boolean } = {},
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

  const sorted = [...punches].sort((a, b) => a.punchedAt.getTime() - b.punchedAt.getTime());
  const first = sorted[0]!;
  const last = sorted[sorted.length - 1]!;

  if (sorted.length === 1) {
    // One punch tells us they were here but not for how long. Flag it for a
    // supervisor rather than silently paying or docking a full shift.
    return {
      firstIn: first.punchedAt,
      lastOut: null,
      hoursWorked: 0,
      status: "partial",
      anomaly: "Only one punch recorded — missing clock-out",
    };
  }

  // Direction is only informative when the terminal actually distinguishes
  // the two. A K50 without dedicated in/out keys stamps every record with
  // state 0, which arrives here as an unbroken run of "in" — believing that
  // would pair nothing and report a zero-hour day for someone who worked a
  // full shift. Fall back to alternating unless both directions are present.
  const directions = new Set(sorted.map((p) => p.direction));
  const hasUsableDirections = directions.has("in") && directions.has("out");
  const paired = hasUsableDirections ? pairByDirection(sorted) : pairByAlternating(sorted);

  return {
    firstIn: first.punchedAt,
    lastOut: last.punchedAt,
    hoursWorked: paired.hours,
    status: paired.hours > 0 ? "present" : "partial",
    anomaly: paired.anomaly,
  };
}

interface PairResult {
  hours: number;
  anomaly: string | null;
}

/** Pairs each in with the next out, ignoring repeated punches of the same kind. */
function pairByDirection(punches: readonly RawPunch[]): PairResult {
  let total = 0;
  let openIn: Date | null = null;
  let unmatched = 0;

  for (const punch of punches) {
    // Treat "unknown" between explicit punches as continuing the current state.
    const direction = punch.direction === "unknown" ? (openIn ? "out" : "in") : punch.direction;

    if (direction === "in") {
      // A second "in" without an "out" replaces the first — the earlier one was
      // most likely a double-tap on the sensor.
      if (openIn) unmatched += 1;
      openIn = punch.punchedAt;
    } else if (openIn) {
      total += punch.punchedAt.getTime() - openIn.getTime();
      openIn = null;
    } else {
      unmatched += 1;
    }
  }

  if (openIn) unmatched += 1;

  return {
    hours: round2(total / 3_600_000),
    anomaly: unmatched > 0 ? `${unmatched} unpaired punch(es)` : null,
  };
}

/**
 * Fallback for terminals that report no direction: assume punches alternate
 * in, out, in, out.
 */
function pairByAlternating(punches: readonly RawPunch[]): PairResult {
  let total = 0;

  for (let i = 0; i + 1 < punches.length; i += 2) {
    total += punches[i + 1]!.punchedAt.getTime() - punches[i]!.punchedAt.getTime();
  }

  const dangling = punches.length % 2 === 1;

  return {
    hours: round2(total / 3_600_000),
    anomaly: dangling ? "Odd number of punches — last clock-out missing" : null,
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
