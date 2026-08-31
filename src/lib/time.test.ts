import { describe, expect, it } from "vitest";

import { pakistanDayStartUtc, todayInPakistan } from "./time";

describe("pakistanDayStartUtc", () => {
  it("resolves local midnight to the UTC instant five hours earlier", () => {
    // Pakistan is UTC+5, so its day begins at 19:00 UTC the evening before.
    expect(pakistanDayStartUtc("2026-08-31")).toBe("2026-08-30T19:00:00.000Z");
  });

  it("is earlier than the naive string a bare date would produce", () => {
    /*
     * This is the whole point. `2026-08-31T00:00:00` resolved in the database
     * session's UTC zone lands five hours into the Pakistan day, so a `gte`
     * written that way drops everything between local midnight and 5am — the
     * night shift's canteen window and the earliest gate punches.
     */
    const naive = Date.parse("2026-08-31T00:00:00Z");
    const correct = Date.parse(pakistanDayStartUtc("2026-08-31"));

    expect(correct).toBeLessThan(naive);
    expect((naive - correct) / 3_600_000).toBe(5);
  });

  it("brackets a full local day when paired with the next date", () => {
    const start = Date.parse(pakistanDayStartUtc("2026-08-31"));
    const end = Date.parse(pakistanDayStartUtc("2026-09-01"));

    expect((end - start) / 3_600_000).toBe(24);
  });

  it("covers a scan taken just after local midnight", () => {
    // 00:30 in Pakistan on the 31st is 19:30 UTC on the 30th — inside the
    // bracket, and outside the naive one.
    const scan = Date.parse("2026-08-30T19:30:00Z");

    expect(scan).toBeGreaterThanOrEqual(Date.parse(pakistanDayStartUtc("2026-08-31")));
    expect(scan).toBeLessThan(Date.parse(pakistanDayStartUtc("2026-09-01")));
    expect(scan).toBeLessThan(Date.parse("2026-08-31T00:00:00Z"));
  });

  it("crosses a month boundary without drifting", () => {
    expect(pakistanDayStartUtc("2026-09-01")).toBe("2026-08-31T19:00:00.000Z");
  });

  it("falls back to a usable instant rather than throwing on a bad date", () => {
    expect(() => pakistanDayStartUtc("not-a-date")).not.toThrow();
  });

  it("brackets the day todayInPakistan reports", () => {
    const now = new Date();
    const start = Date.parse(pakistanDayStartUtc(todayInPakistan(now)));

    expect(now.getTime()).toBeGreaterThanOrEqual(start);
    expect(now.getTime() - start).toBeLessThan(24 * 3_600_000);
  });
});
