"use client";

import { useEffect, useState } from "react";

import { PAKISTAN_LOCALE, PAKISTAN_TIMEZONE } from "@/lib/time";

/**
 * Wall clock in Pakistan Standard Time.
 *
 * Pinned to Asia/Karachi rather than the browser's zone: a manager checking in
 * from anywhere must read the same time the factory floor is working to.
 */
export function LiveClock() {
  const [now, setNow] = useState<Date | null>(null);

  useEffect(() => {
    // Deliberate: the first value can only come from the browser, so rendering
    // it during SSR would guarantee a hydration mismatch.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setNow(new Date());
    const timer = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  return (
    <div className="hidden rounded-2xl bg-secondary px-4 py-2 text-right md:block">
      <p className="text-sm font-semibold tabular-nums text-foreground">
        {now
          ? new Intl.DateTimeFormat(PAKISTAN_LOCALE, {
              timeZone: PAKISTAN_TIMEZONE,
              hour: "2-digit",
              minute: "2-digit",
              second: "2-digit",
              hour12: true,
            }).format(now)
          : "--:--:--"}
      </p>
      <p className="text-[11px] text-muted-foreground">
        {now
          ? new Intl.DateTimeFormat(PAKISTAN_LOCALE, {
              timeZone: PAKISTAN_TIMEZONE,
              weekday: "short",
              day: "numeric",
              month: "short",
            }).format(now)
          : " "}{" "}
        PKT
      </p>
    </div>
  );
}
