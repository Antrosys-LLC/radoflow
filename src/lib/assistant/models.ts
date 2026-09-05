/**
 * What the Ask assistant may be asked to run, and what running it costs.
 *
 * Pure and dependency-free: no SDK import, no I/O. The effort allowlist is a
 * spend control rather than a convenience — the value it validates arrives
 * from the browser — so it is kept somewhere it can be unit-tested directly.
 */

/**
 * One model, deliberately.
 *
 * A picker offering Sonnet 4.6 alongside this was considered and dropped: 4.6
 * costs $3/$15 per million against Sonnet 5's $2/$10 and is the older model,
 * so every user choosing it would get a worse answer for half again the price.
 * One model also means one prompt-cache namespace; caches are model-scoped, so
 * a picker would have halved the hit rate.
 */
export const ASK_MODEL = "claude-sonnet-5";

export type EffortLevel = "low" | "medium" | "high" | "xhigh" | "max";

export interface EffortOption {
  value: EffortLevel;
  label: string;
  /**
   * What the compact widget's dial renders instead of `label`. Measured, not
   * guessed: on a 360px phone the widget gives five buttons ~56px each, and
   * three of the five full labels (Balanced, Thorough, Maximum) need 64-66px
   * in the real font — they overflow. Every `short` must stay at or under 4
   * characters, which is what the test in models.test.ts pins.
   */
  short: string;
  /** Shown under the label. Empty where the label already says it. */
  hint: string;
}

/** Ordered fastest to most thorough — the order the dial renders in. */
export const EFFORT_LEVELS: readonly EffortOption[] = [
  { value: "low", label: "Fast", short: "Fast", hint: "A quick answer" },
  { value: "medium", label: "Balanced", short: "Mid", hint: "" },
  { value: "high", label: "Thorough", short: "Full", hint: "Default" },
  { value: "xhigh", label: "Deeper", short: "Deep", hint: "For hard questions" },
  { value: "max", label: "Maximum", short: "Max", hint: "Slowest and dearest" },
];

/** The API's own default. Neither the cheapest nor the dearest on purpose. */
export const DEFAULT_EFFORT: EffortLevel = "high";

/**
 * The effort to actually send, given whatever the browser supplied.
 *
 * Anything unrecognised becomes `high`. Forwarding this field unchecked would
 * let anyone holding `assistant.ask` bill the factory at `max` on every
 * question, or send a malformed value that turns every request into a 400.
 */
export function resolveEffort(value: unknown): EffortLevel {
  return EFFORT_LEVELS.some((level) => level.value === value)
    ? (value as EffortLevel)
    : DEFAULT_EFFORT;
}

/**
 * Set 2026-09-05 and maintained by hand.
 *
 * Deliberately not fetched. A live rate per answer adds a network call and a
 * failure mode to a number that moves a few percent a month, and a cached live
 * rate is just a hardcoded one that lies about being current.
 */
export const USD_TO_PKR = 280;

/** Payment tax on the dollar amount billed, applied before conversion. */
export const PAYMENT_TAX_RATE = 0.1;

/**
 * Sonnet 5's published rates, US dollars per million tokens.
 *
 * Four buckets rather than one, because cached tokens genuinely do not cost
 * what fresh ones do — and this assistant's system prompt is large and stable,
 * which is exactly the shape that caches.
 */
const USD_PER_MILLION = {
  input: 2.0,
  output: 10.0,
  cacheRead: 0.2,
  cacheWrite: 2.5,
} as const;

export interface UsageTotals {
  /** Uncached input tokens. Already excludes the two cache buckets. */
  input: number;
  output: number;
  cacheRead: number;
  cacheWrite: number;
}

/** What one answer cost, in whole rupees. */
export function costInPkr(usage: UsageTotals): number {
  const usd =
    (usage.input * USD_PER_MILLION.input +
      usage.output * USD_PER_MILLION.output +
      usage.cacheRead * USD_PER_MILLION.cacheRead +
      usage.cacheWrite * USD_PER_MILLION.cacheWrite) /
    1_000_000;

  /*
   * Tax first, then conversion. Both are flat multipliers so the arithmetic is
   * the same either way, but this order says what the number means: what the
   * factory is billed in dollars, and then what that costs in rupees.
   */
  return Math.round(usd * (1 + PAYMENT_TAX_RATE) * USD_TO_PKR);
}
