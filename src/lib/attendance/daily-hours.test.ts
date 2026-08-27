import { describe, expect, it } from "vitest";

import { dailyHourTotals, type DutyPerson } from "./daily-hours";
import { DEFAULT_PAY_RULE, type AttendanceDay } from "@/lib/payroll/types";

const rule = DEFAULT_PAY_RULE;

const day = (workDate: string, hoursWorked: number): AttendanceDay => ({
  workDate,
  dayType: "workday",
  hoursWorked,
  status: "present",
});

const person = (id: string, extra: Partial<DutyPerson> = {}): DutyPerson => ({
  id,
  dutyHours: 8,
  ...extra,
});

describe("dailyHourTotals", () => {
  it("returns nothing when nobody has any days", () => {
    expect(dailyHourTotals([person("a")], new Map(), rule)).toEqual([]);
  });

  it("splits a long day into duty and overtime", () => {
    const points = dailyHourTotals(
      [person("a")],
      new Map([["a", [day("2026-08-27", 10)]]]),
      rule,
    );

    expect(points).toHaveLength(1);
    expect(points[0]?.duty).toBe(8);
    expect(points[0]?.overtime).toBe(2);
  });

  it("sums the same date across people", () => {
    const points = dailyHourTotals(
      [person("a"), person("b")],
      new Map([
        ["a", [day("2026-08-27", 10)]],
        ["b", [day("2026-08-27", 9)]],
      ]),
      rule,
    );

    expect(points).toHaveLength(1);
    expect(points[0]?.duty).toBe(16);
    expect(points[0]?.overtime).toBe(3);
  });

  it("honours a shorter duty day, so overtime starts earlier", () => {
    const points = dailyHourTotals(
      [person("a", { dutyHours: 6 })],
      new Map([["a", [day("2026-08-27", 9)]]]),
      rule,
    );

    expect(points[0]?.duty).toBe(6);
    expect(points[0]?.overtime).toBe(3);
  });

  it("pays no overtime to someone who is not eligible", () => {
    const points = dailyHourTotals(
      [person("a", { overtimeEligible: false })],
      new Map([["a", [day("2026-08-27", 11)]]]),
      rule,
    );

    expect(points[0]?.overtime).toBe(0);
  });

  it("sorts by date rather than by insertion", () => {
    const points = dailyHourTotals(
      [person("a")],
      new Map([["a", [day("2026-08-27", 8), day("2026-08-25", 8), day("2026-08-26", 8)]]]),
      rule,
    );

    expect(points.map((p) => p.date)).toEqual(["2026-08-25", "2026-08-26", "2026-08-27"]);
  });

  it("ignores a person with no entry in the map", () => {
    const points = dailyHourTotals(
      [person("a"), person("ghost")],
      new Map([["a", [day("2026-08-27", 8)]]]),
      rule,
    );

    expect(points).toHaveLength(1);
    expect(points[0]?.duty).toBe(8);
  });

  it("rounds to two decimals so summed floats do not drift", () => {
    const points = dailyHourTotals(
      [person("a"), person("b"), person("c")],
      new Map([
        ["a", [day("2026-08-27", 8.1)]],
        ["b", [day("2026-08-27", 8.1)]],
        ["c", [day("2026-08-27", 8.1)]],
      ]),
      rule,
    );

    const total = (points[0]?.duty ?? 0) + (points[0]?.overtime ?? 0);
    expect(Number.isInteger(Math.round(total * 100))).toBe(true);
  });
});
