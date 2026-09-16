/**
 * Which shift the floor is on at a given moment, and the date it belongs to.
 *
 * A shift runs from its start to the end of its overtime — the day shift from
 * 08:00 to 20:00, the night shift from 20:00 to 08:00. The night shift crosses
 * midnight, so at 02:00 it is still the night that started yesterday, and its
 * check-ins sit on yesterday's attendance. Pure: shifts and a clock in, one
 * answer out.
 */

export interface ShiftClock {
  id: string;
  code: string;
  name: string;
  /** "HH:MM" or "HH:MM:SS", Pakistan time. */
  startsAt: string;
  endsAt: string;
  overtimeUntil: string | null;
  graceMinutes: number;
}

export interface RunningShift {
  shift: ShiftClock;
  /** The attendance date this stretch of the shift belongs to. */
  workDate: string;
  /** Minutes since the shift started. */
  minutesIn: number;
  /** Past the end of duty, into overtime. */
  inOvertime: boolean;
}

export function minutesOf(time: string): number | null {
  const match = /^(\d{1,2}):(\d{2})/.exec(time.trim());
  if (!match) return null;
  const hour = Number(match[1]);
  const minute = Number(match[2]);
  return hour > 23 || minute > 59 ? null : hour * 60 + minute;
}

export function previousDay(date: string): string {
  const parsed = new Date(`${date}T00:00:00Z`);
  parsed.setUTCDate(parsed.getUTCDate() - 1);
  return parsed.toISOString().slice(0, 10);
}

/** Until when a night worker's still-open check-in keeps last night on the board. */
const OPEN_NIGHT_UNTIL = 10 * 60;

/** One of somebody's stored days, reduced to what the live rule reads. */
export interface PersonDay {
  workDate: string;
  firstIn: string | null;
  lastOut: string | null;
}

/** How long an open check-in still counts as somebody on the floor. */
export const OPEN_CHECK_IN_HOURS = 16;

/**
 * The day somebody is on at this minute — the rule the live board draws.
 *
 * A check-in with no check-out in the last sixteen hours is that person on the
 * floor now, on the date it belongs to, whatever their roster says: at 08:15
 * that is the night shift finishing its overtime as well as the day shift that
 * has just arrived. Past sixteen hours it is a missed check-out rather than a
 * person still here, and a check-in ahead of the clock is a terminal whose
 * time has run fast. Failing that, their own shift's date.
 *
 * The `live_attendance` view (20260922090000) decides the same way; change
 * both together.
 */
export function liveWorkDate(
  shift: ShiftClock | null,
  localDate: string,
  localTime: string,
  days: readonly PersonDay[],
  now: Date,
): string {
  const at = now.getTime();
  const window = OPEN_CHECK_IN_HOURS * 3_600_000;

  const open = days
    .filter((day) => day.firstIn && !day.lastOut)
    .map((day) => ({ day, since: Date.parse(day.firstIn!) }))
    .filter((row) => Number.isFinite(row.since) && row.since <= at && at - row.since <= window)
    .sort((a, b) => b.since - a.since)[0];

  if (open) return open.day.workDate;

  const lastNight = previousDay(localDate);
  const stillOpen = days.some((day) => day.workDate === lastNight && day.firstIn && !day.lastOut);
  return personalWorkDate(shift, localDate, localTime, stillOpen);
}

/**
 * The attendance date one person's "today" is, on their own shift.
 *
 * For a shift that crosses midnight it is yesterday until the shift's overtime
 * ends, and after that until 10:00 only while last night's check-in is still
 * open — the window `creditWorkDates` gives a late check-out. Everyone else,
 * and anyone without a shift, is on the calendar date. The `live_attendance`
 * view draws the same line (20260922090000); change both together.
 *
 * `liveWorkDate` above is what the board and the dashboard call; this is the
 * fallback it uses when nobody is mid-shift.
 */
export function personalWorkDate(
  shift: ShiftClock | null,
  localDate: string,
  localTime: string,
  lastNightStillOpen: boolean,
): string {
  const now = minutesOf(localTime);
  if (!shift || now === null) return localDate;

  const start = minutesOf(shift.startsAt);
  const until = minutesOf(shift.overtimeUntil ?? shift.endsAt);
  if (start === null || until === null || start <= until) return localDate;

  if (now < until || (now < OPEN_NIGHT_UNTIL && lastNightStillOpen)) {
    return previousDay(localDate);
  }
  return localDate;
}

/** Minutes from `from` forward to `to` on a 24-hour clock. */
function span(from: number, to: number): number {
  return (to - from + 1440) % 1440;
}

export function runningShift(
  shifts: readonly ShiftClock[],
  localDate: string,
  localTime: string,
): RunningShift | null {
  const now = minutesOf(localTime);
  if (now === null) return null;

  for (const shift of shifts) {
    const start = minutesOf(shift.startsAt);
    const end = minutesOf(shift.endsAt);
    const until = minutesOf(shift.overtimeUntil ?? shift.endsAt);
    if (start === null || end === null || until === null) continue;

    const length = span(start, until) || 1440;
    const minutesIn = span(start, now);
    if (minutesIn >= length) continue;

    // Before midnight the shift is today's; after it, the shift that began yesterday.
    const workDate = now < start ? previousDay(localDate) : localDate;
    return { shift, workDate, minutesIn, inOvertime: minutesIn >= span(start, end) };
  }

  return null;
}
