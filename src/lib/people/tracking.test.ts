import { describe, expect, it } from "vitest";

import { trackingFlags, trackingValueOf } from "./tracking";

describe("trackingFlags", () => {
  it("puts an owner on neither system", () => {
    expect(trackingFlags("exempt")).toEqual({
      requires_attendance: false,
      payroll_exempt: true,
    });
  });

  it("pays salary-only staff without expecting punches", () => {
    expect(trackingFlags("salary_only")).toEqual({
      requires_attendance: false,
      payroll_exempt: false,
    });
  });

  it("tracks everyone else", () => {
    expect(trackingFlags("tracked")).toEqual({
      requires_attendance: true,
      payroll_exempt: false,
    });
  });

  it("defaults a missing or unknown value to tracked", () => {
    // A form that never rendered the field must not silently create an owner.
    expect(trackingFlags(null)).toEqual({ requires_attendance: true, payroll_exempt: false });
    expect(trackingFlags("nonsense")).toEqual({ requires_attendance: true, payroll_exempt: false });
  });
});

describe("trackingValueOf", () => {
  it("round-trips each choice", () => {
    for (const choice of ["tracked", "salary_only", "exempt"] as const) {
      expect(trackingValueOf(trackingFlags(choice))).toBe(choice);
    }
  });
});
