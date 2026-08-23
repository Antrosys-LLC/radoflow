/**
 * Server start-up hook.
 *
 * Next calls this once per server process. The terminal poller is started here
 * rather than from a route so it runs whether or not anyone has the app open —
 * attendance must keep arriving overnight with no browser involved.
 */
export async function register() {
  // Only the Node runtime can open TCP sockets to a terminal; the edge runtime
  // would throw on `node:net`.
  if (process.env.NEXT_RUNTIME !== "nodejs") return;

  // Without credentials there is nothing to sync into, and importing the
  // service client would throw on a bare checkout.
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
    console.info("[sync] SUPABASE_SERVICE_ROLE_KEY not set — terminal polling disabled");
    return;
  }

  /*
   * Opt-in, not automatic.
   *
   * The terminals live on the factory LAN at 192.168.x.x, which a cloud host
   * cannot route to. Polling from there fails on every device every minute
   * forever, burying genuine faults in noise. Enable this only on a machine
   * that shares the network with the terminals.
   */
  const { deviceSyncEnabled } = await import("@/lib/env");
  if (!deviceSyncEnabled()) {
    console.info(
      "[sync] terminal polling disabled (set DEVICE_SYNC_ENABLED=true on a host that can reach the terminals)",
    );
    return;
  }

  const { startSyncWorker } = await import("@/lib/devices/sync-worker");
  startSyncWorker();
}
