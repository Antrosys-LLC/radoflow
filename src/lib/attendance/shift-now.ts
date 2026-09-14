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

function previousDay(date: string): string {
  const parsed = new Date(`${date}T00:00:00Z`);
  parsed.setUTCDate(parsed.getUTCDate() - 1);
  return parsed.toISOString().slice(0, 10);
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
