import type { createClient } from "@/lib/supabase/server";

import { planMenus, weekStart, type DayMenu, type MenuItem } from "./menu";

/**
 * Reading the canteen's menus and the working calendar they follow.
 *
 * Kept apart from `menu.ts` so the rules stay pure and tested, and so every
 * screen and download that prices a meal reads the menus the same way.
 */

type Client = Awaited<ReturnType<typeof createClient>>;

export interface MenuRow {
  id: string;
  name: string;
  price: number;
  sortOrder: number;
  /** One of its weekday's alternatives, served all day in place of the others. */
  option: boolean;
}

export interface MenuData {
  siteId: string | null;
  /** Weekday (0 Sunday) to its dishes, with ids for editing. */
  weekly: Map<number, MenuRow[]>;
  /** Date to its own dishes, with ids for editing. */
  days: Map<string, MenuRow[]>;
  /** Dates the office said serve no meal. */
  noMeal: Set<string>;
  menus: DayMenu[];
  /** False on a database that has not had the menu migration. */
  available: boolean;
}

const WORKING_TYPES = new Set(["workday", "special_working", "weekend_working"]);

function addDays(date: string, days: number): string {
  const parsed = new Date(`${date}T00:00:00Z`);
  parsed.setUTCDate(parsed.getUTCDate() + days);
  return parsed.toISOString().slice(0, 10);
}

const toItem = (row: MenuRow): MenuItem => ({
  name: row.name,
  price: row.price,
  option: row.option,
});

export async function loadMenus(supabase: Client, from: string, to: string): Promise<MenuData> {
  const empty: MenuData = {
    siteId: null,
    weekly: new Map(),
    days: new Map(),
    noMeal: new Set(),
    menus: [],
    available: false,
  };

  const { data: sites } = await supabase.from("sites").select("id").order("name").limit(1);
  const siteId = sites?.[0]?.id ?? null;

  // Whole weeks, because what a Sunday serves depends on its week's Thursday.
  const weekFrom = weekStart(from);
  const weekTo = addDays(weekStart(to), 6);

  const [weeklyRead, daysRead, calendarRead, patternRead, noMealRead] = await Promise.all([
    supabase
      .from("canteen_menu_weekly" as never)
      .select("id, weekday, name, price_pkr, sort_order, is_option")
      .order("sort_order"),
    supabase
      .from("canteen_menu_days" as never)
      .select("id, day, name, price_pkr, sort_order")
      .gte("day", weekFrom)
      .lte("day", weekTo)
      .order("sort_order"),
    supabase.from("calendar_days").select("day, day_type").gte("day", weekFrom).lte("day", weekTo),
    supabase.from("work_week").select("weekday, is_working"),
    supabase
      .from("canteen_menu_no_meal" as never)
      .select("day")
      .gte("day", weekFrom)
      .lte("day", weekTo),
  ]);

  if (weeklyRead.error || daysRead.error) return { ...empty, siteId };

  const weekly = new Map<number, MenuRow[]>();
  for (const row of (weeklyRead.data ?? []) as unknown as {
    id: string;
    weekday: number;
    name: string;
    price_pkr: number | string;
    sort_order: number;
    is_option: boolean | null;
  }[]) {
    const list = weekly.get(row.weekday) ?? [];
    list.push({
      id: row.id,
      name: row.name,
      price: Number(row.price_pkr),
      sortOrder: row.sort_order,
      option: Boolean(row.is_option),
    });
    weekly.set(row.weekday, list);
  }

  const days = new Map<string, MenuRow[]>();
  for (const row of (daysRead.data ?? []) as unknown as {
    id: string;
    day: string;
    name: string;
    price_pkr: number | string;
    sort_order: number;
  }[]) {
    const list = days.get(row.day) ?? [];
    list.push({
      id: row.id,
      name: row.name,
      price: Number(row.price_pkr),
      sortOrder: row.sort_order,
      option: false,
    });
    days.set(row.day, list);
  }

  const noMeal = new Set(
    ((noMealRead.data ?? []) as unknown as { day: string }[]).map((row) => row.day),
  );

  const calendar = new Map((calendarRead.data ?? []).map((row) => [row.day, row.day_type]));
  const pattern = new Map((patternRead.data ?? []).map((row) => [row.weekday, row.is_working]));

  /*
   * The factory's own answer for a date: its calendar entry, else the weekly
   * pattern, else the rule everybody knows — Sunday off, the rest working.
   */
  const isWorking = (date: string) => {
    const type = calendar.get(date);
    if (type) return WORKING_TYPES.has(type);
    const weekday = new Date(`${date}T00:00:00Z`).getUTCDay();
    return pattern.get(weekday) ?? weekday !== 0;
  };

  const menus = planMenus(
    from,
    to,
    new Map([...weekly].map(([weekday, rows]) => [weekday, rows.map(toItem)])),
    new Map([...days].map(([date, rows]) => [date, rows.map(toItem)])),
    isWorking,
    noMeal,
  );

  return { siteId, weekly, days, noMeal, menus, available: true };
}
