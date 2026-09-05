# An effort dial, a cost readout, and a guided walkthrough for Ask

**Date:** 2026-09-05
**Status:** Approved design, not yet implemented

## Why

Three things were asked of the Ask assistant:

1. A **faster ↔ smarter** control, so a quick question does not cost what a hard
   one does.
2. A **cost readout**, the way Claude shows usage, in rupees.
3. The ability to **show someone how to do a task on screen** — "click here,
   then here" — rather than only answering questions about data.

A fourth was asked for and then withdrawn: letting the assistant *perform*
tasks, including removing a person. That is deliberately not built. See
[Not building](#not-building).

## What already exists

Worth stating, because two of the four original asks need no work at all:

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

```ts
export function costInPkr(usage: UsageTotals): number;
```

### The exchange rate is a decision, not a lookup

`USD_TO_PKR` is a named constant in `models.ts` with a comment recording when
it was set and that it is maintained by hand.

Fetching a live rate per answer would add a network call, a failure mode and a
dependency to a number that moves a few percent a month — and a cached live
rate is just a hardcoded one that lies about being current.

It ships at **`280`** — roughly the rate on 2026-09-05 — as a named constant
carrying that date in its comment. **This number needs confirming by the
user**, and until it is, every figure in the UI is prefixed "approx." so nobody
reads it as an invoice. Changing it is a one-line edit with one test to
update.

## Section 3 — The guided walkthrough

The assistant explains how to do a task by driving the real screen: dimming the
page, drawing a ring around the actual control, and putting a tooltip beside
it. It never clicks anything itself.

### Three pieces

**`src/lib/assistant/recipes.ts`** — a hand-written catalogue. Pure data, no
I/O.

```ts
export interface TourStep {
  /** Route this step happens on, e.g. "/rates". */
  page: string;
  /** Matches a `data-tour-id` attribute on the control. */
  tourId: string;
  /** What the user should do, in their own language. */
  instruction: string;
}

export interface Recipe {
  key: string;
  title: string;
  /** Phrasings that should match this recipe, for the tool description. */
  triggers: readonly string[];
  /** Permission needed to complete it — a recipe nobody may finish is not offered. */
  requires: string;
  steps: readonly TourStep[];
}
```

**A tool, `show_me_how`** — takes the task the user described and returns the
matching recipe's steps. It selects from the catalogue; it cannot compose
steps. Asked for something with no recipe, it says so plainly rather than
inventing a plausible route through screens that do not connect. A confidently
wrong walkthrough is worse than "I don't know how to show you that" — the user
follows it, it fails at step three, and they trust nothing it says afterwards.

The tool also filters by permission: a manager is never walked into a payroll
run they cannot complete.

**`TourOverlay`** — a client component. Navigates to the step's page, waits for
the element to exist, dims everything else, rings the control, shows the
instruction, and advances when the user clicks it or presses Next. Escape
exits. A step whose element never appears stops the tour with an honest message
rather than pointing at nothing.

### The cost is the attributes, not the overlay

The overlay can only ring an element carrying a stable `data-tour-id`. Almost
nothing in the app has one. So each recipe drags along small edits to every
page it crosses — `rates/`, `admin/users/`, `attendance/logs/`, `payroll/`.

That is the real work here, and the reason this is a design and not a patch:
the overlay is one component, but the attributes thread through the app.

`data-tour-id` is used rather than a CSS selector or button text deliberately.
A selector breaks when someone restyles; text breaks when someone rewords or
translates. A `data-tour-id` is a declared contract that grep can verify, which
is what the test in Section 4 depends on.

### The first five recipes

Chosen to cover what was actually described, and to touch five different areas
so the pattern is proven before it is repeated:

| Recipe | Page(s) | Requires |
| --- | --- | --- |
| Set a contract firm's monthly amount | `/rates` | `rates.manage` |
| Add an employee | `/admin/users` | `people.manage` |
| Correct a missed punch | `/attendance/logs` | `attendance.edit` |
| Run payroll for a period | `/payroll` | `payroll.run` |
| Approve a department's attendance | `/attendance/logs` | `attendance.approve` |

More are added once the pattern holds. Writing twenty up front would multiply
an untested shape.

## Section 4 — Testing

Three pure modules, all genuinely testable without a database or a browser:

- **`models.test.ts`** — every effort level in `EFFORT_LEVELS` is one Sonnet 5
  accepts; an unknown value from the client falls back to `high`; the cost
  arithmetic returns known figures for known token counts, including a case
  where cache reads dominate (the one where treating all input alike would be
  visibly wrong).
- **`recipes.test.ts`** — every recipe has at least one step; no two recipes
  share a `key`; every `page` resolves to a real route, checked by globbing
  `src/app/(app)/**/page.tsx` and comparing against the route each file
  implies, so a recipe pointing at `/rates/firms` fails rather than silently
  404-ing a user mid-tour; every `requires` is a permission key that exists,
  checked by grepping the migration that seeds the catalogue
  (`20260814090400_access_catalog.sql`) plus any later migration adding
  permissions — a typo'd key would otherwise make a recipe permanently
  invisible with no error anywhere.
- **The rot test** — every `tourId` referenced by any recipe appears as a
  `data-tour-id="<id>"` somewhere under `src/app/`, checked by reading the
  files rather than by maintaining a second list (a list would rot in exactly
  the same way the recipes do). This is the test that matters. A
  recipe is a hand-written claim about a UI that other people change, and
  without this the failure is silent: the tour points at nothing, in
  production, and nobody learns until a user reports it.

`TourOverlay` gets no unit test — it is DOM choreography whose failure modes
are visual, and a jsdom test of a spotlight would assert the implementation
back to itself. It is verified by walking each recipe in the browser.

## Not building

**Write access.** The original request included the assistant performing
actions — "if the admin says remove the X person, the API must remove it" —
and was withdrawn in favour of the walkthrough. It stays out, and the reason is
worth recording so it is not reintroduced casually.

The assistant reads database content: employee names, department names, leave
reasons. Anyone who can type into the system controls those strings. Today the
worst outcome is a wrong answer. With a delete tool, the same string sits in
the model's context next to a tool that can execute it — and the assistant
takes voice input, where a misheard name has no undo.

If it is ever wanted, the safe shape is: the assistant *proposes* a change and
a human confirms it in the UI. Never direct execution.

**A model picker.** See [The model](#the-model).

**Access control.** Already exists.

## Build order

Sections 1 and 2 are one change to one route plus one pure module, and land
together. Section 3 is independent of both and can follow. Nothing in Section 3
depends on the effort dial, and nothing in Sections 1–2 depends on recipes.
