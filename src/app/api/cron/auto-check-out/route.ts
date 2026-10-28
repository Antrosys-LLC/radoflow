import { NextResponse, type NextRequest } from "next/server";

import { autoCheckOutOverdue } from "@/lib/attendance/auto-check-out-run";

/**
 * Checks out everybody whose duty (or duty plus overtime) is over and who never
 * scanned out. Called every fifteen minutes by pg_cron in Supabase
 * (`supabase/APPLY-2026-10-28.sql`).
 *
 * Authenticated by CRON_SECRET, not a user session: the caller is a scheduler.
 * Safe to call as often as you like — a person already checked out is not open,
 * so a second run finds nothing to do.
 */

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function secretMatches(provided: string | null): boolean {
  const expected = process.env["CRON_SECRET"];
  // Refuse rather than run open: this writes attendance, which feeds payroll.
  if (!expected) return false;
  if (!provided || provided.length !== expected.length) return false;

  let diff = 0;
  for (let i = 0; i < expected.length; i++) {
    diff |= expected.charCodeAt(i) ^ provided.charCodeAt(i);
  }
  return diff === 0;
}

async function run(request: NextRequest) {
  if (!process.env["CRON_SECRET"]) {
    return NextResponse.json({ error: "CRON_SECRET is not configured on the server." }, { status: 503 });
  }
  if (!secretMatches(request.headers.get("x-cron-secret"))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const result = await autoCheckOutOverdue();
    return NextResponse.json({
      considered: result.considered,
      closed: result.closed.length,
      heldByOffice: result.heldByOffice,
      people: result.closed.map((c) => ({ name: c.name, workDate: c.workDate, checkedOutAt: c.checkedOutAt })),
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Auto check-out failed." },
      { status: 500 },
    );
  }
}

export const GET = run;
export const POST = run;
