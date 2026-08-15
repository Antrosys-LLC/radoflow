import { describe, expect, it } from "vitest";

import { parseWallClock, workDateFromWallClock, zonedWallClockToUtc } from "./timezone";

describe("parsing terminal readings", () => {
  it("accepts the format ZKTeco terminals emit", () => {
    expect(parseWallClock("2026-08-12 07:58:12")).toEqual({
      year: 2026,
      month: 8,
      day: 12,
      hour: 7,
      minute: 58,
      second: 12,
    });
  });

  it("accepts a T separator", () => {
    expect(parseWallClock("2026-08-12T07:58:12")?.hour).toBe(7);
  });

  it("rejects anything else", () => {
    expect(parseWallClock("not a date")).toBeNull();
    expect(parseWallClock("2026-08-12")).toBeNull();
  });
});

describe("anchoring a reading to the site timezone", () => {
  it("reads 07:58 in Karachi as 02:58 UTC", () => {
    // Asia/Karachi is UTC+5 year-round.
    const instant = zonedWallClockToUtc("2026-08-12 07:58:12", "Asia/Karachi");
    expect(instant?.toISOString()).toBe("2026-08-12T02:58:12.000Z");
  });

  it("gives the same instant regardless of the server's own timezone", () => {
    // The whole point: this must not depend on where the app is deployed.
    const instant = zonedWallClockToUtc("2026-08-12 17:04:00", "Asia/Karachi");
    expect(instant?.toISOString()).toBe("2026-08-12T12:04:00.000Z");
  });

  it("treats a UTC site as a no-op", () => {
    const instant = zonedWallClockToUtc("2026-08-12 07:58:12", "UTC");
    expect(instant?.toISOString()).toBe("2026-08-12T07:58:12.000Z");
  });

  it("applies the correct offset either side of a DST change", () => {
    // London is UTC+1 in August and UTC+0 in January.
    expect(zonedWallClockToUtc("2026-08-12 12:00:00", "Europe/London")?.toISOString()).toBe(
      "2026-08-12T11:00:00.000Z",
    );
    expect(zonedWallClockToUtc("2026-01-12 12:00:00", "Europe/London")?.toISOString()).toBe(
      "2026-01-12T12:00:00.000Z",
    );
  });

  it("returns null for an unparseable reading", () => {
    expect(zonedWallClockToUtc("garbage", "Asia/Karachi")).toBeNull();
  });
});

describe("work date from a reading", () => {
  it("keeps a normal shift on its own date", () => {
    expect(workDateFromWallClock("2026-08-12 07:58:12")).toBe("2026-08-12");
    expect(workDateFromWallClock("2026-08-12 23:30:00")).toBe("2026-08-12");
  });

  it("rolls an early-hours punch back to the previous day", () => {
    expect(workDateFromWallClock("2026-08-13 03:10:00")).toBe("2026-08-12");
  });

  it("rolls back across a month boundary", () => {
    expect(workDateFromWallClock("2026-09-01 02:00:00")).toBe("2026-08-31");
  });

  it("honours a site-specific cutoff", () => {
    expect(workDateFromWallClock("2026-08-13 06:00:00")).toBe("2026-08-13");
    expect(workDateFromWallClock("2026-08-13 06:00:00", 7)).toBe("2026-08-12");
  });
});
