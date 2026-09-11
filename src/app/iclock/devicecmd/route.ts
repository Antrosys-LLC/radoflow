import { NextResponse, type NextRequest } from "next/server";

import { recordDeviceContact } from "@/lib/devices/ingest";
import { recordCommandResults } from "@/lib/devices/user-sync";
import { parseCommandResult } from "@/lib/devices/zkteco/userinfo";

/**
 * Command result callback.
 *
 * The terminal posts the outcome of each instruction it collected as
 * `ID=<id>&Return=<code>&CMD=<command>`, one per line. `Return=0` is success.
 *
 * This is the only evidence that a worker's fingerprint actually reached a
 * terminal. Without it the queue would show everything as delivered the moment
 * it was handed over, which is a different claim: a terminal that rejects a
 * template — out of memory is the usual reason — accepts the command, runs it,
 * and reports the failure here.
 */

export const dynamic = "force-dynamic";

const TEXT_HEADERS = { "content-type": "text/plain; charset=utf-8" };

export async function POST(request: NextRequest) {
  const serialNumber = request.nextUrl.searchParams.get("SN");
  const body = await request.text();

  if (!serialNumber) {
    return new NextResponse("Missing SN", { status: 400, headers: TEXT_HEADERS });
  }

  const device = await recordDeviceContact(serialNumber);
  if (!device) {
    console.warn(`[iclock] command result from unregistered serial ${serialNumber}`);
    return new NextResponse("OK", { status: 200, headers: TEXT_HEADERS });
  }

  const results = parseCommandResult(body);

  if (results.length > 0) {
    await recordCommandResults(device.id, results);

    const failed = results.filter((result) => result.returnCode !== 0);
    if (failed.length > 0) {
      console.warn(
        `[iclock] ${serialNumber}: ${failed.length} command(s) failed: ` +
          failed.map((f) => `#${f.id}→${f.returnCode}`).join(", "),
      );
    }
  }

  /*
   * Always `OK`, even when the terminal reported a failure.
   *
   * The reply acknowledges receipt of the report, not the success of the work.
   * Anything else makes the device re-send the same report forever, and the
   * failure is already recorded where somebody can see it.
   */
  return new NextResponse("OK", { status: 200, headers: TEXT_HEADERS });
}
