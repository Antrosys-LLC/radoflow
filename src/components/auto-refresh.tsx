"use client";

import { useEffect, useRef, useTransition } from "react";
import { useRouter } from "next/navigation";

/**
 * Re-renders the server components on this page at an interval.
 *
 * Attendance screens are server-rendered, so a punch that reached the database
 * seconds ago stays invisible until someone navigates or reloads. A supervisor
 * watching the floor should not have to press anything to see who just scanned.
 *
 * `router.refresh()` rather than a client-side fetch: the page keeps its single
 * data path, permissions and RLS are re-evaluated on the server every time, and
 * React reconciles the result without losing scroll position or form state.
 *
 * Polling is deliberate. Supabase Realtime would make this instant instead of
 * within `seconds`, and this component is the seam to swap it in — but it needs
 * replication enabled per table, and a timer is honest about its cost.
 */
/**
 * How often an attendance screen re-reads the server, in seconds.
 *
 * Deliberately the same number as the terminal polling interval in
 * `src/lib/devices/sync-worker.ts`. Punches land in the database on that
 * cadence, so refreshing faster only re-renders identical data, and refreshing
 * slower adds staleness on top of staleness. Change both together.
 */
export const ATTENDANCE_REFRESH_SECONDS = 30;

export function AutoRefresh({ seconds = ATTENDANCE_REFRESH_SECONDS }: { seconds?: number }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  /*
   * The timer callback must see whether a refresh is still running, but it is
   * installed once and would otherwise close over `pending` as it was on the
   * first render. A ref is read at fire time, so the interval does not have to
   * be torn down and rebuilt on every state change to stay correct.
   *
   * Mirrored in an effect rather than assigned during render: writing to a ref
   * while rendering is a side effect, and under a concurrent re-render React
   * may discard the pass that wrote it.
   */
  const busy = useRef(false);

  useEffect(() => {
    busy.current = pending;
  }, [pending]);

  useEffect(() => {
    /*
     * A hidden tab is not being read, and browsers throttle its timers
     * unpredictably anyway. Left running, every forgotten tab in the office
     * would keep asking the server to re-render a page nobody is looking at.
     */
    const tick = () => {
      if (document.visibilityState !== "visible") return;

      /*
       * Never start a refresh while the last one is still in flight.
       *
       * These pages are dynamic and can take longer to render than the gap
       * between ticks — badly so when the network is slow, which is exactly
       * when this matters. Firing regardless queues refreshes faster than the
       * server retires them, and the screen gets progressively less responsive
       * the longer it is left open. Skipping is the right answer: the next
       * tick will pick up everything the skipped one would have.
       */
      if (busy.current) return;

      startTransition(() => {
        router.refresh();
      });
    };

    const timer = setInterval(tick, Math.max(5, seconds) * 1000);

    // Coming back to the tab should show the floor as it is now, not as it was
    // when the tab was last visible.
    document.addEventListener("visibilitychange", tick);

    return () => {
      clearInterval(timer);
      document.removeEventListener("visibilitychange", tick);
    };
  }, [router, seconds]);

  return null;
}
