/**
 * A clock the browser can subscribe to, for `useSyncExternalStore`.
 *
 * The hook has one rule that a clock breaks by default: `getSnapshot` must
 * return the *same* value until the store actually changes. `() => Date.now()`
 * returns a new number every time it is called, so React sees the store change
 * during the render it just did, renders again, sees it change again — and
 * stops with "Maximum update depth exceeded", taking the whole screen down
 * with it. That is not a subtle performance note; it is a blank page with an
 * error boundary on it, which is exactly what the dashboard was showing.
 *
 * So the value is cached here and only replaced on the tick. Between ticks,
 * `getSnapshot` returns the identical number however often React asks.
 *
 * One timer per store, not one per subscriber. The gate register mounts a row
 * per entry, each of which wants to know the time; five hundred rows meant
 * five hundred intervals.
 */

export interface TickStore {
  /** For `useSyncExternalStore`'s first argument. */
  subscribe: (onChange: () => void) => () => void;
  /** The cached instant, in milliseconds. Zero before the first tick. */
  getSnapshot: () => number;
  /**
   * Always zero.
   *
   * The server has no clock the browser will agree with, so rendering a real
   * time there guarantees a hydration mismatch. Components read zero as "not
   * yet known" and render a placeholder until the first tick replaces it.
   */
  getServerSnapshot: () => number;
}

export function createTickStore(intervalMs: number): TickStore {
  let value = 0;
  let timer: ReturnType<typeof setInterval> | null = null;
  const listeners = new Set<() => void>();

  function tick(): void {
    value = Date.now();
    for (const listener of listeners) listener();
  }

  return {
    subscribe(onChange) {
      listeners.add(onChange);

      if (timer === null) {
        timer = setInterval(tick, intervalMs);
        // Immediately, rather than making the first subscriber wait a whole
        // interval to see a clock — a minute, for the gate.
        tick();
      } else {
        // A later subscriber joins a running timer and would otherwise not
        // hear anything until its next tick, while rendering the placeholder.
        onChange();
      }

      return () => {
        listeners.delete(onChange);
        if (listeners.size === 0 && timer !== null) {
          clearInterval(timer);
          timer = null;
          // Back to "not yet known": the next subscriber gets a fresh reading
          // rather than however stale this one was when the last one left.
          value = 0;
        }
      };
    },
    getSnapshot: () => value,
    getServerSnapshot: () => 0,
  };
}
