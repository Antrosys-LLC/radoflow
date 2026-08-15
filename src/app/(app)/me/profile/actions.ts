"use server";

import { revalidatePath } from "next/cache";

import { requireSession } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";

export interface ProfileResult {
  ok: boolean;
  message: string;
}

/**
 * Self-service contact details.
 *
 * Only the fields a person owns. Pay, placement and employment terms are
 * stripped by the guard_profile_self_update trigger even if they were posted,
 * so this cannot become a salary-editing endpoint by accident.
 */
export async function updateMyProfile(
  _prev: ProfileResult,
  form: FormData,
): Promise<ProfileResult> {
  const session = await requireSession();
  const supabase = await createClient();

  const fullName = String(form.get("full_name") ?? "").trim();
  const phone = String(form.get("phone") ?? "").trim();

  if (!fullName) return { ok: false, message: "Your name cannot be empty." };

  const { error } = await supabase
    .from("profiles")
    .update({ full_name: fullName, phone: phone || null })
    .eq("id", session.userId);

  if (error) return { ok: false, message: error.message };

  revalidatePath("/me/profile");
  revalidatePath("/", "layout");
  return { ok: true, message: "Profile updated." };
}

export async function changeMyPassword(
  _prev: ProfileResult,
  form: FormData,
): Promise<ProfileResult> {
  await requireSession();

  const password = String(form.get("password") ?? "");
  const confirm = String(form.get("confirm") ?? "");

  if (password.length < 8) {
    return { ok: false, message: "Use at least 8 characters." };
  }
  if (password !== confirm) {
    return { ok: false, message: "The two passwords do not match." };
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.updateUser({ password });

  if (error) return { ok: false, message: error.message };

  return { ok: true, message: "Password changed." };
}
