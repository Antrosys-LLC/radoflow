import { round2 } from "@/lib/payroll/hours";

/**
 * Turning a day's punches into check-ins, check-outs and breaks.
 *
 * The rule the floor works to: the first punch is a check-in, the next punch
 * inside twelve hours is the matching check-out, and a punch after that opens
 * the day again — so the gap between the check-out and that next check-in is a
 * break. A punch more than twelve hours after the day opened is not a
 * check-out at all; it is somebody arriving.
 *
 * Direction comes from the sequence, not from the terminal. A ZKTeco K50 with
 * no dedicated in/out keys stamps every record with state 0, which arrives as
 * an unbroken run of "in" — trusting it pairs nothing and pays a full shift as
 * zero hours. The device's own state is kept in `punches.raw` for audit.
 *
 * Pure and I/O-free so the pairing can be tested without a database or a
 * terminal.
 */

export interface TimedPunch {
  punchedAt: Date;
}

export interface PunchSession {
  in: Date;
  /** Null when nothing closed the session — a missed clock-out. */
  out: Date | null;
}

export interface SessionSplit {
  sessions: PunchSession[];
  /** One direction per punch, in ascending time order. */
  directions: ("in" | "out")[];
  /** Unpaid minutes between a clock-out and the next clock-in, same block. */
  breakMinutes: number;
  /** Paid time: the sum of the closed sessions. */
  workedHours: number;
  hasOpenSession: boolean;
}

const HOUR_MS = 3_600_000;

const EMPTY: SessionSplit = {
  sessions: [],
  directions: [],
  breakMinutes: 0,
  workedHours: 0,
  hasOpenSession: false,
};

export interface DeclaredPunch extends TimedPunch {
  direction: "in" | "out";
}

export interface DeclaredSplit extends SessionSplit {
  /** Check-outs with no check-in before them: they close nothing. */
  strayOuts: number;
}

/**
 * Pairing for punches whose direction was declared by the terminal they came
 * from — the check-in gate and the check-out gate.
 *
 * `splitIntoSessions` pairs by position: first punch in, second out, third in.
 * That is the right guess for a terminal with no in/out keys, and the wrong
 * one for two gates, because one extra scan flips every pairing after it. Two
 * taps on the way in read in-out; the real check-out then reads as a fresh
 * check-in, and a man who went home at four is "working" until midnight.
 *
 * Here the gate decides. A second check-in while one is open is the same
 * arrival scanned twice and is ignored; a check-out closes the open check-in;
 * a check-out with nothing open closes nothing and never starts a day. A
 * check-out further than the window from the check-in is not the end of that
 * stretch — the check-in stays open, a missed check-out, and the out is stray.
 */
export function splitByDeclaredDirection(
  punches: readonly DeclaredPunch[],
  windowHours = 12,
): DeclaredSplit {
  const ordered = punches.slice().sort((a, b) => a.punchedAt.getTime() - b.punchedAt.getTime());
  const windowMs = windowHours * HOUR_MS;

  const sessions: PunchSession[] = [];
  const directions: ("in" | "out")[] = [];
  let open: Date | null = null;
  let blockStart: Date | null = null;
  let previousOut: Date | null = null;
  let workedMs = 0;
  let breakMs = 0;
  let strayOuts = 0;

  for (const punch of ordered) {
    const at = punch.punchedAt;
    directions.push(punch.direction);

    if (open && at.getTime() - open.getTime() > windowMs) {
      // Whatever this is, it is not the end of a stretch that began that long ago.
      sessions.push({ in: open, out: null });
      open = null;
      previousOut = null;
    }

    if (punch.direction === "in") {
      if (open) continue;
      if (!blockStart || at.getTime() - blockStart.getTime() > windowMs) {
        blockStart = at;
        previousOut = null;
      }
      if (previousOut) breakMs += at.getTime() - previousOut.getTime();
      open = at;
    } else if (open) {
      sessions.push({ in: open, out: at });
      workedMs += at.getTime() - open.getTime();
      previousOut = at;
      open = null;
    } else {
      strayOuts += 1;
    }
  }
  if (open) sessions.push({ in: open, out: null });

  return {
    sessions,
    directions,
    breakMinutes: Math.round(breakMs / 60_000),
    workedHours: round2(workedMs / HOUR_MS),
    hasOpenSession: sessions.some((s) => s.out === null),
    strayOuts,
  };
}

export function splitIntoSessions(punches: readonly TimedPunch[], windowHours = 12): SessionSplit {
  if (punches.length === 0) return { ...EMPTY, sessions: [], directions: [] };

  const times = punches.map((p) => p.punchedAt).sort((a, b) => a.getTime() - b.getTime());

  const windowMs = windowHours * HOUR_MS;

  /*
   * Blocks first, pairs second.
   *
   * A block is one stretch of attendance: every punch within the window of the
   * punch that opened it. Splitting on the window before pairing is what stops
   * an overnight gap being read as a very long lunch — the two are
   * indistinguishable once you are only looking at consecutive pairs.
   */
  const blocks: Date[][] = [];
  let block: Date[] = [];
  let anchor: Date | null = null;

  for (const time of times) {
    if (!anchor || time.getTime() - anchor.getTime() > windowMs) {
      if (block.length > 0) blocks.push(block);
      block = [];
      anchor = time;
    }
    block.push(time);
  }
  if (block.length > 0) blocks.push(block);

  const sessions: PunchSession[] = [];
  const directions: ("in" | "out")[] = [];
  let workedMs = 0;
  let breakMs = 0;

  for (const entries of blocks) {
    let previousOut: Date | null = null;

    for (let i = 0; i < entries.length; i += 2) {
      const inAt = entries[i]!;
      const outAt = entries[i + 1] ?? null;

      directions.push("in");
      if (outAt) directions.push("out");

      // Only within a block. The gap before a new block is time at home.
      if (previousOut) breakMs += inAt.getTime() - previousOut.getTime();
      if (outAt) workedMs += outAt.getTime() - inAt.getTime();

      sessions.push({ in: inAt, out: outAt });
      previousOut = outAt;
    }
  }

  return {
    sessions,
    directions,
    breakMinutes: Math.round(breakMs / 60_000),
    workedHours: round2(workedMs / HOUR_MS),
    hasOpenSession: sessions.some((s) => s.out === null),
  };
}
