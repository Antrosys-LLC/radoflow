import { NextResponse, type NextRequest } from "next/server";

/**
 * Command result callback.
 *
 * The terminal posts back the outcome of each queued command as
 * `ID=<id>&Return=<code>&CMD=<command>`. Return 0 means success.
 */

export const dynamic = "force-dynamic";

const TEXT_HEADERS = { "content-type": "text/plain; charset=utf-8" };

export async function POST(request: NextRequest) {
  const serialNumber = request.nextUrl.searchParams.get("SN");
  const body = await request.text();

  // Logged rather than stored until command queueing is built, so failures on
  // the terminal are still visible while that lands.
  if (body.trim()) {
    console.info(`[iclock] ${serialNumber ?? "unknown"} command result: ${body.trim()}`);
  }

  return new NextResponse("OK", { status: 200, headers: TEXT_HEADERS });
}
