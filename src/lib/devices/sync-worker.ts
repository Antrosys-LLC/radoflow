import { ingestPunches, recordsToPunches } from "./ingest";
import { withDevice, ZktecoError } from "./zkteco/client";
import { createServiceClient } from "@/lib/supabase/service";

/**
 * Background poller for the biometric terminals.
 *
 * Push mode delivers punches as they happen, but only while the terminal
 * chooses to talk to us. Polling on a timer recovers anything missed while a
 * device was off the network and gives a definite "last successful sync" to
 * show, rather than an absence of news that looks identical to silence.
 *
 * Requires a long-lived Node process — it holds a timer and opens raw TCP
 * sockets, so it does nothing on a serverless deployment.
 */

const TICK_MS = 60_000;
/** After this many consecutive failures a device is polled less often. */
const BACKOFF_AFTER = 3;
const BACKOFF_MULTIPLIER = 5;

let timer: NodeJS.Timeout | null = null;
/** Guards against a slow sync overlapping the next tick. */
let running = false;

export function startSyncWorker(): void {
  if (timer) return;

  console.info(`[sync] terminal polling every ${TICK_MS / 1000}s`);
  timer = setInterval(() => {
    void tick();
  }, TICK_MS);

  // Don't hold the process open on shutdown.
  timer.unref?.();
}

export function stopSyncWorker(): void {
  if (timer) clearInterval(timer);
  timer = null;
}

export async function tick(): Promise<void> {
  if (running) {
    console.warn("[sync] previous run still in progress, skipping this tick");
    return;
  }
  running = true;

  try {
    const supabase = createServiceClient();

    const { data: devices, error } = await supabase
      .from("devices")
      .select(
        "id, name, serial_number, ip_address, port, comm_key, auto_sync, sync_interval_seconds, last_sync_at, consecutive_failures",
      )
      .eq("is_active", true)
      .eq("auto_sync", true);

    if (error) {
      console.error("[sync] could not list devices:", error.message);
      return;
    }

    for (const device of devices ?? []) {
      if (!device.ip_address || !device.serial_number) continue;
      if (!isDue(device)) continue;
      await syncOne(device);
    }
  } catch (error) {
    // Never let a worker error take the server down.
    console.error("[sync] tick failed:", error);
  } finally {
    running = false;
  }
}

interface DeviceRow {
  id: string;
  name: string;
  serial_number: string | null;
  ip_address: unknown;
  port: number;
  comm_key: string | null;
  sync_interval_seconds: number;
  last_sync_at: string | null;
  consecutive_failures: number;
}

/**
 * A terminal that has been failing is polled progressively less often.
 *
 * Without this, a device switched off for the night produces a failed TCP
 * connection every minute all night, filling the log with noise that hides
 * real problems.
 */
function isDue(device: DeviceRow): boolean {
  if (!device.last_sync_at) return true;

  const base = device.sync_interval_seconds * 1000;
  const interval = device.consecutive_failures >= BACKOFF_AFTER ? base * BACKOFF_MULTIPLIER : base;

  /*
   * The tolerance is not cosmetic. last_sync_at is stamped when a sync
   * *finishes*, but ticks fire on a fixed period, so the gap measured at the
   * next tick is always a little under the interval. A strict `>=` therefore
   * skips every other tick and a device configured for 60s would really poll
   * every 120s. Half a tick of slack keeps the requested cadence.
   */
  const tolerance = TICK_MS / 2;

  return Date.now() - new Date(device.last_sync_at).getTime() >= interval - tolerance;
}

async function syncOne(device: DeviceRow): Promise<void> {
  const supabase = createServiceClient();

  try {
    const records = await withDevice(
      {
        host: String(device.ip_address),
        port: device.port,
        commKey: device.comm_key ? Number(device.comm_key) : 0,
        timeoutMs: 20_000,
      },
      (client) => client.getAttendance(),
    );

    const result = await ingestPunches(device.serial_number!, recordsToPunches(records));

    await supabase
      .from("devices")
      .update({
        status: "online",
        last_seen_at: new Date().toISOString(),
        last_sync_at: new Date().toISOString(),
        last_sync_count: result.accepted,
        consecutive_failures: 0,
        last_error: null,
      })
      .eq("id", device.id);

    if (result.accepted > 0) {
      console.info(`[sync] ${device.name}: ${result.accepted} new punch(es)`);
    }
  } catch (error) {
    const message = error instanceof ZktecoError ? error.message : String(error);
    const failures = device.consecutive_failures + 1;

    await supabase
      .from("devices")
      .update({
        status: "offline",
        last_error: message,
        last_sync_at: new Date().toISOString(),
        consecutive_failures: failures,
      })
      .eq("id", device.id);

    // Only shout the first few times; after that the backoff has kicked in and
    // repeating the same message adds nothing.
    if (failures <= BACKOFF_AFTER) {
      console.warn(`[sync] ${device.name} unreachable: ${message}`);
    }
  }
}
