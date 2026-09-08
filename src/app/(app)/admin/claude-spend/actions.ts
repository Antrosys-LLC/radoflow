"use server";

import { revalidatePath } from "next/cache";

import { requirePermission } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";

/**
 * The two figures that turn a dollar bill into a rupee one.
 *
 * Settings rather than constants because the office changes them: the rupee
 * rate moves weekly, and the payment tax is whatever the bank actually
 * charges. A redeploy is not an acceptable way to correct either.
 */

export interface SettingsResult {
  ok: boolean;
  message: string;
}

export async function saveSpendSettings(
  _prev: SettingsResult,
  form: FormData,
): Promise<SettingsResult> {
  const session = await requirePermission("settings.manage");

  const rate = Number(String(form.get("usd_to_pkr") ?? "").trim());
  const tax = Number(String(form.get("tax_percent") ?? "").trim());

  if (!Number.isFinite(rate) || rate <= 0) {
    return { ok: false, message: "The rupee rate must be greater than zero." };
  }
  if (!Number.isFinite(tax) || tax < 0 || tax > 100) {
    return { ok: false, message: "The tax must be between 0 and 100 percent." };
  }

  const supabase = await createClient();
  const { error } = await supabase.from("app_settings").upsert(
    [
      { key: "usd_to_pkr", value: rate, updated_by: session.userId },
      { key: "tax_percent", value: tax, updated_by: session.userId },
    ],
    { onConflict: "key" },
  );

  if (error) return { ok: false, message: error.message };

  revalidatePath("/admin/claude-spend");
  return { ok: true, message: "Saved." };
}
