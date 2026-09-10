import { NextResponse, type NextRequest } from "next/server";

import { recordDeviceContact } from "@/lib/devices/ingest";
import { claimCommands } from "@/lib/devices/user-sync";

/**
 * Command poll — the terminal's mailbox.
 *
 * The device calls this every `Delay` seconds (set during the handshake) to
 * ask whether anything is queued for it: enrol this worker, take that
 * fingerprint, delete that PIN. This is the only way to write to an ADMS
 * terminal; there is no call we can make to it.
 *
 * `OK` means nothing to do. Otherwise the reply is one command per line, each
 * prefixed `C:<id>:` so the device can report which one it ran.
 */

export const dynamic = "force-dynamic";

const TEXT_HEADERS = { "content-type": "text/plain; charset=utf-8" };

export async function GET(request: NextRequest) {
  const serialNumber = request.nextUrl.searchParams.get("SN");
  if (!serialNumber) {
    return new NextResponse("Missing SN", { status: 400, headers: TEXT_HEADERS });
  }

  /*
   * The poll doubles as a heartbeat, exactly as the handshake does. A terminal
   * on a quiet night shift may not upload a punch for hours but never stops
   * asking for work, so counting this keeps a healthy device from reading
   * offline until somebody touches it.
   */
  const device = await recordDeviceContact(serialNumber);
  if (!device) {
    console.warn(`[iclock] command poll from unregistered serial ${serialNumber}`);
    return new NextResponse("OK", { status: 200, headers: TEXT_HEADERS });
  }

  const commands = await claimCommands(device.id);

  if (commands.length === 0) {
    return new NextResponse("OK", { status: 200, headers: TEXT_HEADERS });
  }

  console.info(`[iclock] ${serialNumber}: handing over ${commands.length} command(s)`);

  return new NextResponse(commands.join("\n"), { status: 200, headers: TEXT_HEADERS });
}
