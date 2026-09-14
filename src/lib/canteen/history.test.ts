import { describe, expect, it } from "vitest";

import { mealCost, readMealPrice, summariseMeals, type MealClaimRow } from "./history";

const rows: MealClaimRow[] = [
  { profile_id: "a", meal_window_id: "lunch", served_on: "2026-09-01", price_pkr: 150 },
  { profile_id: "a", meal_window_id: "dinner", served_on: "2026-09-02", price_pkr: "150.00" },
  { profile_id: "b", meal_window_id: "lunch", served_on: "2026-09-01", price_pkr: null },
];

describe("canteen history", () => {
  it("uses the price a meal was served at, and today's for one served before a price existed", () => {
    expect(mealCost({ price_pkr: 120 }, 150)).toEqual({ amount: 120, unpriced: false });
    expect(mealCost({ price_pkr: null }, 150)).toEqual({ amount: 150, unpriced: true });
    expect(mealCost({ price_pkr: null }, null)).toEqual({ amount: 0, unpriced: true });
  });

  it("totals servings by day, by meal and by person", () => {
    const summary = summariseMeals(rows, 160);

    expect(summary.total).toEqual({ meals: 3, amount: 460, unpriced: 1 });
    expect(summary.byDay).toEqual([
      { date: "2026-09-01", meals: 2, amount: 310, unpriced: 1 },
      { date: "2026-09-02", meals: 1, amount: 150, unpriced: 0 },
    ]);
    expect(summary.byWindow[0]).toEqual({ windowId: "lunch", meals: 2, amount: 310, unpriced: 1 });
    expect(summary.byPerson[0]).toEqual({ profileId: "a", meals: 2, amount: 300, unpriced: 0 });
  });

  it("prices a day with a menu at that menu, whatever was stamped", () => {
    const menu = new Map([["2026-09-01", 170]]);
    const summary = summariseMeals(rows, 160, menu);

    expect(summary.byDay[0]).toEqual({ date: "2026-09-01", meals: 2, amount: 340, unpriced: 0 });
    expect(summary.byDay[1]).toEqual({ date: "2026-09-02", meals: 1, amount: 150, unpriced: 0 });
  });

  it("reads a stored price, and treats anything else as not set", () => {
    expect(readMealPrice(150)).toBe(150);
    expect(readMealPrice("175")).toBe(175);
    expect(readMealPrice(null)).toBeNull();
    expect(readMealPrice(-5)).toBeNull();
    expect(readMealPrice({})).toBeNull();
  });
});
