import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { createTickStore } from "./tick";

describe("createTickStore", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-09-09T05:00:00Z"));
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("returns the same value until the next tick", () => {
    // The whole reason this module exists. A getSnapshot that returns a new
    // number every call sends useSyncExternalStore into an infinite render
    // loop, which takes the screen down with an error boundary.
    const store = createTickStore(1000);
    store.subscribe(() => {});

    const first = store.getSnapshot();
    vi.advanceTimersByTime(400);
    expect(store.getSnapshot()).toBe(first);

    vi.advanceTimersByTime(600);
    expect(store.getSnapshot()).toBeGreaterThan(first);
  });

  it("is zero before anything has subscribed", () => {
    // Matching the server snapshot, so the first paint agrees with the markup
    // the server sent and hydration has nothing to complain about.
    const store = createTickStore(1000);
    expect(store.getSnapshot()).toBe(0);
    expect(store.getServerSnapshot()).toBe(0);
  });

  it("does not make the first subscriber wait an interval", () => {
    const store = createTickStore(60_000);
    store.subscribe(() => {});
    expect(store.getSnapshot()).toBe(Date.now());
  });

  it("runs one timer however many subscribers there are", () => {
    // The gate register mounts a row per entry; a timer each is five hundred
    // timers for one clock.
    const spy = vi.spyOn(globalThis, "setInterval");
    const store = createTickStore(1000);

    const unsubscribes = [
      store.subscribe(() => {}),
      store.subscribe(() => {}),
      store.subscribe(() => {}),
    ];
    expect(spy).toHaveBeenCalledTimes(1);

    for (const off of unsubscribes) off();
    spy.mockRestore();
  });

  it("tells a late subscriber the time it already knows", () => {
    const store = createTickStore(60_000);
    store.subscribe(() => {});

    let told = 0;
    store.subscribe(() => {
      told += 1;
    });
    expect(told).toBe(1);
  });

  it("notifies every subscriber on a tick", () => {
    const store = createTickStore(1000);
    let a = 0;
    let b = 0;
    store.subscribe(() => {
      a += 1;
    });
    store.subscribe(() => {
      b += 1;
    });

    const before = { a, b };
    vi.advanceTimersByTime(1000);
    expect(a).toBe(before.a + 1);
    expect(b).toBe(before.b + 1);
  });

  it("stops the timer when the last subscriber leaves", () => {
    const store = createTickStore(1000);
    const off = store.subscribe(() => {});
    off();

    expect(store.getSnapshot()).toBe(0);
    expect(vi.getTimerCount()).toBe(0);
  });
});
