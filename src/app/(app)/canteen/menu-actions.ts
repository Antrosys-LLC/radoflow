"use server";

import { revalidatePath } from "next/cache";

import { requirePermission } from "@/lib/auth/session";
import { dictionaryFor } from "@/lib/i18n";
import { createClient } from "@/lib/supabase/server";

/**
 * Writing the canteen's menus and meal limits.
 *
 * `canteen.manage` throughout, the same line the table policies draw. Every
 * write revalidates the history page too: a dish added to a day re-prices
 * every meal served on it, and the totals there have to say so.
 */

export interface MenuResult {
  ok: boolean;
  message: string;
}

function refresh() {
  revalidatePath("/canteen");
  revalidatePath("/canteen/history");
  revalidatePath("/canteen/settings");
}

function text(form: FormData, key: string): string {
  return String(form.get(key) ?? "").trim();
}

function readDate(value: string): string | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const parsed = new Date(`${value}T00:00:00Z`);
  return Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== value
    ? null
    : value;
}

async function siteId(supabase: Awaited<ReturnType<typeof createClient>>) {
  const { data } = await supabase.from("sites").select("id").order("name").limit(1);
  return data?.[0]?.id ?? null;
}

/** One dish, onto a weekday's schedule (`weekday`) or onto one date (`day`). */
export async function addMenuItem(_prev: MenuResult, form: FormData): Promise<MenuResult> {
  const session = await requirePermission("canteen.manage");
  const t = dictionaryFor(session.profile.language);

  const name = text(form, "name");
  const price = Number(text(form, "price"));
  const weekdayRaw = text(form, "weekday");
  const day = readDate(text(form, "day"));
  const weekday = weekdayRaw === "" ? null : Number(weekdayRaw);

  if (!name) return { ok: false, message: t.canteenMenu.nameRequired };
  if (!Number.isFinite(price) || price < 0)
    return { ok: false, message: t.canteenMenu.priceInvalid };
  if (day === null && (weekday === null || !(weekday >= 0 && weekday <= 6))) {
    return { ok: false, message: t.canteenMenu.chooseDay };
  }

  const supabase = await createClient();
  const site = await siteId(supabase);
  if (!site) return { ok: false, message: t.canteenMenu.noFactory };

  const row = {
    site_id: site,
    name,
    price_pkr: Math.round(price * 100) / 100,
    sort_order: Number(text(form, "sort_order") || 100) || 100,
    created_by: session.userId,
  };

  const { error } = day
    ? await supabase.from("canteen_menu_days" as never).insert({ ...row, day } as never)
    : await supabase
        .from("canteen_menu_weekly" as never)
        .insert({ ...row, weekday, is_option: form.get("option") !== null } as never);

  if (error) return { ok: false, message: error.message };
  refresh();
  return { ok: true, message: t.canteenMenu.added };
}

export async function removeMenuItem(table: "weekly" | "day", id: string): Promise<MenuResult> {
  const session = await requirePermission("canteen.manage");
  const t = dictionaryFor(session.profile.language);
  const supabase = await createClient();

  const { error } = await supabase
    .from((table === "weekly" ? "canteen_menu_weekly" : "canteen_menu_days") as never)
    .delete()
    .eq("id", id);

  if (error) return { ok: false, message: error.message };
  refresh();
  return { ok: true, message: t.canteenMenu.removed };
}

/**
 * Starts a date's own menu from what the schedule would have served, so the
 * office changes one dish instead of typing the whole day again.
 */
export async function copyScheduleToDay(
  day: string,
  items: { name: string; price: number }[],
): Promise<MenuResult> {
  const session = await requirePermission("canteen.manage");
  const t = dictionaryFor(session.profile.language);
  const date = readDate(day);
  if (!date) return { ok: false, message: t.canteenMenu.chooseDay };

  const supabase = await createClient();
  const site = await siteId(supabase);
  if (!site) return { ok: false, message: t.canteenMenu.noFactory };

  const rows = items
    .filter((item) => item.name.trim() && Number.isFinite(item.price) && item.price >= 0)
    .map((item, index) => ({
      site_id: site,
      day: date,
      name: item.name.trim(),
      price_pkr: Math.round(item.price * 100) / 100,
      sort_order: (index + 1) * 10,
      created_by: session.userId,
    }));
  if (rows.length === 0) return { ok: false, message: t.canteenMenu.nothingToCopy };

  const { error } = await supabase.from("canteen_menu_days" as never).insert(rows as never);
  if (error) return { ok: false, message: error.message };
  refresh();
  return { ok: true, message: t.canteenMenu.copied };
}

/** Says a date serves no meal — or takes that back. */
export async function setNoMeal(day: string, noMeal: boolean): Promise<MenuResult> {
  const session = await requirePermission("canteen.manage");
  const t = dictionaryFor(session.profile.language);
  const date = readDate(day);
  if (!date) return { ok: false, message: t.canteenMenu.chooseDay };

  const supabase = await createClient();
  const site = await siteId(supabase);
  if (!site) return { ok: false, message: t.canteenMenu.noFactory };

  const { error } = noMeal
    ? await supabase
        .from("canteen_menu_no_meal" as never)
        .upsert({ site_id: site, day: date, created_by: session.userId } as never, {
          onConflict: "site_id,day",
        })
    : await supabase
        .from("canteen_menu_no_meal" as never)
        .delete()
        .eq("site_id", site)
        .eq("day", date);

  if (error) return { ok: false, message: error.message };
  refresh();
  return { ok: true, message: noMeal ? t.canteenMenu.markedNoMeal : t.canteenMenu.mealBack };
}

/**
 * Moves one day's meal to another date: the other date takes these dishes as
 * its own menu, and this date serves no meal. Thursday's meal served on a
 * Monday is exactly this.
 */
export async function moveMeal(
  from: string,
  to: string,
  items: { name: string; price: number }[],
): Promise<MenuResult> {
  const session = await requirePermission("canteen.manage");
  const t = dictionaryFor(session.profile.language);
  const source = readDate(from);
  const target = readDate(to);
  if (!source || !target || source === target)
    return { ok: false, message: t.canteenMenu.chooseDay };

  const supabase = await createClient();
  const site = await siteId(supabase);
  if (!site) return { ok: false, message: t.canteenMenu.noFactory };

  const rows = items
    .filter((item) => item.name.trim() && Number.isFinite(item.price) && item.price >= 0)
    .map((item, index) => ({
      site_id: site,
      day: target,
      name: item.name.trim(),
      price_pkr: Math.round(item.price * 100) / 100,
      sort_order: (index + 1) * 10,
      created_by: session.userId,
    }));
  if (rows.length === 0) return { ok: false, message: t.canteenMenu.nothingToCopy };

  // The target's old dishes go, so it serves exactly what moved onto it.
  const cleared = await supabase
    .from("canteen_menu_days" as never)
    .delete()
    .eq("site_id", site)
    .eq("day", target);
  if (cleared.error) return { ok: false, message: cleared.error.message };

  const [inserted, reopened] = await Promise.all([
    supabase.from("canteen_menu_days" as never).insert(rows as never),
    supabase
      .from("canteen_menu_no_meal" as never)
      .delete()
      .eq("site_id", site)
      .eq("day", target),
  ]);
  if (inserted.error) return { ok: false, message: inserted.error.message };
  if (reopened.error) return { ok: false, message: reopened.error.message };

  const closed = await supabase
    .from("canteen_menu_no_meal" as never)
    .upsert({ site_id: site, day: source, created_by: session.userId } as never, {
      onConflict: "site_id,day",
    });
  if (closed.error) return { ok: false, message: closed.error.message };

  refresh();
  return { ok: true, message: t.canteenMenu.moved };
}

/**
 * Records what a day of alternatives actually served — Aloo Kofta or Sabzi on
 * a Wednesday. Written as that date's own menu, so its meals are priced at it.
 */
export async function chooseServed(
  day: string,
  items: { name: string; price: number }[],
): Promise<MenuResult> {
  const session = await requirePermission("canteen.manage");
  const t = dictionaryFor(session.profile.language);
  const date = readDate(day);
  if (!date) return { ok: false, message: t.canteenMenu.chooseDay };

  const supabase = await createClient();
  const site = await siteId(supabase);
  if (!site) return { ok: false, message: t.canteenMenu.noFactory };

  const rows = items
    .filter((item) => item.name.trim() && Number.isFinite(item.price) && item.price >= 0)
    .map((item, index) => ({
      site_id: site,
      day: date,
      name: item.name.trim(),
      price_pkr: Math.round(item.price * 100) / 100,
      sort_order: (index + 1) * 10,
      created_by: session.userId,
    }));
  if (rows.length === 0) return { ok: false, message: t.canteenMenu.nothingToCopy };

  const cleared = await supabase
    .from("canteen_menu_days" as never)
    .delete()
    .eq("site_id", site)
    .eq("day", date);
  if (cleared.error) return { ok: false, message: cleared.error.message };

  const { error } = await supabase.from("canteen_menu_days" as never).insert(rows as never);
  if (error) return { ok: false, message: error.message };

  refresh();
  return { ok: true, message: t.canteenMenu.servedSaved };
}

/** Meals a person, or everybody in a department, may take in any 24 hours. */
export async function setMealLimit(
  scope: "department" | "person",
  id: string,
  limit: number | null,
): Promise<MenuResult> {
  const session = await requirePermission("canteen.manage");
  const t = dictionaryFor(session.profile.language);

  if (limit !== null && !(Number.isInteger(limit) && limit >= 1 && limit <= 10)) {
    return { ok: false, message: t.canteenMenu.limitInvalid };
  }

  const supabase = await createClient();
  const { error } = await supabase.rpc(
    "set_meal_limit" as never,
    {
      p_scope: scope,
      p_id: id,
      p_limit: limit,
    } as never,
  );

  if (error) return { ok: false, message: error.message };
  refresh();
  return { ok: true, message: t.canteenMenu.limitSaved };
}
