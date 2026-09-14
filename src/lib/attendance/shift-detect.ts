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
