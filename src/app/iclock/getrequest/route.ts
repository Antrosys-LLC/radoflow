import { NextResponse, type NextRequest } from "next/server";

/**
 * Command poll.
 *
 * The terminal calls this on the interval set during the handshake to ask
 * whether anything is queued for it — enrolling a new worker, deleting one,
 * or a reboot. Replying `OK` means "nothing to do".
 *
 * Commands are not yet queued from the UI; when that lands, this reads pending
 * rows and returns them one per line as `C:<id>:<COMMAND>`.
 */

export const dynamic = "force-dynamic";

const TEXT_HEADERS = { "content-type": "text/plain; charset=utf-8" };

export async function GET(request: NextRequest) {
  const serialNumber = request.nextUrl.searchParams.get("SN");
  if (!serialNumber) {
    return new NextResponse("Missing SN", { status: 400, headers: TEXT_HEADERS });
  }

  return new NextResponse("OK", { status: 200, headers: TEXT_HEADERS });
}
