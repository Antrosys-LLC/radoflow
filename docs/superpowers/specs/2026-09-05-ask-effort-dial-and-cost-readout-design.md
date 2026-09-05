# An effort dial and a cost readout for Ask

**Date:** 2026-09-05
**Status:** Approved design, not yet implemented

## Why

Two things are being added to the Ask assistant:

1. A **faster ↔ smarter** control, so a quick question does not cost what a hard
   one does.
2. A **cost readout**, the way Claude shows usage, in rupees.

Two further requests were made and then withdrawn — letting the assistant
*perform* tasks, and a step-by-step on-screen walkthrough. Neither is built.
See [Not building](#not-building), which records why, so neither is
reintroduced without the reasoning being revisited.

## What already exists

Worth stating, because two of the original asks need no work at all:

| Asked for | Already there |
| --- | --- |
| Restrict Ask to a few people; admin can change it | `assistant.ask` permission (migration `20260830110000`), granted to `operations` and `manager`, superusers implicit, Employee deliberately excluded. Editable at `/admin/roles`. |
| Calculate salaries and attendance | 35 read-only tools in `src/lib/assistant/tools.ts`, including `calculate_salary`, `get_salary_cost`, `get_payroll_summary`, `get_attendance_summary`. |

Both are done. Rebuilding either would replace working code with new code.

## The model

**One model: `claude-sonnet-5`.** A picker offering Sonnet 4.6 alongside it was
considered and dropped. Sonnet 4.6 costs $3/$15 per million tokens against
Sonnet 5's $2/$10, and is the older model — anyone choosing it would get a
worse answer for half again the price. A control whose options are strictly
dominated is a trap, not a choice.

The real faster ↔ smarter axis is **effort**, which varies thinking depth and
token spend within one model. One model also means one prompt-cache namespace;
a two-model picker would halve the cache hit rate, since caches are
model-scoped.

## Section 1 — The effort dial

New pure module `src/lib/assistant/models.ts`, the single source of truth for
what may be sent and what it costs.

```ts
export const ASK_MODEL = "claude-sonnet-5";

export type EffortLevel = "low" | "medium" | "high" | "xhigh" | "max";

/** Ordered fastest to most thorough. `high` is the API default. */
export const EFFORT_LEVELS: readonly { value: EffortLevel; label: string; hint: string }[];
```

Labelled for a factory office, not for an API reference:

| Value | Label | Shown as |
| --- | --- | --- |
| `low` | Fast | A quick answer |
| `medium` | Balanced | — |
| `high` | Thorough | Default |
| `xhigh` | Deeper | Slower, for hard questions |
| `max` | Maximum | Slowest and dearest |

Sent as `output_config: { effort }` on the tool-runner call. `effort` lives
**inside** `output_config`, not at the top level.

`thinking` stays omitted. Sonnet 5 runs adaptive thinking when the parameter is
absent, which is what is wanted; naming it explicitly would add a line that
changes nothing.

### The allowlist is the control, not the picker

The effort value arrives from the browser in the request body. The route
validates it against `EFFORT_LEVELS` and falls back to `high` on anything
unrecognised.

This is not defensive tidiness. An unvalidated field forwarded into
`output_config` lets anyone holding `assistant.ask` bill the factory's
Anthropic account at `max` on every question, or send a malformed value that
turns every request into a 400. The picker is a convenience; the allowlist is
what actually constrains spend.

## Section 2 — Cost in rupees

Shown per answer and as a running session total. Rupees only — token counts
mean nothing to the person reading this screen.

### Usage must be accumulated, not read off the end

`runner.runUntilDone()` returns the **final** message, and its `usage` field
describes only the last API call. The tool runner makes one call per tool
round-trip, so a question that resolves an employee, reads their attendance and
then computes a salary costs four calls and reports one. The figure would
understate real spend several-fold — and a cost readout that is wrong in the
cheap direction is worse than none, because it will be believed.

`BetaToolRunner` implements `[Symbol.asyncIterator]`, yielding every message.
The route iterates instead:

```ts
let totals = { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 };
let final: Anthropic.Beta.BetaMessage | undefined;

for await (const message of runner) {
  totals.input      += message.usage.input_tokens;
  totals.output     += message.usage.output_tokens;
  totals.cacheRead  += message.usage.cache_read_input_tokens ?? 0;
  totals.cacheWrite += message.usage.cache_creation_input_tokens ?? 0;
  final = message;
}
```

### The arithmetic

Four rates, because cached tokens genuinely do not cost what fresh ones cost.
The system prompt here is large and stable — exactly the shape that caches —
so treating a cache read as full price would overstate a typical answer
substantially.

| Bucket | Rate (USD per million) |
| --- | --- |
| `input_tokens` (uncached) | 2.00 |
| `output_tokens` | 10.00 |
| `cache_read_input_tokens` | 0.20 (0.1× input) |
| `cache_creation_input_tokens` | 2.50 (1.25× input) |

`input_tokens` already excludes cached tokens — they are reported in their own
fields — so the four buckets sum without double-counting.

Then two multipliers, in this order:

```
usd        = Σ (tokens × rate)
withTax    = usd × 1.10        // 10% payment tax
pkr        = withTax × 280     // USD → PKR
```

**Tax is applied before conversion, not after.** The two orderings happen to
give the same number here because both are flat multipliers, but the order
states what the figure means: what the factory is billed in dollars, then what
that costs in rupees. Written the other way round it reads as a rupee tax,
which is not what it is.

`$5` therefore reads as `₨1,540` — the worked example given when this was
specified.

```ts
export function costInPkr(usage: UsageTotals): number;
```

### The two constants

Both live in `models.ts` as named constants, each carrying the date it was set
and a note that it is maintained by hand:

| Constant | Value | Meaning |
| --- | --- | --- |
| `USD_TO_PKR` | `280` | Rate as of 2026-09-05, confirmed by the user |
| `PAYMENT_TAX_RATE` | `0.10` | 10% tax on the dollar amount billed |

Fetching a live exchange rate per answer would add a network call, a failure
mode and a dependency to a number that moves a few percent a month — and a
cached live rate is just a hardcoded one that lies about being current. A
manual constant with a date beside it is honest about what it is, and changing
it is a one-line edit with one test to update.

Figures are shown to the nearest rupee. Sub-rupee precision on an estimate
derived from two hand-maintained constants would imply an accuracy that is not
there.

## Section 3 — Testing

One pure module, genuinely testable without a database, a browser or a network
call:

**`models.test.ts`**

- Every value in `EFFORT_LEVELS` is one Sonnet 5 accepts, and the five are in
  fastest-to-slowest order.
- An unknown, absent, or malformed effort from the client falls back to `high`
  — including the cases that matter for spend: `"MAX"`, `"maximum"`, `null`,
  and a number.
- Cost arithmetic returns known figures for known token counts.
- A case where cache reads dominate the input — the one where treating all
  input tokens alike would be visibly wrong, and the reason the four buckets
  exist.
- The worked example holds: the token counts that produce $5 of usage return
  ₨1,540.

The route change is verified by running it: a question answered with the dial
at each end, confirming the cost differs and that both figures are plausible
against the token counts the answer reports.

## Not building

**Write access.** The original request included the assistant performing
actions — "if the admin says remove the X person, the API must remove it". It
stays out, and the reason is worth recording so it is not reintroduced
casually.

The assistant reads database content: employee names, department names, leave
reasons. Anyone who can type into the system controls those strings. Today the
worst outcome is a wrong answer. With a delete tool, the same string sits in
the model's context next to a tool that can execute it — and Ask takes voice
input, where a misheard name has no undo.

If it is ever wanted, the safe shape is: the assistant *proposes* a change and
a human confirms it in the UI. Never direct execution.

**The step-by-step walkthrough.** A spotlight overlay driving the real screen —
dimming the page, ringing the actual control, "click here, then here" — was
specified and then withdrawn. It is not built.

Recorded because the cost was not where it looked: the overlay is one
component, but it can only ring an element carrying a stable `data-tour-id`,
and almost nothing in the app has one. Every recipe would have dragged small
edits across each page it crossed, and each hand-written step would have been a
claim about a UI other people change — breaking silently, in production, with
the tour pointing at nothing. If it is ever revived, it needs the attributes
and a test that greps for them, not just the overlay.

**A model picker.** See [The model](#the-model).

**Access control.** Already exists.

## Build order

One pure module, then the route that uses it, then the UI that shows it.
Nothing here depends on anything outside `src/lib/assistant/` and the Ask page.
