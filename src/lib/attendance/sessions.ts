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
