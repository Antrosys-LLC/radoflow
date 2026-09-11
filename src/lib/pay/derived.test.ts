import { describe, expect, it } from "vitest";

import { deriveRates } from "./derived";
import { dailyRate, overtimeRate } from "@/lib/payroll/hours";

describe("deriveRates", () => {
  it("breaks a monthly salary down to the day, hour and minute", () => {
    // 30,000 across a 30-day month: 1,000 a day, 125 an hour on an eight-hour
    // duty day, and a shade over two rupees a minute.
    const rates = deriveRates(30_000, 8, "2026-09-15");

    expect(rates.daysInMonth).toBe(30);
    expect(rates.perDay).toBe(1000);
    expect(rates.perHour).toBe(125);
    expect(rates.perMinute).toBeCloseTo(2.0833, 4);
  });

  it("uses the month's own length, not a fixed 30", () => {
    // The same salary is worth more a day in February than in January, because
    // `dailyRate` divides by the real month. A screen quoting a fixed divisor
    // would disagree with the payslip for eight months of the year.
    const january = deriveRates(31_000, 8, "2026-01-10");
    const february = deriveRates(31_000, 8, "2026-02-10");

    expect(january.daysInMonth).toBe(31);
    expect(february.daysInMonth).toBe(28);
    expect(january.perDay).toBe(1000);
    expect(february.perDay).toBeGreaterThan(january.perDay);
  });

  it("agrees with the payroll functions it is derived from", () => {
    // The whole point of this module is that a screen and a payslip cannot
    // disagree, so the daily and overtime figures must be the payroll ones
    // exactly — not merely close.
    const rates = deriveRates(46_500, 12, "2026-09-15");

    expect(rates.perDay).toBe(dailyRate(46_500, 30));
    expect(rates.perOvertimeHour).toBe(overtimeRate(46_500, 30));
  });

  it("prices a twelve-hour duty day per hour, but overtime per eight", () => {
    // Somebody on twelve hours has a cheaper duty hour and the same overtime
    // hour as everyone else — which is the point of the rule: the extra time
    // has to be worth more than the ordinary time.
    const rates = deriveRates(30_000, 12, "2026-09-15");

    expect(rates.perHour).toBeCloseTo(83.33, 2);
    expect(rates.perOvertimeHour).toBe(125);
    expect(rates.perOvertimeHour).toBeGreaterThan(rates.perHour);
  });

  it("falls back to an eight-hour day when duty hours are missing or absurd", () => {
    // A zero would divide by zero and report an infinite hourly rate on a
    // screen; eight is the factory's standard day.
    expect(deriveRates(30_000, 0, "2026-09-15").perHour).toBe(125);
    expect(deriveRates(30_000, -4, "2026-09-15").perHour).toBe(125);
  });

  it("is zero all the way down for an unpaid record", () => {
    // A contractor priced flat, or a person whose salary has not been set,
    // must read as zero rather than as NaN on a card.
    const rates = deriveRates(0, 8, "2026-09-15");

    expect(rates.perDay).toBe(0);
    expect(rates.perHour).toBe(0);
    expect(rates.perMinute).toBe(0);
    expect(rates.perOvertimeHour).toBe(0);
  });

  it("never reports a negative rate", () => {
    // Nothing should write a negative salary, but a bad row must not reach a
    // payslip as a negative hourly figure.
    expect(deriveRates(-5000, 8, "2026-09-15").perDay).toBe(0);
  });
});
