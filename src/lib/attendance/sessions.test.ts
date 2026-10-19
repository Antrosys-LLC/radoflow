import { describe, expect, it } from "vitest";

import { splitByDeclaredDirection, splitIntoSessions } from "./sessions";

/** A punch on 14 August 2026 at the given wall-clock time. */
function at(hour: number, minute = 0, day = 14) {
  return { punchedAt: new Date(2026, 7, day, hour, minute, 0) };
}

describe("splitIntoSessions", () => {
  it("reads the first punch as in and the second as out", () => {
    const split = splitIntoSessions([at(8), at(17)]);

    expect(split.directions).toEqual(["in", "out"]);
    expect(split.workedHours).toBe(9);
    expect(split.breakMinutes).toBe(0);
    expect(split.hasOpenSession).toBe(false);
  });

  it("counts the gap between a clock-out and the next clock-in as a break", () => {
    const split = splitIntoSessions([at(8), at(12), at(13), at(17)]);

    expect(split.directions).toEqual(["in", "out", "in", "out"]);
    expect(split.workedHours).toBe(8);
    expect(split.breakMinutes).toBe(60);
    expect(split.sessions).toHaveLength(2);
  });

  it("handles two breaks in one day", () => {
    const split = splitIntoSessions([at(8), at(10), at(10, 15), at(13), at(13, 30), at(16, 30)]);

    expect(split.breakMinutes).toBe(45);
    expect(split.workedHours).toBe(7.75);
  });

  it("leaves a session open when nothing closes it", () => {
    const split = splitIntoSessions([at(8)]);

    expect(split.directions).toEqual(["in"]);
    expect(split.workedHours).toBe(0);
    expect(split.hasOpenSession).toBe(true);
    expect(split.sessions[0]?.out).toBeNull();
  });

  it("starts a new session past the twelve-hour window", () => {
    // 08:00 then 21:00 is thirteen hours: not a clock-out, a fresh arrival.
    const split = splitIntoSessions([at(8), at(21)]);

    expect(split.directions).toEqual(["in", "in"]);
    expect(split.workedHours).toBe(0);
    expect(split.hasOpenSession).toBe(true);
    expect(split.sessions).toHaveLength(2);
  });

  it("keeps a punch exactly twelve hours later as the clock-out", () => {
    const split = splitIntoSessions([at(8), at(20)]);

    expect(split.directions).toEqual(["in", "out"]);
    expect(split.workedHours).toBe(12);
  });

  it("does not count an overnight gap as a break", () => {
    // A new block starts at 21:00; the gap before it is time at home.
    const split = splitIntoSessions([at(8), at(16), at(21), at(23)]);

    expect(split.breakMinutes).toBe(0);
    expect(split.workedHours).toBe(10);
  });

  it("sorts punches that arrive out of order", () => {
    const split = splitIntoSessions([at(17), at(8), at(13), at(12)]);

    expect(split.workedHours).toBe(8);
    expect(split.breakMinutes).toBe(60);
  });

  it("returns nothing for no punches", () => {
    const split = splitIntoSessions([]);

    expect(split.sessions).toEqual([]);
    expect(split.workedHours).toBe(0);
    expect(split.breakMinutes).toBe(0);
    expect(split.hasOpenSession).toBe(false);
  });
});

describe("splitByDeclaredDirection", () => {
  const t = (hhmm: string) => new Date(`2026-10-17T${hhmm}:00+05:00`);
  const punch = (hhmm: string, direction: "in" | "out") => ({ punchedAt: t(hhmm), direction });

  it("pairs a clean day", () => {
    const split = splitByDeclaredDirection([punch("08:00", "in"), punch("16:00", "out")]);
    expect(split.workedHours).toBe(8);
    expect(split.hasOpenSession).toBe(false);
  });

  it("is not thrown by a check-in scanned twice", () => {
    // By position this reads in-out-in and leaves the man 'working' all night.
    const split = splitByDeclaredDirection([
      punch("08:00", "in"),
      punch("08:01", "in"),
      punch("16:00", "out"),
    ]);
    expect(split.workedHours).toBe(8);
    expect(split.hasOpenSession).toBe(false);
  });

  it("ignores a check-out with nothing open", () => {
    const split = splitByDeclaredDirection([punch("05:16", "out")]);
    expect(split.sessions).toEqual([]);
    expect(split.strayOuts).toBe(1);
  });

  it("keeps a lunch break as a break", () => {
    const split = splitByDeclaredDirection([
      punch("08:00", "in"),
      punch("12:00", "out"),
      punch("13:00", "in"),
      punch("17:00", "out"),
    ]);
    expect(split.workedHours).toBe(8);
    expect(split.breakMinutes).toBe(60);
  });

  it("leaves the check-in open when the out is beyond the window", () => {
    const split = splitByDeclaredDirection([punch("04:00", "in"), punch("20:00", "out")], 12);
    expect(split.hasOpenSession).toBe(true);
    expect(split.strayOuts).toBe(1);
  });
});
