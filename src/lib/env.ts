/**
 * Runtime configuration checks.
 *
 * These variables are only needed when a request is served, never at build
 * time — which is why a deployment can build cleanly and then fail on every
 * single request. Rather than let the Supabase client throw an opaque error
 * from inside middleware, the app checks first and says exactly what is
 * missing.
 */

export interface SupabaseEnv {
  url: string;
  anonKey: string;
}

export type EnvCheck =
  | { ok: true; env: SupabaseEnv }
  | { ok: false; missing: string[] };

export function checkSupabaseEnv(): EnvCheck {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  const missing: string[] = [];
  if (!url) missing.push("NEXT_PUBLIC_SUPABASE_URL");
  if (!anonKey) missing.push("NEXT_PUBLIC_SUPABASE_ANON_KEY");

  if (missing.length > 0 || !url || !anonKey) return { ok: false, missing };
  return { ok: true, env: { url, anonKey } };
}

/**
 * For code paths that cannot proceed without configuration.
 *
 * The message names the variables and where to set them, because the person
 * reading it is usually staring at a deployment log, not this file.
 */
export function requireSupabaseEnv(): SupabaseEnv {
  const result = checkSupabaseEnv();
  if (result.ok) return result.env;

  throw new Error(
    `Missing required environment variable(s): ${result.missing.join(", ")}. ` +
      `Set them on the host (Railway → your service → Variables) and redeploy. ` +
      `Values come from Supabase → Project Settings → API.`,
  );
}

/** True when the background terminal poller should run on this instance. */
export function deviceSyncEnabled(): boolean {
  // Off unless explicitly switched on. A cloud instance cannot reach a
  // terminal sitting on the factory LAN, so polling there would fail every
  // minute forever and bury real errors in noise.
  return process.env.DEVICE_SYNC_ENABLED === "true";
}
