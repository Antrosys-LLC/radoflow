import { describe, expect, it } from "vitest";

import { summariseMeals } from "./history";
import { unmatchedMeals, withUnmatched } from "./unmatched";

describe("unmatchedMeals", () => {
  it("counts a number once a day, however many times it scanned", () => {
    const meals = unmatchedMeals([
      { device_user_id: "494", scanned_at: "2026-11-02T09:35:02+00:00" },
      { device_user_id: "494", scanned_at: "2026-11-02T09:33:34+00:00" },
      { device_user_id: "494", scanned_at: "2026-11-03T09:01:11+00:00" },
      { device_user_id: null, scanned_at: "2026-11-03T09:01:11+00:00" },
    ]);
    expect(meals.map((m) => [m.date, m.deviceUserId, m.scannedAt])).toEqual([
      ["2026-11-02", "494", "2026-11-02T09:33:34+00:00"],
      ["2026-11-03", "494", "2026-11-03T09:01:11+00:00"],
    ]);
  });

  it("files a scan after 19:00 UTC under the next Pakistan day", () => {
    expect(unmatchedMeals([{ device_user_id: "7", scanned_at: "2026-11-02T20:00:00+00:00" }])[0]?.date).toBe(
      "2026-11-03",
    );
  });
});

describe("withUnmatched", () => {
  const claims = [{ profile_id: "a", meal_window_id: null, served_on: "2026-11-04", price_pkr: 85 }];

  it("adds them to the day's meals and amount at the day's price", () => {
    const base = summariseMeals(claims, 85, new Map([["2026-11-04", 85]]));
    const out = withUnmatched(base, [{ date: "2026-11-04", deviceUserId: "39", scannedAt: "x" }], 85, new Map([["2026-11-04", 85]]));
    expect(out.total.meals).toBe(2);
    expect(out.total.amount).toBe(170);
    expect(out.byDay[0]).toMatchObject({ date: "2026-11-04", meals: 2, amount: 170 });
  });

  it("opens a day that had only unmatched meals", () => {
    const base = summariseMeals([], 85);
    const out = withUnmatched(base, [{ date: "2026-11-02", deviceUserId: "39", scannedAt: "x" }], 85);
    expect(out.byDay).toHaveLength(1);
    expect(out.total.unpriced).toBe(1);
  });
});
