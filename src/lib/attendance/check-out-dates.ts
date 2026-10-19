/**
 * Which day a check-out closes.
 *
 * A check-out belongs to the check-in it ends. The calendar cannot say which:
 * a night worker who arrived at 20:00 leaves at 05:16 or 07:30 or 08:20, and
 * the fixed cutoffs ("before 05:00 is last night", "5 to 10 for someone rostered
 * on nights") get it wrong for anybody the roster has not caught up with — a man
 * who has been on nights for a week while the office still has him on days. His
 * morning scan landed on the new date as the first punch of a day that never
 * began. The board read it as a check-in with no check-out and counted him as
 * working, hours after he had gone home, while the night he really worked sat
 * open on the day before.
 *
 * The check-out gate declares what its scans are, so the question needs no
 * roster: walk the person's own scans in order, and the check-in still open when
 * the check-out arrives is the one it closes. Pure; the caller supplies history.
 */

export interface TimelinePunch {
  /** Epoch milliseconds. */
  at: number;
  direction: "in" | "out";
  workDate: string;
}

/** The longest an arrival can be open and still be closed by one scan. */
export const CHECK_OUT_WINDOW_HOURS = 16;

/**
 * The date of the check-in that `outAt` closes, or null when nothing is open
 * (or what is open is too old to be the same stretch).
 *
 * `history` is everything the person scanned before `outAt`, in any order. A
 * second check-in while one is open is the same arrival scanned twice and does
 * not replace it.
 */
export function openCheckInDate(
  history: readonly TimelinePunch[],
  outAt: number,
  windowHours = CHECK_OUT_WINDOW_HOURS,
): string | null {
  let open: TimelinePunch | null = null;

  const earlier = history.filter((p) => p.at < outAt).sort((a, b) => a.at - b.at);
  for (const punch of earlier) {
    if (punch.direction === "in") {
      if (open === null) open = punch;
    } else {
      open = null;
    }
  }

  if (open === null) return null;
  return outAt - open.at <= windowHours * 3_600_000 ? open.workDate : null;
}

export interface CheckOutToPlace {
  /** Whatever identifies it to the caller. */
  key: string;
  profileId: string;
  at: number;
}

/**
 * The credited date for each check-out in a batch that closes an open check-in.
 *
 * Outs the rule does not apply to are left out of the result, so the caller's
 * own date stands. `stored` is what is already on file for these people;
 * `batch` is the upload itself, check-ins included, with the date each was
 * credited to so far. A scan that is in both counts once.
 */
export function placeCheckOuts(
  outs: readonly CheckOutToPlace[],
  stored: readonly (TimelinePunch & { profileId: string })[],
  batch: readonly (TimelinePunch & { profileId: string })[],
  windowHours = CHECK_OUT_WINDOW_HOURS,
): Map<string, string> {
  const timelines = new Map<string, Map<string, TimelinePunch>>();
  const add = (punch: TimelinePunch & { profileId: string }) => {
    const line = timelines.get(punch.profileId) ?? new Map<string, TimelinePunch>();
    // Same instant and direction is the same scan, replayed.
    line.set(`${punch.at}:${punch.direction}`, punch);
    timelines.set(punch.profileId, line);
  };
  stored.forEach(add);
  batch.forEach(add);

  const placed = new Map<string, string>();
  const ordered = outs.slice().sort((a, b) => a.at - b.at);

  for (const out of ordered) {
    const line = timelines.get(out.profileId);
    if (!line) continue;

    const date = openCheckInDate([...line.values()], out.at, windowHours);
    if (date === null) continue;

    // The out is itself in the timeline, so the next scan sees this one used.
    placed.set(out.key, date);
  }

  return placed;
}
