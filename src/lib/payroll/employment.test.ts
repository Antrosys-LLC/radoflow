import { describe, expect, it } from "vitest";

import { employedDaysInMonth } from "./employment";

describe("employedDaysInMonth", () => {
  it("is the whole month for somebody who was there throughout", () => {
    expect(employedDaysInMonth("2026-10-01", 31, null, null)).toBe(31);
    expect(employedDaysInMonth("2026-10-01", 31, "2026-08-26", null)).toBe(31);
  });

  it("counts a joiner from the day they joined", () => {
    expect(employedDaysInMonth("2026-10-01", 31, "2026-10-16", null)).toBe(16);
  });

  it("counts a resigner up to the day before they left", () => {
    expect(employedDaysInMonth("2026-10-01", 31, null, "2026-10-16")).toBe(15);
  });

  it("gives a number that passed on the 16th exactly one month between the two people", () => {
    const old = employedDaysInMonth("2026-10-01", 31, null, "2026-10-16");
    const next = employedDaysInMonth("2026-10-01", 31, "2026-10-16", null);
    expect(old + next).toBe(31);
  });

  it("is nothing for somebody who left before the month or joins after it", () => {
    expect(employedDaysInMonth("2026-10-01", 31, null, "2026-09-20")).toBe(0);
    expect(employedDaysInMonth("2026-10-01", 31, "2026-11-03", null)).toBe(0);
  });

  it("handles a joiner who also left within the month", () => {
    expect(employedDaysInMonth("2026-10-01", 31, "2026-10-06", "2026-10-11")).toBe(5);
  });
});
