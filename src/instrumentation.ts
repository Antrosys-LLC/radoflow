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

  const { startSyncWorker } = await import("@/lib/devices/sync-worker");
  startSyncWorker();
}
