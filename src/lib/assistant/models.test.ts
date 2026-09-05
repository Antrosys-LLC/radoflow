import { describe, expect, it } from "vitest";

import {
  ASK_MODEL,
  costInPkr,
  DEFAULT_EFFORT,
  EFFORT_LEVELS,
  resolveEffort,
  type EffortLevel,
} from "./models";

describe("the effort ladder", () => {
  it("is the five levels Sonnet 5 accepts, fastest first", () => {
    expect(EFFORT_LEVELS.map((level) => level.value)).toEqual([
      "low",
      "medium",
      "high",
      "xhigh",
      "max",
    ]);
  });

  it("names one model and it is Sonnet 5", () => {
    expect(ASK_MODEL).toBe("claude-sonnet-5");
  });

  it("defaults to the API's own default rather than the cheapest or dearest", () => {
    expect(DEFAULT_EFFORT).toBe("high");
  });

  it("gives every level a label a factory office can read", () => {
    for (const level of EFFORT_LEVELS) {
      expect(level.label.length).toBeGreaterThan(0);
    }
  });

  /*
   * The compact widget gives five dial buttons ~56px each on a 360px phone;
   * measuring the real labels in the real font showed three of five need
   * 64-66px and overflow. `short` is the fix, and this is the constraint the
   * layout depends on — without it, the next added level silently reintroduces
   * the overflow.
   */
  it("gives every level a short form that fits the compact dial", () => {
    for (const level of EFFORT_LEVELS) {
      expect(level.short.length).toBeGreaterThan(0);
      expect(level.short.length).toBeLessThanOrEqual(4);
    }
  });
});

describe("resolveEffort", () => {
  it("accepts every level on the ladder", () => {
    for (const level of EFFORT_LEVELS) {
      expect(resolveEffort(level.value)).toBe(level.value);
    }
  });

  /*
   * The effort arrives from the browser. These are the cases that decide
   * whether someone can bill the factory at `max` on every question, so each
   * near-miss is pinned rather than trusting one catch-all.
   */
  it.each([
    ["MAX", "upper case"],
    ["maximum", "a plausible synonym"],
    ["", "empty string"],
    ["highest", "a near miss"],
  ])("falls back to high for %s (%s)", (value) => {
    expect(resolveEffort(value)).toBe("high");
  });

  it.each([[null], [undefined], [5], [{}], [["max"]]])(
    "falls back to high for non-string %s",
    (value) => {
      expect(resolveEffort(value)).toBe("high");
    },
  );
});

describe("costInPkr", () => {
  const empty = { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 };

  it("charges nothing for nothing", () => {
    expect(costInPkr(empty)).toBe(0);
  });

  /*
   * The worked example this was specified against: five dollars of usage costs
   * 5 x 1.10 tax x 280 = Rs 1,540. Output bills at $10/M, so half a million
   * output tokens is exactly $5.
   */
  it("turns five dollars of usage into Rs 1,540", () => {
    expect(costInPkr({ ...empty, output: 500_000 })).toBe(1540);
  });

  it("bills input at a fifth of output", () => {
    // 500k input at $2/M is $1; $1 x 1.10 x 280 = Rs 308.
    expect(costInPkr({ ...empty, input: 500_000 })).toBe(308);
  });

  /*
   * The case the four separate buckets exist for. A cached system prompt reads
   * at a tenth of the input rate; billing it as fresh input would report this
   * answer as Rs 64 instead of Rs 8 — an eightfold overstatement on exactly
   * the shape of request this assistant makes most often.
   */
  it("bills a cache read at a tenth of fresh input", () => {
    const cacheHeavy = { input: 1_000, output: 500, cacheRead: 100_000, cacheWrite: 0 };
    expect(costInPkr(cacheHeavy)).toBe(8);

    const asIfUncached = { input: 101_000, output: 500, cacheRead: 0, cacheWrite: 0 };
    expect(costInPkr(asIfUncached)).toBe(64);
  });

  it("bills a cache write above fresh input", () => {
    // 1M cache-write at $2.50 is $2.50; x 1.10 x 280 = Rs 770.
    expect(costInPkr({ ...empty, cacheWrite: 1_000_000 })).toBe(770);
  });

  it("returns whole rupees", () => {
    const cost = costInPkr({ input: 137, output: 41, cacheRead: 9, cacheWrite: 3 });
    expect(Number.isInteger(cost)).toBe(true);
  });

  it("adds the payment tax rather than quoting the bare exchange rate", () => {
    // Without the 10% this would be Rs 280, which is the bug to catch.
    expect(costInPkr({ ...empty, output: 100_000 })).toBe(308);
  });
});
