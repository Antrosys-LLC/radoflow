import { NextResponse, type NextRequest } from "next/server";

import { ingestPunches } from "@/lib/devices/ingest";
import { isDeviceTimestamp } from "@/lib/devices/zkteco/iclock";
import { directionFromState } from "@/lib/devices/zkteco/protocol";

/**
 * JSON ingestion endpoint for the on-site agent.
 *
 * The terminals sit on the factory LAN, so a public deployment cannot reach
 * them. A small agent inside the factory polls them over the network and posts
 * here instead — outbound HTTPS only, no inbound firewall rule, and no
 * dependence on whether the terminal's firmware speaks TLS.
 *
 * Authenticated by the shared DEVICE_INGEST_SECRET, not a user session: the
 * caller is a machine. Ingestion is idempotent, so an agent that retries after
 * a dropped connection cannot double-count anyone's hours.
 */

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

interface AgentPunch {
  deviceUserId?: unknown;
  localTimestamp?: unknown;
  state?: unknown;
  verifyMode?: unknown;
}

function secretMatches(provided: string | null): boolean {
  const expected = process.env.DEVICE_INGEST_SECRET;
  // Refuse rather than run open: an unset secret on a public domain would let
  // anyone write attendance, which feeds straight into payroll.
  if (!expected) return false;
  if (!provided || provided.length !== expected.length) return false;

  let diff = 0;
  for (let i = 0; i < expected.length; i++) {
    diff |= expected.charCodeAt(i) ^ provided.charCodeAt(i);
  }
  return diff === 0;
}

export async function POST(request: NextRequest) {
  if (!process.env.DEVICE_INGEST_SECRET) {
    return NextResponse.json(
      { error: "DEVICE_INGEST_SECRET is not configured on the server." },
      { status: 503 },
    );
  }

  if (!secretMatches(request.headers.get("x-device-secret"))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: { serialNumber?: unknown; punches?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Body must be JSON." }, { status: 400 });
  }

  const serialNumber = typeof body.serialNumber === "string" ? body.serialNumber.trim() : "";
  if (!serialNumber) {
    return NextResponse.json({ error: "serialNumber is required." }, { status: 400 });
  }

  if (!Array.isArray(body.punches)) {
    return NextResponse.json({ error: "punches must be an array." }, { status: 400 });
  }

  // Validate before touching the database — a malformed timestamp would
  // otherwise land as an unparseable punch that silently never counts.
  const punches = [];
  let rejected = 0;

  for (const raw of body.punches as AgentPunch[]) {
    const deviceUserId = typeof raw?.deviceUserId === "string" ? raw.deviceUserId.trim() : "";
    const localTimestamp =
      typeof raw?.localTimestamp === "string" ? raw.localTimestamp.trim() : "";

    if (!deviceUserId || !isDeviceTimestamp(localTimestamp)) {
      rejected += 1;
      continue;
    }

    const state = Number.isFinite(Number(raw.state)) ? Number(raw.state) : 0;

    punches.push({
      deviceUserId,
      localTimestamp,
      state,
      verifyMode: Number.isFinite(Number(raw.verifyMode)) ? Number(raw.verifyMode) : 0,
      workCode: null,
      direction: directionFromState(state),
    });
  }

  try {
    const result = await ingestPunches(serialNumber, punches);

    return NextResponse.json({
      accepted: result.accepted,
      duplicates: result.duplicates,
      rejected,
      unmapped: result.unmapped,
      recomputedDays: result.recomputedDays,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`[agent-ingest] ${serialNumber}: ${message}`);
    // 5xx so the agent retries and keeps its punches rather than dropping them.
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
