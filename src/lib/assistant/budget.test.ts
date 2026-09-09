import { describe, expect, it } from "vitest";

import { budgetState, DEFAULT_MONTHLY_LIMIT_PKR, monthStart, type UsageRow } from "./budget";

/** A row costing `usd`, asked at `at`. */
const row = (usd: number, at: string): UsageRow => ({ cost_usd: usd, asked_at: at });

const NOW = new Date("2026-09-15T10:00:00Z");
// No tax and a round rate, so the arithmetic under test is the budget's own
// rather than the conversion's.
const PLAIN = { rate: 100, taxPercent: 0, now: NOW };

describe("monthStart", () => {
  it("is midnight on the first, in UTC", () => {
    expect(monthStart(NOW).toISOString()).toBe("2026-09-01T00:00:00.000Z");
  });
});

describe("budgetState", () => {
  it("adds up this month and leaves the rest", () => {
    const state = budgetState(
      [
        row(1, "2026-09-02T08:00:00Z"),
        row(2, "2026-09-14T08:00:00Z"),
        // Last month. Counting it would carry August's spend into September
        // and close the budget early every month.
        row(9, "2026-08-31T23:59:00Z"),
      ],
      PLAIN,
    );

    expect(state.spentPkr).toBe(300);
    expect(state.limitPkr).toBe(DEFAULT_MONTHLY_LIMIT_PKR);
    expect(state.remainingPkr).toBe(700);
    expect(state.overBudget).toBe(false);
  });

  it("applies the tax before the conversion", () => {
    // $1 at 10% tax and 100/dollar is Rs 110 — the same order costInPkr uses.
    const state = budgetState([row(1, "2026-09-02T08:00:00Z")], {
      rate: 100,
      taxPercent: 10,
      now: NOW,
    });

    expect(state.spentPkr).toBeCloseTo(110, 6);
  });

  it("is over budget at the limit, not past it", () => {
    // The question about to be asked is the one that would take it over.
    // Refusing only after the line is crossed is not a ceiling.
    const state = budgetState([row(10, "2026-09-02T08:00:00Z")], { ...PLAIN, limitPkr: 1000 });

    expect(state.spentPkr).toBe(1000);
    expect(state.overBudget).toBe(true);
    expect(state.remainingPkr).toBe(0);
  });

  it("clamps the bar rather than drawing past the end", () => {
    const state = budgetState([row(50, "2026-09-02T08:00:00Z")], { ...PLAIN, limitPkr: 1000 });

    expect(state.fraction).toBe(1);
    expect(state.remainingPkr).toBe(0);
  });

  it("ignores a row with an unreadable date or cost", () => {
    // These come out of a database column; one bad row must not turn the whole
    // month's spend into NaN and refuse every question.
    const state = budgetState(
      [
        row(1, "2026-09-02T08:00:00Z"),
        row(Number.NaN, "2026-09-03T08:00:00Z"),
        row(1, "not-a-date"),
      ],
      PLAIN,
    );

    expect(state.spentPkr).toBe(100);
  });

  it("falls back to the default when the stored limit is absent or absurd", () => {
    // A zero or negative ceiling would mean "no questions ever", which is a
    // setting nobody would choose on purpose and every empty field produces.
    expect(budgetState([], { ...PLAIN, limitPkr: 0 }).limitPkr).toBe(DEFAULT_MONTHLY_LIMIT_PKR);
    expect(budgetState([], { ...PLAIN, limitPkr: -5 }).limitPkr).toBe(DEFAULT_MONTHLY_LIMIT_PKR);
  });

  it("starts a fresh month at nothing spent", () => {
    const state = budgetState([row(9, "2026-08-31T23:59:00Z")], {
      ...PLAIN,
      now: new Date("2026-09-01T00:00:01Z"),
    });

    expect(state.spentPkr).toBe(0);
    expect(state.overBudget).toBe(false);
  });
});
