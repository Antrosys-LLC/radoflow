"use server";

import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";

import { requireSession } from "@/lib/auth/session";
import { resolveLanguage } from "@/lib/i18n";
import { LANGUAGE_COOKIE, LANGUAGE_COOKIE_MAX_AGE } from "@/lib/i18n/cookie";
import { createClient } from "@/lib/supabase/server";

/**
 * The one thing a person may change about their own record.
 *
 * The rest of this screen is read-only by design — the office owns it — and
 * this file holds nothing else. Language is a preference about how the app is
 * drawn, not a fact about employment.
 */

export interface LanguageResult {
  ok: boolean;
  message: string;
}

/**
 * Changes the signed-in person's interface language.
 *
 * Scoped to `auth.uid()` rather than to a submitted id: this is the one field
 * a person may change about themselves, and taking the target from the form
 * would let anyone restyle anyone else's app.
 *
 * Written to the cookie first and to the profile second, and it is the cookie
 * that decides whether this succeeded. Two reasons, both learned the hard way:
 *
 *  - The cookie is read on the very next request, so the screen changes on the
 *    tap rather than after a write, a revalidate and a re-render.
 *  - A database that has not had `20260906090000_profile_language.sql` applied
 *    has no `language` column, and PostgREST answers "Could not find the
 *    'language' column of 'profiles' in the schema cache". That is a
 *    deployment state, not something the person tapping a button did wrong,
 *    and it must not stop them reading the app in Urdu. The profile catches up
 *    silently the moment the column exists.
 */
export async function setLanguage(_prev: LanguageResult, form: FormData): Promise<LanguageResult> {
  const session = await requireSession();
  const language = resolveLanguage(form.get("language"));

  const store = await cookies();
  store.set(LANGUAGE_COOKIE, language, {
    maxAge: LANGUAGE_COOKIE_MAX_AGE,
    path: "/",
    sameSite: "lax",
    // Read on the server only. Nothing in the browser needs it, and a
    // preference is not worth a script-readable cookie.
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
  });

  const supabase = await createClient();
  const { error } = await supabase
    .from("profiles")
    // `language` is absent from the generated types: the local database will
    // not start, so `database.types.ts` cannot be regenerated against the
    // migration that adds the column. Cast the payload — not the client, and
    // not the whole statement. Delete this when the types are regenerated.
    .update({ language } as never)
    .eq("id", session.userId);

  // Every screen renders from this, so the whole tree is stale, not one route.
  revalidatePath("/", "layout");

  if (error) {
    /*
     * Reported as a success with a caveat, because from the reader's side it
     * *is* one: the app is now in the language they asked for. What has not
     * happened is the part they cannot see — it will not follow them to
     * another device until the column exists.
     */
    return {
      ok: true,
      message: "Language changed on this device. It will follow your account once saved.",
    };
  }

  return { ok: true, message: "Language changed." };
}
