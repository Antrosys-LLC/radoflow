import { createClient as createSupabaseClient } from "@supabase/supabase-js";

import { requireSupabaseEnv } from "@/lib/env";
import { createServiceClient } from "@/lib/supabase/service";

/**
 * Proving you are still the person who signed in.
 *
 * Some actions are not "are you allowed to" questions, they are "did you mean
 * to, and is it still you" questions: handing somebody else's account over
 * with a new password, or locking a director out of theirs. A session cookie
 * on an unattended laptop answers the first question and not the second, and
 * the accounts that can do the most damage are exactly the ones left signed in
 * on a shared office machine.
 *
 * So these actions ask for the acting person's own password again, every time.
 * Not a grace period, not a "trust this device" — the whole value is that it
 * is a deliberate act at the moment of the change.
 *
 * The check is a real sign-in against Supabase Auth, on a throwaway client
 * with no cookie storage of its own. That matters: verifying through the
 * request's cookie-bound client would rotate the caller's session tokens as a
 * side effect of checking a password, which is a strange thing to do to
 * somebody who is about to be told they typed it wrong.
 */

export type ReauthResult = { ok: true } | { ok: false; message: string };

export async function verifyOwnPassword(userId: string, password: string): Promise<ReauthResult> {
  const typed = password.trim();
  if (!typed) return { ok: false, message: "Enter your password to confirm this." };

  /*
   * The address is read from auth rather than from the profile: the profile
   * copy is a convenience field that can drift, while this is the one the
   * password is actually keyed on. Same reasoning as the sign-in lookup.
   */
  const admin = createServiceClient();
  const { data: user } = await admin.auth.admin.getUserById(userId);
  const email = user.user?.email;
  if (!email) {
    return { ok: false, message: "Your account has no sign-in address to check against." };
  }

  const env = requireSupabaseEnv();
  const throwaway = createSupabaseClient(env.url, env.anonKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });

  const { error } = await throwaway.auth.signInWithPassword({ email, password: typed });
  if (error) return { ok: false, message: "That password is not right." };

  /*
   * Discarded immediately. The sign-in existed to answer one question, and
   * leaving a second live session around for an account that can do anything
   * would be the opposite of the point.
   */
  await throwaway.auth.signOut();

  return { ok: true };
}
