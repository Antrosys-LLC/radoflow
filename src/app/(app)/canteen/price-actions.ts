"use server";

import { revalidatePath } from "next/cache";

import { requirePermission } from "@/lib/auth/session";
import { dictionaryFor } from "@/lib/i18n";
import { createClient } from "@/lib/supabase/server";

export interface MealPriceResult {
  ok: boolean;
  message: string;
}

/**
 * Sets what one meal costs.
 *
 * Only servings recorded from now on take the new price — each serving keeps
 * the price it was handed over at, so last month's canteen bill does not move
 * because this month's price did. A blank price clears it.
 */
export async function saveMealPrice(
  _prev: MealPriceResult,
  form: FormData,
): Promise<MealPriceResult> {
  const session = await requirePermission("canteen.manage");
  const t = dictionaryFor(session.profile.language);

  const raw = String(form.get("price") ?? "").trim();
  const price = raw === "" ? null : Number(raw);

  if (price !== null && (!Number.isFinite(price) || price < 0)) {
    return { ok: false, message: t.canteenHistory.priceInvalid };
  }

  const supabase = await createClient();
  const { error } = await supabase.from("app_settings").upsert(
    {
      key: "canteen.meal_price_pkr",
      value: price === null ? null : Math.round(price * 100) / 100,
      updated_by: session.userId,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "key" },
  );

  if (error) return { ok: false, message: error.message };

  revalidatePath("/canteen");
  revalidatePath("/canteen/history");
  revalidatePath("/canteen/settings");
  return { ok: true, message: t.canteenHistory.priceSaved };
}
