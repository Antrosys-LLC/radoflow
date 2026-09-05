# Ask Effort Dial and Cost Readout Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give the Ask assistant a faster↔smarter effort dial and show what each answer cost, in rupees.

**Architecture:** One pure module (`src/lib/assistant/models.ts`) owns the effort allowlist and the cost arithmetic, with no I/O so it can be unit-tested. The API route validates the client's effort against that allowlist, passes it as `output_config.effort`, and accumulates token usage across every turn of the tool runner rather than reading the final message. The Ask UI gains a five-position dial and shows a rupee figure per answer plus a session total.

**Tech Stack:** Next.js 16 App Router, React 19, TypeScript with `exactOptionalPropertyTypes`, `@anthropic-ai/sdk` 0.122.0 (`client.beta.messages.toolRunner`), vitest, Tailwind 4.

**Spec:** `docs/superpowers/specs/2026-09-05-ask-effort-dial-and-cost-readout-design.md`

## Global Constraints

- **Model is `claude-sonnet-5`, always.** There is no model picker. Do not add one.
- **Effort levels, fastest to slowest:** `low`, `medium`, `high`, `xhigh`, `max`. `high` is the default and the fallback.
- **`effort` goes inside `output_config`**, never at the top level: `output_config: { effort }`.
- **`thinking` stays omitted.** Sonnet 5 runs adaptive thinking when the parameter is absent, which is what is wanted.
- **Never send a client-supplied effort value unvalidated.** Anything unrecognised falls back to `high`.
- **Rates (USD per million tokens):** input `2.00`, output `10.00`, cache read `0.20`, cache write `2.50`.
- **`USD_TO_PKR = 280`** and **`PAYMENT_TAX_RATE = 0.10`**. Tax is applied to the USD figure, then converted: `usd × 1.10 × 280`.
- **Money is shown to the nearest rupee.** No decimal places.
- **`exactOptionalPropertyTypes` is on.** Build optional fields by spreading, never by assigning `undefined`.
- **Comments explain *why*, not *what*.**
- **Never run bare `npm run db:types`** — it targets the linked REMOTE Supabase project. Nothing in this plan needs types regenerated.
- **Verification:** `npm test`, `npm run typecheck`, `npm run lint` must all be clean. There are currently 299 passing tests.

---

## File Structure

**Created:**

| Path | Responsibility |
| --- | --- |
| `src/lib/assistant/models.ts` | The effort allowlist, its validation, the four token rates, and the PKR cost function. Pure — no I/O, no SDK import. |
| `src/lib/assistant/models.test.ts` | Tests for the above |

**Modified:**

| Path | Change |
| --- | --- |
| `src/app/api/assistant/route.ts` | Read and validate `effort`; pass `output_config`; accumulate usage across the runner; return `costPkr` |
| `src/components/assistant/assistant-conversation.tsx` | Effort dial, per-answer cost, session total |

---

## Task 1: The pure module

**Files:**
- Create: `src/lib/assistant/models.ts`
- Create: `src/lib/assistant/models.test.ts`

**Interfaces:**
- Consumes: nothing
- Produces: `ASK_MODEL: "claude-sonnet-5"`; `type EffortLevel = "low" | "medium" | "high" | "xhigh" | "max"`; `EFFORT_LEVELS: readonly EffortOption[]` where `EffortOption = { value: EffortLevel; label: string; hint: string }`; `DEFAULT_EFFORT: EffortLevel`; `resolveEffort(value: unknown): EffortLevel`; `interface UsageTotals { input: number; output: number; cacheRead: number; cacheWrite: number }`; `costInPkr(usage: UsageTotals): number`

- [ ] **Step 1: Write the failing test**

Create `src/lib/assistant/models.test.ts`:

```ts
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
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm test -- models`
Expected: FAIL — cannot resolve `./models`.

- [ ] **Step 3: Write the implementation**

Create `src/lib/assistant/models.ts`:

```ts
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
  /** Shown under the label. Empty where the label already says it. */
  hint: string;
}

/** Ordered fastest to most thorough — the order the dial renders in. */
export const EFFORT_LEVELS: readonly EffortOption[] = [
  { value: "low", label: "Fast", hint: "A quick answer" },
  { value: "medium", label: "Balanced", hint: "" },
  { value: "high", label: "Thorough", hint: "Default" },
  { value: "xhigh", label: "Deeper", hint: "For hard questions" },
  { value: "max", label: "Maximum", hint: "Slowest and dearest" },
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
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npm test -- models`
Expected: PASS.

- [ ] **Step 5: Run the full suite, typecheck and lint**

Run: `npm test && npm run typecheck && npm run lint`
Expected: all clean; total rises from 299.

- [ ] **Step 6: Commit**

```bash
git add src/lib/assistant/models.ts src/lib/assistant/models.test.ts
git commit -m "feat: add the Ask effort ladder and its rupee cost arithmetic"
```

---

## Task 2: The route

**Files:**
- Modify: `src/app/api/assistant/route.ts`

**Interfaces:**
- Consumes: `ASK_MODEL`, `resolveEffort`, `costInPkr`, `UsageTotals` from `@/lib/assistant/models`
- Produces: the route's JSON response gains `costPkr: number`; its request body accepts an optional `effort` string

- [ ] **Step 1: Import the module**

At the top of `src/app/api/assistant/route.ts`, with the other `@/lib` imports:

```ts
import { ASK_MODEL, costInPkr, resolveEffort, type UsageTotals } from "@/lib/assistant/models";
```

- [ ] **Step 2: Read and validate the effort from the body**

The body's shape is declared explicitly at line 86:

```ts
  let body: { question?: unknown; language?: unknown; history?: unknown };
```

Widen it rather than casting at the use site — a cast here would be the one
place the validation could later be edited away without TypeScript noticing:

```ts
  let body: { question?: unknown; language?: unknown; history?: unknown; effort?: unknown };
```

Then, immediately below where `language` is read (line 94), resolve the effort
so no unvalidated value can reach the API call:

```ts
  const effort = resolveEffort(body.effort);
```

`resolveEffort` takes `unknown` precisely so this needs no cast.

- [ ] **Step 3: Replace the runner call and accumulate usage**

Find the `try` block containing `client.beta.messages.toolRunner`. Replace from the `const runner = ...` line down to and including the `const finalMessage = await runner.runUntilDone();` line with:

```ts
    const runner = client.beta.messages.toolRunner({
      model: ASK_MODEL,
      /*
       * A ceiling, not a reservation — unused tokens cost nothing, so this is
       * set well clear of any real answer rather than tuned down. The runner
       * has to call tools and then compose a reply, and Urdu and Roman Urdu
       * spend markedly more tokens per sentence than English; at a low cap the
       * reply is cut off mid-sentence and reaches the floor looking like a bad
       * answer rather than a truncated one.
       */
      max_tokens: 16000,
      output_config: { effort },
      system,
      tools,
      messages: [...history, { role: "user", content: question }],
    });

    /*
     * Usage is summed across every turn, not read off the final message.
     *
     * The runner makes one API call per tool round-trip, and each message's
     * `usage` describes only its own call. A question that resolves an
     * employee, reads their attendance and then prices a salary costs four
     * calls; reporting the last one would understate the real spend severalfold
     * — and a cost readout that is wrong in the cheap direction is worse than
     * none, because it will be believed.
     */
    const totals: UsageTotals = { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 };
    let finalMessage: Awaited<ReturnType<typeof runner.runUntilDone>> | undefined;

    for await (const message of runner) {
      totals.input += message.usage.input_tokens;
      totals.output += message.usage.output_tokens;
      totals.cacheRead += message.usage.cache_read_input_tokens ?? 0;
      totals.cacheWrite += message.usage.cache_creation_input_tokens ?? 0;
      finalMessage = message;
    }

    if (!finalMessage) {
      throw new Error("The assistant returned no messages.");
    }
```

Iterating replaces `runUntilDone()` — do not call both, or the conversation runs twice and bills twice.

The runner is typed `BetaToolRunner<false>` because the first `toolRunner` overload matches a body with no `stream` key, so `message` is a `BetaMessage` and `message.usage` needs no narrowing.

- [ ] **Step 4: Return the cost**

The route currently returns:

```ts
    return NextResponse.json({ answer: text || "I couldn't work out an answer to that." });
```

Replace with:

```ts
    return NextResponse.json({
      answer: text || "I couldn't work out an answer to that.",
      costPkr: costInPkr(totals),
    });
```

- [ ] **Step 5: Record the effort on the audit row**

The route already writes an `audit_log` row for every question. Its `after` column currently carries `{ language, answer }`. Add the effort and the cost, so a surprising bill can be traced to the settings that produced it:

```ts
      after: { language, effort, cost_pkr: costInPkr(totals), answer: text.slice(0, 2000) },
```

- [ ] **Step 6: Typecheck, lint, test**

Run: `npm run typecheck && npm run lint && npm test`
Expected: all clean.

If typecheck rejects `output_config`, confirm the SDK version is 0.122.0 — `BetaToolRunnerParams` is `Omit<MessageCreateParams, "tools"> & {...}`, so it inherits `output_config` from the message params.

- [ ] **Step 7: Commit**

```bash
git add "src/app/api/assistant/route.ts"
git commit -m "feat: run Ask at a chosen effort and report what the answer cost"
```

---

## Task 3: The dial and the readout

**Files:**
- Modify: `src/components/assistant/assistant-conversation.tsx`

**Interfaces:**
- Consumes: `EFFORT_LEVELS`, `DEFAULT_EFFORT`, `type EffortLevel` from `@/lib/assistant/models`; the route's `costPkr` field
- Produces: nothing

- [ ] **Step 1: Read the file first**

Read `src/components/assistant/assistant-conversation.tsx` before editing. Two things there are the patterns to copy rather than reinvent:

- the `ChatMessage` interface (around line 96), which is `{ role: "user" | "assistant"; text: string }`
- the language selector (around line 260), a row of `<button type="button">` elements styled with `cn(...)` and a `bg-primary` / `bg-secondary` split for the selected state

The effort dial is the same control with different options. Match its markup and its `compact` handling — the component renders in both a full page and a compact widget.

- [ ] **Step 2: Add the imports and the state**

```ts
import { DEFAULT_EFFORT, EFFORT_LEVELS, type EffortLevel } from "@/lib/assistant/models";
```

Beside the existing `useState` calls:

```ts
const [effort, setEffort] = useState<EffortLevel>(DEFAULT_EFFORT);
```

- [ ] **Step 3: Carry the cost on the message**

Extend `ChatMessage`:

```ts
interface ChatMessage {
  role: "user" | "assistant";
  text: string;
  /** Rupees this answer cost. Absent on the user's own messages. */
  costPkr?: number;
}
```

`exactOptionalPropertyTypes` is on, so build this by spreading rather than assigning `undefined` — see Step 5.

- [ ] **Step 4: Send the effort**

In `ask()`, the fetch body currently reads `{ question: trimmed, language, history }`. Add the effort:

```ts
        body: JSON.stringify({ question: trimmed, language, history, effort }),
```

And widen the response type beside it:

```ts
      const body = (await response.json().catch(() => null)) as {
        answer?: string;
        costPkr?: number;
        error?: string;
      } | null;
```

- [ ] **Step 5: Keep the cost on the appended message**

Replace the line that appends the assistant's reply:

```ts
      setMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          text: body.answer!,
          // Spread rather than assign: exactOptionalPropertyTypes treats an
          // explicit undefined as different from an absent key.
          ...(typeof body.costPkr === "number" ? { costPkr: body.costPkr } : {}),
        },
      ]);
```

- [ ] **Step 6: Render the dial**

Below the existing language selector, following its markup:

```tsx
<div className={cn("flex gap-1.5", compact ? "mt-1.5" : "mt-2")}>
  {EFFORT_LEVELS.map((level) => (
    <button
      key={level.value}
      type="button"
      onClick={() => setEffort(level.value)}
      title={level.hint}
      className={cn(
        "flex-1 rounded-2xl font-bold transition-all",
        compact ? "px-2 py-1.5 text-[0.65rem]" : "px-3 py-2 text-xs",
        effort === level.value
          ? "bg-primary text-primary-foreground"
          : "bg-secondary text-muted-foreground hover:text-foreground",
      )}
    >
      {level.label}
    </button>
  ))}
</div>
```

- [ ] **Step 7: Show the per-answer cost and the session total**

Where an assistant message is rendered, add beneath its text:

```tsx
{message.role === "assistant" && typeof message.costPkr === "number" ? (
  <p className="mt-1 text-[0.65rem] font-semibold text-muted-foreground">
    Rs {message.costPkr.toLocaleString("en-PK")}
  </p>
) : null}
```

And near the dial, a session total — computed from the messages already in state rather than tracked separately, so it cannot drift from the figures shown above it:

```tsx
{sessionCostPkr > 0 ? (
  <p className="mt-1 text-[0.65rem] text-muted-foreground">
    This session: Rs {sessionCostPkr.toLocaleString("en-PK")}
  </p>
) : null}
```

with, beside the other derived values in the component body:

```ts
const sessionCostPkr = messages.reduce((total, message) => total + (message.costPkr ?? 0), 0);
```

- [ ] **Step 8: Typecheck, lint, test**

Run: `npm run typecheck && npm run lint && npm test`
Expected: all clean.

- [ ] **Step 9: Verify it in the browser**

This is the only step that proves the feature. `ANTHROPIC_API_KEY` must be set in `.env.local` first — without it every question returns 503 and nothing below can be checked.

Run `npm run dev`, open `/assistant`, and confirm:
- the dial shows five options with **Thorough** selected
- asking the same question at **Fast** and at **Maximum** returns two different rupee figures, the Maximum one larger
- the session total equals the sum of the per-answer figures shown
- the dial renders sensibly in the compact widget as well as the full page

- [ ] **Step 10: Commit**

```bash
git add src/components/assistant/assistant-conversation.tsx
git commit -m "feat: let Ask choose its effort and show what each answer cost"
```

---

## Notes for the implementer

**Do not add a model picker.** Sonnet 4.6 was considered and deliberately rejected — it costs 50% more than Sonnet 5 and is the older model. The spec records why. If a picker seems obviously useful, read the spec's "The model" section before adding one.

**Do not call `runUntilDone()` and iterate.** They are alternatives. Doing both runs the whole conversation twice and bills for both.

**The effort allowlist is not decoration.** It is the only thing standing between a browser field and the factory's Anthropic bill. Do not "simplify" `resolveEffort` into a cast.
