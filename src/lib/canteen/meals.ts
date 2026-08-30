/**
 * Deciding what a canteen scan means.
 *
 * The factory feeds roughly four hundred people from one counter, and until
 * now with paper tokens — which get swapped, borrowed and reused, so a worker
 * could eat twice while someone else went without and the server had no way
 * to tell. A fingerprint cannot be handed to a friend, which is the whole
 * point of moving the same terminal hardware to the canteen.
 *
 * Everything here is pure: given the meal windows, a wall-clock reading and
 * whether this person has already been served, it returns the outcome. No
 * database, no clock of its own. The actual "you may not eat twice" guarantee
 * is a unique index in the schema, not this function — this only decides what
 * to *show* the counter staff, and the constraint is what makes it true even
 * if two scanners fire at the same instant.
 */

/** One serving period at one site, e.g. lunch 12:00–15:00. */
export interface MealWindow {
  id: string;
  code: string;
  name: string;
  /** "HH:MM" or "HH:MM:SS", in the site's own local time. */
  startsAt: string;
  endsAt: string;
}

export type MealScanOutcome =
  /** Fed. The first scan of this window today. */
  | "served"
  /** Already ate this meal today — the case tokens could never catch. */
  | "duplicate"
  /** The finger matched nobody enrolled on this terminal. */
  | "unknown_person"
  /** The counter is closed: no window covers this time. */
  | "outside_window";

export interface MealScanDecision {
  outcome: MealScanOutcome;
  window: MealWindow | null;
  /**
   * The date the serving is counted against — not always today's date. A
   * window running past midnight (a night shift's dinner at 22:00–02:00)
   * credits a 00:30 scan to the day the window opened, so one shift's meal
   * stays one row rather than splitting across two dates and letting someone
   * eat twice across the boundary.
   */
  servedOn: string | null;
}

/** Minutes since midnight for "HH:MM" / "HH:MM:SS". Null if unparseable. */
export function minutesOfDay(time: string): number | null {
  const match = /^(\d{1,2}):(\d{2})(?::(\d{2}))?$/.exec(time.trim());
  if (!match) return null;

  const hour = Number(match[1]);
  const minute = Number(match[2]);
  if (hour > 23 || minute > 59) return null;

  return hour * 60 + minute;
}

/** True when a window is written to run past midnight, e.g. 22:00–02:00. */
export function crossesMidnight(window: MealWindow): boolean {
  const start = minutesOfDay(window.startsAt);
  const end = minutesOfDay(window.endsAt);
  if (start === null || end === null) return false;
  return end < start;
}

/**
 * Shifts a `YYYY-MM-DD` date by whole days.
 *
 * Parsed as UTC on purpose, the same rule the payroll module follows: local
 * parsing puts midnight in the server's zone, and west of Greenwich that
 * lands on the previous day.
 */
export function shiftDate(date: string, days: number): string {
  const parsed = new Date(`${date}T00:00:00Z`);
  if (Number.isNaN(parsed.getTime())) return date;
  parsed.setUTCDate(parsed.getUTCDate() + days);
  return parsed.toISOString().slice(0, 10);
}

/**
 * Which window is open at a given local time, and the date it counts against.
 *
 * Windows are checked in order and the first match wins, so overlapping
 * windows resolve predictably rather than by whichever the database happened
 * to return first — the caller sorts them.
 */
export function resolveMealWindow(
  windows: readonly MealWindow[],
  localDate: string,
  localTime: string,
): { window: MealWindow; servedOn: string } | null {
  const now = minutesOfDay(localTime);
  if (now === null) return null;

  for (const window of windows) {
    const start = minutesOfDay(window.startsAt);
    const end = minutesOfDay(window.endsAt);
    if (start === null || end === null) continue;

    if (end >= start) {
      // An ordinary window inside one day.
      if (now >= start && now < end) return { window, servedOn: localDate };
      continue;
    }

    // Crosses midnight: open from `start` to the end of the day, and again
    // from midnight to `end` — the second half belonging to the day before.
    if (now >= start) return { window, servedOn: localDate };
    if (now < end) return { window, servedOn: shiftDate(localDate, -1) };
  }

  return null;
}

export interface MealScanInput {
  /** Null when the terminal's enrolment number maps to nobody. */
  profileId: string | null;
  windows: readonly MealWindow[];
  localDate: string;
  localTime: string;
  /**
   * Whether this person already has a claim for the resolved window and date.
   * The caller looks this up; the unique index is what actually enforces it.
   */
  alreadyClaimed: boolean;
}

export function decideMealScan(input: MealScanInput): MealScanDecision {
  const resolved = resolveMealWindow(input.windows, input.localDate, input.localTime);

  // Checked before identity: if the counter is shut, whose finger it was does
  // not matter, and saying "closed" is more use to the person at the counter
  // than "unknown worker".
  if (!resolved) return { outcome: "outside_window", window: null, servedOn: null };

  if (!input.profileId) {
    return { outcome: "unknown_person", window: resolved.window, servedOn: resolved.servedOn };
  }

  return {
    outcome: input.alreadyClaimed ? "duplicate" : "served",
    window: resolved.window,
    servedOn: resolved.servedOn,
  };
}
