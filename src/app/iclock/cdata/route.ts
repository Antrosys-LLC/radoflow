import { NextResponse, type NextRequest } from "next/server";

import { ingestPunches } from "@/lib/devices/ingest";
import { ackResponse, buildHandshakeResponse, parseAttlog } from "@/lib/devices/zkteco/iclock";

/**
 * ADMS endpoint the ZKTeco terminal talks to in push mode.
 *
 * Point the device at this host in Menu → Comm → Ethernet/Cloud Server. The
 * firmware appends `/iclock/cdata` itself, so configure only host and port.
 *
 * The protocol has no real authentication — the terminal identifies itself
 * with a serial number in the query string and nothing more. Two mitigations
 * are applied here: the serial must already exist in the devices table, and an
 * optional shared secret can be required. Neither is a substitute for keeping
 * the terminals on an isolated VLAN.
 */

export const dynamic = "force-dynamic";

// Terminals send latin-1 text, not JSON, and expect a bare-text reply.
const TEXT_HEADERS = { "content-type": "text/plain; charset=utf-8" };

function unauthorised() {
  return new NextResponse("Unauthorized", { status: 401, headers: TEXT_HEADERS });
}

/** Constant-time-ish comparison to avoid leaking the secret via timing. */
function secretMatches(provided: string | null): boolean {
  const expected = process.env.DEVICE_INGEST_SECRET;
  if (!expected) return true; // not configured — rely on network isolation
  if (!provided || provided.length !== expected.length) return false;

  let diff = 0;
  for (let i = 0; i < expected.length; i++) {
    diff |= expected.charCodeAt(i) ^ provided.charCodeAt(i);
  }
  return diff === 0;
}

function readSecret(request: NextRequest): string | null {
  return (
    request.headers.get("x-device-secret") ??
    request.nextUrl.searchParams.get("secret")
  );
}

/**
 * Handshake. The terminal calls this on boot to collect its upload settings,
 * then keeps calling it to prove it is alive.
 */
export async function GET(request: NextRequest) {
  const serialNumber = request.nextUrl.searchParams.get("SN");
  if (!serialNumber) {
    return new NextResponse("Missing SN", { status: 400, headers: TEXT_HEADERS });
  }
  if (!secretMatches(readSecret(request))) return unauthorised();

  return new NextResponse(buildHandshakeResponse({ serialNumber }), {
    status: 200,
    headers: TEXT_HEADERS,
  });
}

/** Attendance upload. */
export async function POST(request: NextRequest) {
  const serialNumber = request.nextUrl.searchParams.get("SN");
  if (!serialNumber) {
    return new NextResponse("Missing SN", { status: 400, headers: TEXT_HEADERS });
  }
  if (!secretMatches(readSecret(request))) return unauthorised();

  const table = request.nextUrl.searchParams.get("table") ?? "ATTLOG";
  const body = await request.text();

  // OPERLOG (door/menu events) and ATTPHOTO are acknowledged but not stored;
  // replying with anything else makes the terminal retry the batch forever.
  if (table !== "ATTLOG") {
    return new NextResponse(ackResponse(0), { status: 200, headers: TEXT_HEADERS });
  }

  const { punches, skipped } = parseAttlog(body);

  try {
    const result = await ingestPunches(serialNumber, punches);

    if (result.unmapped.length > 0) {
      // Not an error: a worker enrolled on the terminal but not yet created in
      // RadoFlow. The punch is still stored, just not attributed to anyone.
      console.warn(
        `[iclock] ${serialNumber}: ${result.unmapped.length} unmapped enrolment id(s): ${result.unmapped.join(", ")}`,
      );
    }
    if (skipped > 0) {
      console.warn(`[iclock] ${serialNumber}: skipped ${skipped} malformed line(s)`);
    }

    return new NextResponse(ackResponse(result.accepted), {
      status: 200,
      headers: TEXT_HEADERS,
    });
  } catch (error) {
    console.error(`[iclock] ingestion failed for ${serialNumber}`, error);
    // A non-OK reply makes the terminal keep the batch and retry, so no punches
    // are lost while the server is unhealthy.
    return new NextResponse("ERROR", { status: 500, headers: TEXT_HEADERS });
  }
}
