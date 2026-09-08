import { describe, expect, it } from "vitest";

import { perSecondUsd, totalUsd, usdToPkr, type DailySpend } from "./spend";

const days: DailySpend[] = [
  { day: "2026-09-01", usd: 1 },
  { day: "2026-09-02", usd: 2 },
  { day: "2026-09-03", usd: 3 },
];

describe("totalUsd", () => {
  it("adds the days up", () => {
    expect(totalUsd(days)).toBe(6);
  });

  it("is zero for no days rather than NaN", () => {
    expect(totalUsd([])).toBe(0);
  });
});

describe("perSecondUsd", () => {
  it("averages the days across their seconds", () => {
    // $6 over three days is $2 a day, which is $2 / 86,400 a second.
    expect(perSecondUsd(days)).toBeCloseTo(2 / 86_400, 12);
  });

  it("does not divide by zero on an empty report", () => {
    // A brand-new account has no buckets yet, and a spend meter reading NaN
    // would be read as a fault rather than as "nothing spent".
    expect(perSecondUsd([])).toBe(0);
  });
});

describe("usdToPkr", () => {
  it("applies the tax before the conversion", () => {
    // $10 at 10% tax is $11, which at 285 is 3,135 rupees. Order does not
    // change the arithmetic — both are flat multipliers — but it is what the
    // figure means: billed in dollars, then paid for in rupees.
    expect(usdToPkr(10, 285, 10)).toBeCloseTo(3135, 6);
  });

  it("passes the amount through untouched at zero tax", () => {
    expect(usdToPkr(10, 285, 0)).toBeCloseTo(2850, 6);
  });

  it("is zero for no spend, whatever the rate", () => {
    expect(usdToPkr(0, 285, 18)).toBe(0);
  });
});
