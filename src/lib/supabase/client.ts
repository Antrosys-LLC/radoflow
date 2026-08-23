"use client";

import { createBrowserClient } from "@supabase/ssr";

import type { Database } from "./database.types";

/**
 * Browser-side Supabase client.
 *
 * Only ever carries the anon key, so every query it makes is still filtered by
 * the RLS policies for the signed-in user.
 */
export function createClient() {
  // These are inlined at build time. If the build ran without them set they
  // are undefined in the bundle regardless of what the server has at runtime —
  // which is why a Railway *build* must also receive the NEXT_PUBLIC_ values,
  // not just the running container.
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !anonKey) {
    throw new Error(
      "Supabase is not configured in this build. NEXT_PUBLIC_SUPABASE_URL and " +
        "NEXT_PUBLIC_SUPABASE_ANON_KEY must be present at build time, not only at runtime.",
    );
  }

  return createBrowserClient<Database>(url, anonKey);
}
