/**
 * What the canteen cooks on a day, and what one meal of it costs.
 *
 * The office keeps a weekly schedule — chicken on Monday, daal on Tuesday, no
 * meal on Thursday — and changes any single date by hand. A date can be given
 * its own dishes, which replace the schedule for that date, or be marked as
 * serving no meal. Moving a meal from one day to another is both at once:
 * Thursday takes Monday's dishes as its own menu, and Monday serves none.
 * Nothing moves on its own; the schedule is what the canteen cooks until the
 * office says otherwise.
 *
 * Some days serve one dish or another — Wednesday is Aloo Kofta or Sabzi, all
 * day, and which one is only known on the day. Those dishes are options: the
 * office records what was served on each date, and until it does the day is
 * flagged and counted at the dearer option, so a bill is never short.
 *
 * A meal served on a day costs the sum of that day's dishes, so the canteen's
 * bill follows what was actually cooked instead of one flat price all year.
 *
 * Pure: dates and the office's decisions in, one menu per date out.
 */

export interface MenuItem {
  name: string;
  /** Rupees for this dish in one meal. */
  price: number;
  /** One of its weekday's alternatives, served all day in place of the others. */
  option?: boolean;
}

/** Weekday (0 Sunday … 6 Saturday) to the dishes scheduled for it. */
export type WeeklyMenu = ReadonlyMap<number, readonly MenuItem[]>;

export interface DayMenu {
  date: string;
  /** What a meal is counted as: the dishes served, or for `choose` the dearer option. */
  items: readonly MenuItem[];
  /** Rupees for one meal that day: the dishes added together. */
  price: number;
  /**
   * Where the menu came from: the date's own dishes, the weekly schedule,
   * nothing scheduled, `off` — a date the office said serves no meal — or
   * `choose`, a day of alternatives nobody has recorded yet.
   */
  source: "day" | "weekly" | "none" | "off" | "choose";
  /** The weekday's dishes that are always served. */
  fixed: readonly MenuItem[];
  /** The weekday's alternatives, one of which is served all day. */
  options: readonly MenuItem[];
  /** Whether the factory works that day — shown beside the menu, never deciding it. */
  working: boolean;
}

const round2 = (value: number) => Math.round(value * 100) / 100;

export function menuPrice(items: readonly MenuItem[]): number {
  return round2(items.reduce((total, item) => total + (item.price > 0 ? item.price : 0), 0));
}

function weekdayOf(date: string): number {
  return new Date(`${date}T00:00:00Z`).getUTCDay();
}

function addDays(date: string, days: number): string {
  const parsed = new Date(`${date}T00:00:00Z`);
  parsed.setUTCDate(parsed.getUTCDate() + days);
  return parsed.toISOString().slice(0, 10);
}

/** The Monday a date's week starts on. Sunday closes the week, as on the floor. */
export function weekStart(date: string): string {
  const weekday = weekdayOf(date);
  return addDays(date, weekday === 0 ? -6 : 1 - weekday);
}

/** Every date from `from` to `to`, both included. */
export function datesBetween(from: string, to: string): string[] {
  const dates: string[] = [];
  for (let date = from; date <= to && dates.length < 400; date = addDays(date, 1)) {
    dates.push(date);
  }
  return dates;
}

/**
 * The menu for every date from `from` to `to`.
 *
 * A date marked no meal serves nothing; otherwise its own dishes win, then the
 * weekly schedule for its weekday — with a day of alternatives waiting for the
 * office to record which one was served.
 */
export function planMenus(
  from: string,
  to: string,
  weekly: WeeklyMenu,
  days: ReadonlyMap<string, readonly MenuItem[]>,
  isWorking: (date: string) => boolean = (date) => weekdayOf(date) !== 0,
  noMeal: ReadonlySet<string> = new Set(),
): DayMenu[] {
  if (from > to) return [];

  return datesBetween(from, to).map((date): DayMenu => {
    const working = isWorking(date);
    const scheduled = weekly.get(weekdayOf(date)) ?? [];
    const fixed = scheduled.filter((item) => !item.option);
    const options = scheduled.filter((item) => item.option);
    const base = { date, fixed, options, working };

    if (noMeal.has(date)) return { ...base, items: [], price: 0, source: "off" };

    const own = days.get(date);
    if (own && own.length > 0) {
      return { ...base, items: own, price: menuPrice(own), source: "day" };
    }

    if (options.length > 0) {
      const dearest = options.reduce((a, b) => (b.price > a.price ? b : a));
      const items = [...fixed, dearest];
      return { ...base, items, price: menuPrice(items), source: "choose" };
    }

    if (scheduled.length > 0) {
      return { ...base, items: scheduled, price: menuPrice(scheduled), source: "weekly" };
    }

    return { ...base, items: [], price: 0, source: "none" };
  });
}

/** The price of one meal on each date that has a menu, for pricing servings. */
export function dayPrices(menus: readonly DayMenu[]): Map<string, number> {
  return new Map(menus.filter((menu) => menu.items.length > 0).map((m) => [m.date, m.price]));
}
