import { createClient as createSupabaseClient } from "@supabase/supabase-js";

import type { Database } from "./database.types";

/**
 * Service-role client. Bypasses RLS entirely.
 *
 * Only two callers are legitimate: the biometric ingestion endpoint (which
 * authenticates a *device*, not a person, so there is no user to scope to) and
 * the payroll calculation job. Never import this into anything that renders,
 * and never expose the key to the browser — it is deliberately read from a
 * non-`NEXT_PUBLIC_` variable so a client bundle cannot pick it up.
 */
export function createServiceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !serviceKey) {
    throw new Error(
      "SUPABASE_SERVICE_ROLE_KEY and NEXT_PUBLIC_SUPABASE_URL must be set for service-role access",
    );
  }

  return createSupabaseClient<Database>(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
