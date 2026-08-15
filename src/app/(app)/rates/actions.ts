"use server";

import { revalidatePath } from "next/cache";

import { requirePermission } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { todayInPakistan } from "@/lib/time";

export interface RatesResult {
  ok: boolean;
  message: string;
}

function money(form: FormData, key: string): number {
  const value = Number(String(form.get(key) ?? "").trim());
  return Number.isFinite(value) && value >= 0 ? value : 0;
}

/**
 * Records a new rate set for a site.
 *
 * Inserts a new effective-dated row rather than editing the current one, so a
 * payroll period that has already been calculated still recomputes with the
 * rates that applied at the time.
 */
export async function saveRates(_prev: RatesResult, form: FormData): Promise<RatesResult> {
  await requirePermission("rates.manage");

  const siteId = String(form.get("site_id") ?? "").trim();
  if (!siteId) return { ok: false, message: "Choose a factory." };

  const effectiveFrom = String(form.get("effective_from") ?? "").trim() || todayInPakistan();

  const standardHours = Number(String(form.get("standard_hours_per_day") ?? "8"));
  if (!(standardHours > 0 && standardHours <= 24)) {
    return { ok: false, message: "Standard hours per day must be between 1 and 24." };
  }

  const supabase = await createClient();
  const { error } = await supabase.from("pay_rules").upsert(
    {
      site_id: siteId,
      effective_from: effectiveFrom,
      standard_hours_per_day: standardHours,
      standard_days_per_month: Number(String(form.get("standard_days_per_month") ?? "26")),
      ot_hourly_rate: money(form, "ot_hourly_rate"),
      weekend_hourly_rate: money(form, "weekend_hourly_rate"),
      holiday_hourly_rate: money(form, "holiday_hourly_rate"),
      night_hourly_rate: money(form, "night_hourly_rate"),
      ot_threshold_minutes: Number(String(form.get("ot_threshold_minutes") ?? "30")),
      round_to_minutes: Number(String(form.get("round_to_minutes") ?? "15")),
    },
    { onConflict: "site_id,effective_from" },
  );

  if (error) return { ok: false, message: error.message };

  revalidatePath("/rates");
  return { ok: true, message: `Rates saved, effective ${effectiveFrom}.` };
}

/** Adds or edits one band of the late-arrival ladder. */
export async function saveLateRule(_prev: RatesResult, form: FormData): Promise<RatesResult> {
  await requirePermission("rates.manage");

  const siteId = String(form.get("site_id") ?? "").trim();
  const label = String(form.get("label") ?? "").trim();
  const fromMinutes = Number(String(form.get("from_minutes") ?? ""));
  const toRaw = String(form.get("to_minutes") ?? "").trim();
  const toMinutes = toRaw === "" ? null : Number(toRaw);
  const percent = Number(String(form.get("penalty_percent") ?? ""));

  if (!siteId || !label) return { ok: false, message: "Give the band a name and a factory." };
  if (!Number.isFinite(fromMinutes) || fromMinutes < 0) {
    return { ok: false, message: "'Late from' must be zero or more minutes." };
  }
  if (toMinutes !== null && (!Number.isFinite(toMinutes) || toMinutes <= fromMinutes)) {
    return { ok: false, message: "'Late until' must be greater than 'Late from'." };
  }
  if (!Number.isFinite(percent) || percent < 0 || percent > 100) {
    return { ok: false, message: "The penalty must be between 0 and 100 percent." };
  }

  const supabase = await createClient();
  const id = String(form.get("id") ?? "").trim();
  const payload = {
    site_id: siteId,
    label,
    from_minutes: fromMinutes,
    to_minutes: toMinutes,
    penalty_percent: percent,
    basis: (String(form.get("basis") ?? "day") as "day" | "month") ?? "day",
  };

  const { error } = id
    ? await supabase.from("late_penalty_rules").update(payload).eq("id", id)
    : await supabase.from("late_penalty_rules").insert(payload);

  if (error) return { ok: false, message: error.message };

  revalidatePath("/rates");
  return { ok: true, message: id ? "Band updated." : "Band added." };
}

export async function deleteLateRule(id: string): Promise<RatesResult> {
  await requirePermission("rates.manage");

  const supabase = await createClient();
  const { error } = await supabase.from("late_penalty_rules").delete().eq("id", id);
  if (error) return { ok: false, message: error.message };

  revalidatePath("/rates");
  return { ok: true, message: "Band removed." };
}
