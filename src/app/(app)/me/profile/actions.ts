"use server";

import { revalidatePath } from "next/cache";

import { requireSession } from "@/lib/auth/session";
import { resolveLanguage } from "@/lib/i18n";
import { createClient } from "@/lib/supabase/server";

/**
 * The one thing a person may change about their own record.
 *
 * The rest of this profile is read-only by design — the office owns it — and
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
 */
export async function setLanguage(_prev: LanguageResult, form: FormData): Promise<LanguageResult> {
  const session = await requireSession();
  const language = resolveLanguage(form.get("language"));

  const supabase = await createClient();
  const { error } = await supabase
    .from("profiles")
    // `language` is absent from the generated types: the local database will
    // not start, so `database.types.ts` cannot be regenerated against the
    // migration that adds the column. Cast the payload — not the client, and
    // not the whole statement — the same way `session.ts` casts the name of
    // `session_bootstrap()` for the same reason. Delete both when the types
    // are regenerated.
    .update({ language } as never)
    .eq("id", session.userId);

  if (error) return { ok: false, message: error.message };

  // Every screen renders from this, so the whole tree is stale, not one route.
  revalidatePath("/", "layout");
  return { ok: true, message: "Language changed." };
}
