"use server";

import { revalidatePath } from "next/cache";

import { requirePermission } from "@/lib/auth/session";
import { minutesOfDay } from "@/lib/canteen/meals";
import { createClient } from "@/lib/supabase/server";

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
  await requirePermission("canteen.manage");

  const id = text(form, "id");
  const siteId = text(form, "site_id");
  const name = text(form, "name");
  const startsAt = text(form, "starts_at");
  const endsAt = text(form, "ends_at");

  if (!siteId || !name) return { ok: false, message: "Choose a factory and give it a name." };

  const start = minutesOfDay(startsAt);
  const end = minutesOfDay(endsAt);
  if (start === null || end === null) {
    return { ok: false, message: "Enter both times as HH:MM." };
  }
  if (start === end) {
    return {
      ok: false,
      message: "Start and end cannot be the same — that window would never open.",
    };
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
      return { ok: false, message: `A serving named "${name}" already exists at this factory.` };
    }
    return { ok: false, message: error.message };
  }

  revalidatePath("/canteen/settings");
  revalidatePath("/canteen");
  return { ok: true, message: id ? "Serving time updated." : "Serving time added." };
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
  await requirePermission("canteen.manage");

  const supabase = await createClient();
  const { error } = await supabase.from("meal_windows").delete().eq("id", windowId);

  if (error) {
    if (error.code === "23503") {
      return {
        ok: false,
        message:
          "Meals have already been served in this window — switch it off instead of deleting it.",
      };
    }
    return { ok: false, message: error.message };
  }

  revalidatePath("/canteen/settings");
  revalidatePath("/canteen");
  return { ok: true, message: "Serving time removed." };
}
