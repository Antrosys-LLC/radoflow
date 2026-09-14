/**
 * What the canteen served over a stretch of days, and what it came to.
 *
 * Pure: servings in, totals out. Each serving carries the price it was served
 * at (`price_pkr`, stamped by the database when it was recorded). A serving
 * from before any price was set has none, and is counted at the current price
 * and reported as such — so the office can see how much of a total is an
 * estimate rather than a record.
 */

export interface MealClaimRow {
  profile_id: string;
  meal_window_id: string | null;
  served_on: string;
  price_pkr?: number | string | null;
}

export interface MealTotals {
  meals: number;
  /** Rupees, to the paisa. */
  amount: number;
  /** Servings with no stamped price, counted at the current one. */
  unpriced: number;
}

export interface MealSummary {
  total: MealTotals;
  byDay: (MealTotals & { date: string })[];
  byWindow: (MealTotals & { windowId: string | null })[];
  byPerson: (MealTotals & { profileId: string })[];
}

const round2 = (value: number) => Math.round(value * 100) / 100;

/** The rupees one serving is counted at, and whether that was estimated. */
export function mealCost(
  row: Pick<MealClaimRow, "price_pkr">,
  currentPrice: number | null,
): { amount: number; unpriced: boolean } {
  const stamped =
    row.price_pkr === null || row.price_pkr === undefined ? NaN : Number(row.price_pkr);
  if (Number.isFinite(stamped) && stamped >= 0) return { amount: stamped, unpriced: false };
  return { amount: currentPrice !== null && currentPrice >= 0 ? currentPrice : 0, unpriced: true };
}

function add(totals: MealTotals, amount: number, unpriced: boolean) {
  totals.meals += 1;
  totals.amount = round2(totals.amount + amount);
  if (unpriced) totals.unpriced += 1;
}

const empty = (): MealTotals => ({ meals: 0, amount: 0, unpriced: 0 });

export function summariseMeals(
  rows: readonly MealClaimRow[],
  currentPrice: number | null,
): MealSummary {
  const total = empty();
  const days = new Map<string, MealTotals>();
  const windows = new Map<string | null, MealTotals>();
  const people = new Map<string, MealTotals>();

  for (const row of rows) {
    const { amount, unpriced } = mealCost(row, currentPrice);
    add(total, amount, unpriced);

    for (const [map, key] of [
      [days, row.served_on],
      [windows, row.meal_window_id],
      [people, row.profile_id],
    ] as [Map<string | null, MealTotals>, string | null][]) {
      const entry = map.get(key) ?? empty();
      add(entry, amount, unpriced);
      map.set(key, entry);
    }
  }

  return {
    total,
    byDay: [...days]
      .map(([date, totals]) => ({ date, ...totals }))
      .sort((a, b) => a.date.localeCompare(b.date)),
    byWindow: [...windows]
      .map(([windowId, totals]) => ({ windowId, ...totals }))
      .sort((a, b) => b.meals - a.meals),
    byPerson: [...people]
      .map(([profileId, totals]) => ({ profileId, ...totals }))
      .sort((a, b) => b.meals - a.meals || b.amount - a.amount),
  };
}

/** A price as the settings row stores it: a number, or nothing set. */
export function readMealPrice(value: unknown): number | null {
  const price = typeof value === "number" ? value : typeof value === "string" ? Number(value) : NaN;
  return Number.isFinite(price) && price >= 0 ? price : null;
}
