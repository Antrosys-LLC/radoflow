"use client";

import { useEffect } from "react";
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
export function AutoRefresh({ seconds = 15 }: { seconds?: number }) {
  const router = useRouter();

  useEffect(() => {
    /*
     * A hidden tab is not being read, and browsers throttle its timers
     * unpredictably anyway. Left running, every forgotten tab in the office
     * would keep asking the server to re-render a page nobody is looking at.
     */
    const tick = () => {
      if (document.visibilityState === "visible") router.refresh();
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
