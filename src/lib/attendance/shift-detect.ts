/**
 * Which shift somebody is actually working, read from when they arrive.
 *
 * The factory runs a day shift that starts at 08:00 and a night shift that
 * starts at 20:00, and people move between them. The roster is the office's
 * statement of where somebody is meant to be; the terminal is the record of
 * where they are. When the two disagree for several attended days running,
 * the terminal is right and the roster is out of date.
 *
 * Pure: arrivals in, a shift code out. The ingest path supplies the rows and
 * decides what to write.
 */

import { minutesOf, type ShiftClock } from "./shift-now";

export type ShiftCode = "DAY" | "NIGHT";

/** Pakistan keeps no daylight saving, so its offset from UTC is always five hours. */
const PAKISTAN_OFFSET_MINUTES = 5 * 60;

/** Minutes past midnight, on the factory's clock, of an instant. */
export function pakistanMinutesOfDay(iso: string): number | null {
  const at = Date.parse(iso);
  if (Number.isNaN(at)) return null;
  const utc = Math.floor(at / 60_000) % 1440;
  return (utc + PAKISTAN_OFFSET_MINUTES + 1440) % 1440;
}

/**
 * The shift an arrival belongs to.
 *
 * The line is drawn halfway between the two starts on either side: 02:00 and
 * 14:00. Somebody arriving at 07:40 or at 10:15 is a (possibly late) day
 * worker; somebody arriving at 19:30 or 23:00 is a night worker. Nobody
 * arrives for either shift at two in the morning or two in the afternoon.
 */
export function arrivalShift(minutesOfDay: number): ShiftCode {
  return minutesOfDay >= 120 && minutesOfDay < 840 ? "DAY" : "NIGHT";
}

export interface Arrival {
  /** The work date the day is credited to, `YYYY-MM-DD`. */
  workDate: string;
  /** The first check-in of that day, as an ISO instant. */
  firstIn: string | null;
}

/**
 * The shift the last `streak` attended days agree on, or null.
 *
 * Attended days, not calendar days: a Sunday off or a day's leave between two
 * night shifts does not break a run of nights. But every one of the most
 * recent `streak` attended days must agree — one day covered on the other
 * shift is a favour to a colleague, not a move.
 */
export function detectShift(arrivals: readonly Arrival[], streak: number): ShiftCode | null {
  if (!Number.isInteger(streak) || streak < 1) return null;

  const recent = arrivals
    .filter((arrival): arrival is Arrival & { firstIn: string } => Boolean(arrival.firstIn))
    .slice()
    .sort((a, b) => b.workDate.localeCompare(a.workDate))
    .slice(0, streak);

  if (recent.length < streak) return null;

  let agreed: ShiftCode | null = null;
  for (const arrival of recent) {
    const minutes = pakistanMinutesOfDay(arrival.firstIn);
    if (minutes === null) return null;
    const shift = arrivalShift(minutes);
    if (agreed && shift !== agreed) return null;
    agreed = shift;
  }
  return agreed;
}

/**
 * Whether an early-morning punch belongs to the night before.
 *
 * A punch before 05:00 always does — that is the long-standing rule for every
 * terminal. The night shift's overtime now runs to 08:00, so a night worker
 * leaving at 07:30 must not have his night split across two dates either. That
 * later window applies only to somebody on nights who has a check-in from the
 * previous evening still open; a day worker arriving early at 07:45 is left on
 * their own day.
 */
export function belongsToPreviousNight({
  hour,
  onNightShift,
  openFromPreviousEvening,
}: {
  /** The punch's hour on the factory clock, 0–23. */
  hour: number;
  onNightShift: boolean;
  openFromPreviousEvening: boolean;
}): boolean {
  if (hour < 5) return true;
  return onNightShift && openFromPreviousEvening && hour < 10;
}

/**
 * How early somebody can turn up and still be arriving *for* that shift.
 *
 * Two hours. Wide enough for the people who wait at the gate before a shift
 * opens, narrow enough that four in the afternoon is not read as somebody
 * arriving early for the night — that is a day worker who is very late.
 */
const EARLY_MARGIN_MINUTES = 2 * 60;

/**
 * Whether an arrival falls inside a shift's own working window.
 *
 * The window runs from `EARLY_MARGIN_MINUTES` before the shift starts to the
 * end of its duty — not to the end of its overtime. Overtime is time a shift
 * runs on for, never a time anybody starts work, and counting it would let the
 * night shift (which runs to 08:00) claim the two and a half thousand day
 * workers who arrive at seven.
 */
function claimsArrival(shift: ShiftClock, arrivalMinutes: number): boolean {
  const start = minutesOf(shift.startsAt);
  const end = minutesOf(shift.endsAt);
  if (start === null || end === null) return false;

  const since = (arrivalMinutes - start + 1440) % 1440;
  const duty = (end - start + 1440) % 1440 || 1440;

  return since <= duty || since >= 1440 - EARLY_MARGIN_MINUTES;
}

/**
 * The shift an arrival should be judged against — which is not always the
 * rostered one.
 *
 * People rotate between days and nights days before the office moves them on
 * paper, and `followShifts` only catches up after a run of attended days. In
 * between, measuring a 19:36 check-in against an 08:00 start made somebody
 * eleven hours late for arriving early, and the per-minute penalty tier turned
 * that into roughly one and a half days' pay for each night they worked. A
 * roster that is out of date is the office's record being stale; it is not a
 * worker being late.
 *
 * So the roster stands by default, and is only overridden when the arrival
 * falls inside a different shift's window and outside the rostered one's —
 * evidence strong enough to be worth acting on. Everything ambiguous (nothing
 * claims five in the morning, or five in the afternoon) stays on the roster,
 * where a supervisor can see it as the unusual arrival it is.
 *
 * Pure: shifts and a minute of the factory's day in, the shift to measure
 * against out. Returns the rostered shift when nothing claims the arrival, and
 * null only when there is no roster and nothing claims it either.
 */
export function shiftForArrival(
  shifts: readonly ShiftClock[],
  rostered: ShiftClock | null,
  arrivalMinutes: number,
): ShiftClock | null {
  const claims = shifts.filter((shift) => claimsArrival(shift, arrivalMinutes));
  if (claims.length === 0) return rostered;

  // Their own shift accounts for the arrival: nothing to reconsider.
  if (rostered && claims.some((shift) => shift.id === rostered.id)) return rostered;

  /*
   * Otherwise the shift whose start the arrival is nearest — counting anybody
   * inside the early margin as having arrived exactly on time, so turning up
   * ten minutes before the night beats being four hours into the day.
   */
  const distance = (shift: ShiftClock) => {
    const start = minutesOf(shift.startsAt);
    if (start === null) return Number.POSITIVE_INFINITY;
    const since = (arrivalMinutes - start + 1440) % 1440;
    return since >= 1440 - EARLY_MARGIN_MINUTES ? 0 : since;
  };

  return claims.reduce((best, shift) => (distance(shift) < distance(best) ? shift : best));
}
