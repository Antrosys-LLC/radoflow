"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { createClient } from "@/lib/supabase/server";

/**
 * Saving the password a recovery link was opened to set.
 *
 * The recovery code was already exchanged for a session by the page, so this
 * is an ordinary "change my own password" — which is why it needs no token of
 * its own and cannot be pointed at anybody else's account: `updateUser` acts
 * on whoever the session says is signed in, and nothing here is read from the
 * form except the new password.
 */

export interface ResetFormState {
  error: null | string;
}

export async function setNewPassword(
  _prev: ResetFormState,
  form: FormData,
): Promise<ResetFormState> {
  const password = String(form.get("password") ?? "");
  const confirm = String(form.get("confirm") ?? "");

  if (password.length < 8) {
    return { error: "The password must be at least 8 characters." };
  }
  if (password !== confirm) {
    // Checked here as well as in the browser: the two fields exist to catch a
    // typo in something nobody can read back, and a mistyped password on an
    // account with no other way in is not recoverable.
    return { error: "The two passwords are not the same." };
  }

  const supabase = await createClient();
  const { data } = await supabase.auth.getUser();
  if (!data.user) {
    return { error: "That link has expired. Ask for a new one from the sign-in page." };
  }

  const { error } = await supabase.auth.updateUser({ password });
  if (error) return { error: error.message };

  revalidatePath("/", "layout");
  redirect("/");
}
