"use server";

import { revalidatePath } from "next/cache";

import { requirePermission } from "@/lib/auth/session";
import { minutesOfDay } from "@/lib/canteen/meals";
import { dictionaryFor, isolate } from "@/lib/i18n";
import { createClient } from "@/lib/supabase/server";

/**
 * `message` comes back already translated. The permission check hands back the
 * whole session, so the action knows the reader's language without a second
 * load and without the caller telling it — the only way an Urdu screen avoids
 * toasting an English sentence at somebody. Postgres errors are the exception
 * and are passed through untouched: they are developer-facing, and an invented
 * Urdu wrapper around one would hide what actually failed.
 */
export interface MealWindowResult {
  ok: boolean;
  message: string;
}

function text(form: FormData, key: string): string {
  return String(form.get(key) ?? "").trim();
}

/**
 * Creates or updates one serving period.
 *
 * A window may legitimately run past midnight — a night shift eating at
 * 22:00–02:00 — so an end time earlier than the start is accepted rather
 * than rejected as backwards. What is refused is start equal to end, which
 * would be a window that never opens; `is_active` is how a window is turned
 * off deliberately.
 */
export async function saveMealWindow(
  _prev: MealWindowResult,
  form: FormData,
): Promise<MealWindowResult> {
  const session = await requirePermission("canteen.manage");
  const t = dictionaryFor(session.profile.language);

  const id = text(form, "id");
  const siteId = text(form, "site_id");
  const name = text(form, "name");
  const startsAt = text(form, "starts_at");
  const endsAt = text(form, "ends_at");

  if (!siteId || !name) {
    return { ok: false, message: t.canteenSettings.chooseFactoryAndName };
  }

  const start = minutesOfDay(startsAt);
  const end = minutesOfDay(endsAt);
  if (start === null || end === null) {
    return { ok: false, message: t.canteenSettings.enterTimes };
  }
  if (start === end) {
    return { ok: false, message: t.canteenSettings.sameStartEnd };
  }

  // Derived from the name so the code and the label always agree, the same
  // rule the per-person pay components follow.
  const code =
    text(form, "code") ||
    name
      .toUpperCase()
      .replace(/[^A-Z0-9]+/g, "_")
      .slice(0, 24) ||
    "MEAL";

  const payload = {
    site_id: siteId,
    code,
    name,
    starts_at: startsAt,
    ends_at: endsAt,
    is_active: form.get("is_active") !== null,
    sort_order: Number(text(form, "sort_order") || 100) || 100,
  };

  const supabase = await createClient();
  const { error } = id
    ? await supabase.from("meal_windows").update(payload).eq("id", id)
    : await supabase.from("meal_windows").insert(payload);

  if (error) {
    if (error.code === "23505") {
      /*
       * The name is whatever the office typed — quoted, and sitting between
       * two runs of Urdu in a plain string with no JSX to render `<Latin>`
       * through. `isolate()` is the equivalent for that case: without it the
       * bidi algorithm is free to reorder the quoted run on display, and the
       * toast would name a serving that is not the one being refused.
       */
      return {
        ok: false,
        message: t.canteenSettings.duplicateName.replace("{name}", isolate(name)),
      };
    }
    return { ok: false, message: error.message };
  }

  revalidatePath("/canteen/settings");
  revalidatePath("/canteen");
  return {
    ok: true,
    message: id ? t.canteenSettings.servingUpdated : t.canteenSettings.servingAdded,
  };
}

/**
 * Removes a serving period.
 *
 * `meal_claims.meal_window_id` is `on delete restrict`, so a window that has
 * already fed someone cannot be deleted — the servings would lose the meal
 * they belonged to. Deactivating is the right move there, and the message
 * says so rather than surfacing a foreign-key error.
 */
export async function deleteMealWindow(windowId: string): Promise<MealWindowResult> {
  const session = await requirePermission("canteen.manage");
  const t = dictionaryFor(session.profile.language);

  const supabase = await createClient();
  const { error } = await supabase.from("meal_windows").delete().eq("id", windowId);

  if (error) {
    if (error.code === "23503") {
      return { ok: false, message: t.canteenSettings.windowInUse };
    }
    return { ok: false, message: error.message };
  }

  revalidatePath("/canteen/settings");
  revalidatePath("/canteen");
  return { ok: true, message: t.canteenSettings.servingRemoved };
}
