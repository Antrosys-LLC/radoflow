import { NextResponse } from "next/server";

import { checkSupabaseEnv, deviceSyncEnabled } from "@/lib/env";

/**
 * Deployment health and configuration check.
 *
 * Reachable without a session and before configuration is complete — it is the
 * one endpoint that must still answer when everything else is returning 503,
 * because it is what tells you why.
 *
 * Reports only whether each variable is present, never its value.
 */

export const dynamic = "force-dynamic";

export async function GET() {
  const config = checkSupabaseEnv();

  const checks = {
    supabaseUrl: Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL),
    supabaseAnonKey: Boolean(process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY),
    serviceRoleKey: Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY),
    deviceIngestSecret: Boolean(process.env.DEVICE_INGEST_SECRET),
    deviceSyncWorker: deviceSyncEnabled(),
  };

  if (!config.ok) {
    return NextResponse.json(
      {
        status: "misconfigured",
        missing: config.missing,
        checks,
        hint: "Set the missing variables on the host and redeploy. Values: Supabase → Project Settings → API.",
      },
      { status: 503 },
    );
  }

  // Confirm the database is actually reachable, not merely configured — a
  // wrong URL or a paused project passes the variable check and still fails
  // every request.
  let database: "reachable" | "unreachable" = "unreachable";
  let databaseError: string | null = null;

  try {
    const response = await fetch(`${config.env.url}/auth/v1/health`, {
      headers: { apikey: config.env.anonKey },
      signal: AbortSignal.timeout(5000),
      cache: "no-store",
    });
    if (response.ok) database = "reachable";
    else databaseError = `Supabase replied ${response.status}`;
  } catch (error) {
    databaseError = error instanceof Error ? error.message : String(error);
  }

  const healthy = database === "reachable";

  return NextResponse.json(
    {
      status: healthy ? "ok" : "degraded",
      database,
      ...(databaseError ? { databaseError } : {}),
      checks,
    },
    { status: healthy ? 200 : 503 },
  );
}
