import type { createClient } from "@/lib/supabase/server";

import type { MealSummary, MealTotals } from "./history";

/**
 * Meals taken by somebody the terminal knows and RadoFlow does not.
 *
 * A scan whose number belongs to nobody in RadoFlow is still a plate handed
 * over, so it is counted — once per number per day, because a second scan is a
 * second attempt, not a second plate. They are kept apart from the people
 * (there is no person to attach them to) and shown highlighted as "Not in
 * RadoFlow" on the screen and in every download, so the office can add them.
 */

type Client = Awaited<ReturnType<typeof createClient>>;

export interface UnmatchedMeal {
  /** The Pakistan serving date. */
  date: string;
  deviceUserId: string;
  scannedAt: string;
}

const pakistanDate = (iso: string) =>
  new Date(Date.parse(iso) + 5 * 60 * 60 * 1000).toISOString().slice(0, 10);

/** One meal per number per day, oldest scan first. Pure, so it can be tested. */
export function unmatchedMeals(
  scans: readonly { device_user_id: string | null; scanned_at: string }[],
): UnmatchedMeal[] {
  const seen = new Set<string>();
  const meals: UnmatchedMeal[] = [];
  for (const scan of [...scans].sort((a, b) => a.scanned_at.localeCompare(b.scanned_at))) {
    if (!scan.device_user_id) continue;
    const date = pakistanDate(scan.scanned_at);
    const key = `${date}:${scan.device_user_id}`;
    if (seen.has(key)) continue;
    seen.add(key);
    meals.push({ date, deviceUserId: scan.device_user_id, scannedAt: scan.scanned_at });
  }
  return meals;
}

export async function loadUnmatchedMeals(
  supabase: Client,
  from: string,
  to: string,
): Promise<UnmatchedMeal[]> {
  const next = new Date(`${to}T00:00:00Z`);
  next.setUTCDate(next.getUTCDate() + 1);

  const scans: { device_user_id: string | null; scanned_at: string }[] = [];
  for (let page = 0; page < 100; page++) {
    const { data, error } = await supabase
      .from("meal_scan_log")
      .select("device_user_id, scanned_at")
      .eq("outcome", "unknown_person")
      .gte("scanned_at", `${from}T00:00:00+05:00`)
      .lt("scanned_at", `${next.toISOString().slice(0, 10)}T00:00:00+05:00`)
      .order("scanned_at")
      .range(page * 1000, page * 1000 + 999);
    if (error) break;
    scans.push(...(data ?? []));
    if (!data || data.length < 1000) break;
  }
  return unmatchedMeals(scans);
}

const round2 = (value: number) => Math.round(value * 100) / 100;

/**
 * The summary with these meals counted in. Priced like any other meal of the
 * day: that day's menu, else today's flat price, reported as an estimate.
 */
export function withUnmatched(
  summary: MealSummary,
  meals: readonly UnmatchedMeal[],
  currentPrice: number | null,
  menuPrices?: ReadonlyMap<string, number>,
): MealSummary {
  if (meals.length === 0) return summary;

  const byDay = new Map(summary.byDay.map((day) => [day.date, { ...day }]));
  const total: MealTotals = { ...summary.total };

  for (const meal of meals) {
    const menu = menuPrices?.get(meal.date);
    const known = menu !== undefined && menu >= 0;
    const amount = known ? menu : currentPrice !== null && currentPrice >= 0 ? currentPrice : 0;
    const unpriced = known ? 0 : 1;

    const day = byDay.get(meal.date) ?? { date: meal.date, meals: 0, amount: 0, unpriced: 0 };
    day.meals += 1;
    day.amount = round2(day.amount + amount);
    day.unpriced += unpriced;
    byDay.set(meal.date, day);

    total.meals += 1;
    total.amount = round2(total.amount + amount);
    total.unpriced += unpriced;
  }

  return {
    ...summary,
    total,
    byDay: [...byDay.values()].sort((a, b) => a.date.localeCompare(b.date)),
  };
}
