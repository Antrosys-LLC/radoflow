# Multilingual Wave 2 — the floor's screens

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Every screen the factory floor uses — the attendance log, the check
in/out register, the canteen, the terminals, the live floor and Ask — reads in
English, Urdu or Roman Urdu, with names, codes and figures kept Latin and
correctly ordered.

**Architecture:** Wave 1 built the machinery and proved it on three screens.
This wave adds no machinery except two things Wave 1 turned out to need and
lack: mirrored directional icons, and server actions whose messages are
translated rather than English. Everything else is applying the existing
`dictionaryFor` / `useDictionary` / `<Latin>` / `<Fill>` pattern, one screen
group at a time.

**Tech Stack:** Next.js 16 App Router, React 19, TypeScript with
`exactOptionalPropertyTypes`, Tailwind 4, vitest.

**Spec:** `docs/superpowers/specs/2026-09-05-multilingual-design.md` — Section 6
names this wave's screens. The spec covers Wave 1 in full plus the shared
decisions this wave inherits; where this plan and the spec disagree about a
Wave 1 detail, the shipped code wins, because Wave 1 is merged.

**Wave 1 delivered (read before starting):** commits `d8780c3`, `910b17d`,
`b8c1e69`, `a876f82`, `017c484`, `105c6b4`, `90ec641`.

---

## Global Constraints

Every task's requirements implicitly include this section.

**Tasks 2–7 all edit the same three dictionary files. They MUST run strictly
sequentially — never two at once.** `src/lib/i18n/en.ts`, `ur.ts` and
`roman-ur.ts` are edited by every one of them; two concurrent implementers
would conflict in the same object literal. Task 1 touches no dictionary and may
run alongside anything.

- **`en.ts` must not use `as const`.** Literal types would force the
  translations to repeat the English text to typecheck.
- **The three dictionaries must keep identical leaf-key path sets**, no value an
  empty string, `ur` values in Arabic script, `roman-ur` values Latin-only,
  and placeholder token sets identical per key across all three. Wave 1 ended
  at **150 leaf keys**; `src/lib/i18n/index.test.ts` enforces parity.
- **Roman Urdu is left-to-right.** `directionFor("roman-ur") === "ltr"`. This is
  the thing most likely to be got wrong by pattern-matching on "Urdu".
- **Names and numbers stay Latin.** Every person's name, employee code, CNIC,
  phone number, rupee figure, hour count, time and date goes through
  `<Latin>` from `@/components/latin`, which renders `<bdi dir="ltr"
  className="font-latin">`. An unwrapped `RD-1042` in a right-to-left page can
  display as `1042-RD` — the database is fine and the screen lies. **That is
  worse than an untranslated label, which is merely unhelpful.**
- **Sentences with values use `<Fill>`** from `@/components/fill`, never
  `String.replace` and never concatenation. It matches `{slots}` by name — the
  translations reorder them — and renders each value through `<Latin>`.
- **Never translate inside `src/components/ui/`.** Those are vendored shadcn
  primitives (`breadcrumb`, `carousel`, `context-menu`, `dropdown-menu`,
  `menubar`, `pagination`). They carry their own directional icons and are out
  of scope for every task in this plan.
- **Next.js `metadata` titles and descriptions stay English.** They are emitted
  before any language preference is known. This was ruled on in Wave 1; do not
  reopen it.
- **The local Postgres will not start.** Port 54322 is inside the OS-reserved
  range 54319–54418. Do not run `npm run db:reset`, `db:types:local`,
  `db:types` or `supabase start`, and do not hand-edit
  `src/lib/supabase/database.types.ts`.
- **Verification per task:** `npm run typecheck && npm run lint && npm test &&
  npm run build`. All four, real output reported, not "passed".
- **Two pre-existing untracked files** at the repo root — `scratch-estimate-check.ts`
  and one whose name begins `E:radoflow.superpowerssdd` — are junk from earlier
  work. Leave them. Never `git add -A` or `git commit -a`; stage explicit paths.

---

## File Structure

| File | Responsibility | Task |
| --- | --- | --- |
| `src/app/globals.css` | gains `.rtl-flip` | 1 |
| `src/app/(app)/page.tsx` | Wave 1 retro-fix: mirror its icons | 1 |
| `src/app/(app)/devices/live/page.tsx` | icons (1), then full conversion (7) | 1, 7 |
| `src/app/(app)/devices/[id]/page.tsx` | icons (1), then full conversion (6) | 1, 6 |
| `src/components/swipe-to-confirm.tsx` | direction-aware swipe + icon | 1 |
| `src/lib/i18n/{en,ur,roman-ur}.ts` | every new key | 2–7 |
| `src/app/(app)/attendance/logs/actions.ts` | worked example of the action pattern | 2 |
| `src/app/(app)/attendance/logs/page.tsx` + `approve-range.tsx` | attendance log | 3 |
| `src/app/(app)/attendance/register/page.tsx` | check in/out register | 4 |
| `src/app/(app)/canteen/**` | counter and settings | 5 |
| `src/app/(app)/devices/**` | list, dialog, detail, controls, actions | 6 |
| `src/components/assistant/**`, `src/app/(app)/assistant/**` | Ask | 7 |

**Measured scope.** ~203 user-facing string candidates before dedup; 51
physical direction utilities, concentrated in `logs/page.tsx` (30) and
`register/page.tsx` (14); 28 directional icons app-wide, of which the
non-vendored ones are in `devices/live`, `devices/[id]`, the Wave 1 dashboard
and `swipe-to-confirm`.

---

### Task 1: Mirror directional icons in right-to-left

Wave 1 shipped `dir="rtl"` but left every arrow pointing the way it always did.
A back arrow that points left in a right-to-left page points *forward*. This is
the one Wave 1 defect this wave fixes rather than inherits, and it is separated
from the translation work because it changes no strings and can be judged on
its own.

**Files:**
- Modify: `src/app/globals.css`
- Modify: `src/app/(app)/page.tsx`
- Modify: `src/app/(app)/devices/live/page.tsx`
- Modify: `src/app/(app)/devices/[id]/page.tsx`
- Modify: `src/components/swipe-to-confirm.tsx`

**Interfaces:**
- Consumes: nothing
- Produces: the `.rtl-flip` utility class

- [ ] **Step 1: Add the utility**

In `src/app/globals.css`, beside the `.font-latin` rule Wave 1 added:

```css
/*
 * An icon that means "back", "forward", "next" or "previous" points along the
 * reading direction, so it must mirror when the reading direction does. Applied
 * by hand rather than to every icon: an arrow that points at a real-world thing
 * — a download, an external link, a chart trending up — means the same in both
 * directions and must NOT flip.
 *
 * `scaleX(-1)` rather than swapping the component, because the icon set has no
 * logical variants and a mirrored glyph is exactly what is wanted.
 */
[dir="rtl"] .rtl-flip {
  transform: scaleX(-1);
}
```

- [ ] **Step 2: Find every call site**

Run:

```bash
grep -rnE '\b(ArrowLeft|ArrowRight|ChevronLeft|ChevronRight)\b' src --include=*.tsx
```

Expected: hits in `src/app/(app)/page.tsx`, `src/app/(app)/devices/live/page.tsx`,
`src/app/(app)/devices/[id]/page.tsx`, `src/components/swipe-to-confirm.tsx`, and
in `src/components/ui/*`.

**Ignore every hit under `src/components/ui/`.** Those are vendored shadcn
primitives; they are out of scope for this whole plan.

- [ ] **Step 3: Add the class at each non-vendored call site**

For each, add `rtl-flip` to the icon's `className`. For example, in
`src/app/(app)/devices/live/page.tsx` the back link's arrow becomes:

```tsx
<ArrowLeft className="size-4 rtl-flip" />
```

**Judge each one.** Add the class only where the arrow means direction of
travel through the interface — back, forward, next, previous, "see more". Leave
it off any arrow that points at a thing in the world. Say in your report which
you flipped, which you left, and why for any that were not obvious.

- [ ] **Step 4: Handle the swipe control**

`src/components/swipe-to-confirm.tsx` is a gesture, not just an icon: a
slide-to-confirm that travels left-to-right. Read it, then decide and state
plainly in your report which of these you did:

- mirrored the whole control in RTL, so it travels right-to-left and its arrow
  flips with it; or
- left the gesture direction alone and flipped only the arrow; or
- left it entirely alone.

There is a right answer for the factory — this is the canteen's confirm
control, used by staff who read Urdu — but it depends on how the component is
built. If mirroring the gesture means reworking the pointer maths, do **not**
do it in this task: say so, flip nothing, and report it as a finding for its
own task. A half-mirrored gesture that confirms on the wrong swipe is worse
than an unmirrored one.

- [ ] **Step 5: Verify**

Run: `npm run typecheck && npm run lint && npm test && npm run build`
Expected: all clean, 343 tests.

- [ ] **Step 6: Commit**

```bash
git add src/app/globals.css "src/app/(app)/page.tsx" "src/app/(app)/devices/live/page.tsx" "src/app/(app)/devices/[id]/page.tsx" src/components/swipe-to-confirm.tsx
git commit -m "fix: mirror directional icons when the page reads right to left"
```

---

### Task 2: Shared keys, and server actions that speak the reader's language

Wave 2's screens all submit forms, and every one of their server actions
returns an English sentence that the client toasts. A validation error in
English on an Urdu screen is exactly the half-done state the spec warns
against. This task establishes how that is fixed and proves it on the smallest
action file; Tasks 3–7 then apply it to their own.

**Files:**
- Modify: `src/lib/i18n/en.ts`, `src/lib/i18n/ur.ts`, `src/lib/i18n/roman-ur.ts`
- Modify: `src/app/(app)/attendance/logs/actions.ts`

**Interfaces:**
- Consumes: `dictionaryFor`, `type Dictionary` from `@/lib/i18n`;
  `requireSession` from `@/lib/auth/session`
- Produces: a `common` group extended with the shared Wave 2 terms; the
  convention that a server action returns an already-translated `message`

- [ ] **Step 1: Read what already exists**

Read all of `src/lib/i18n/en.ts`. It has **150 leaf keys** in six groups:
`nav` (19), `common` (22), `status` (3 sub-groups), `dashboard` (47),
`attendance` (24), `profile` (25).

**Do not duplicate what is there.** In particular `status.device` already
covers online / offline / unknown / disabled, and `common` already has `save`,
`saving`, `cancel`, `loading`, `nothingYet`, `today`, `hours`, `yes`, `no`,
`checkedIn`, `checkedOut`, `minutesLate`.

- [ ] **Step 2: Add only the terms two or more Wave 2 screens share**

Read these six files first and collect the strings they have in common:

```
src/app/(app)/attendance/logs/page.tsx
src/app/(app)/attendance/register/page.tsx
src/app/(app)/canteen/counter-screen.tsx
src/app/(app)/devices/page.tsx
src/app/(app)/devices/live/page.tsx
src/components/assistant/assistant-conversation.tsx
```

Add to `common` **only** what genuinely recurs — the button and control
vocabulary (add, edit, delete, close, confirm, retry, search, filter, clear,
back, none, all, of, from, to, refresh) and any status or unit word used on
more than one of those screens. A string used by exactly one screen belongs to
that screen's group, added by that screen's task, not here.

If you find fewer than ten genuinely shared strings, add fewer than ten. This
task is not measured by how many keys it adds; a key added here that only one
screen uses is worse than the same key added later in the right place, because
it separates the word from the screen that gives it meaning.

- [ ] **Step 3: Translate them**

Match the register `ur.ts` and `roman-ur.ts` already set — read them first.
These are factory floor workers, supervisors and office staff in a Pakistani
textile mill; use the plain words the trade uses, not formal literary Urdu.

Add anything you are unsure of to the uncertain-translation banner at the top
of both translated files, which a native speaker will review.

- [ ] **Step 4: Translate the logs action**

`src/app/(app)/attendance/logs/actions.ts` is 72 lines and returns four
distinct messages. Read it, then convert it.

A server action already loads the session, so it already knows the language —
it needs no new plumbing and no extra round trip. `approveAttendanceRange`
opens with `const session = await requirePermission("attendance.approve")`
(verified at `src/app/(app)/attendance/logs/actions.ts:31`), which returns a
full `Session`. Add one line under it:

```ts
const session = await requirePermission("attendance.approve");
const t = dictionaryFor(session.profile.language);

if (!input.profileId || !input.from || !input.to) {
  return { ok: false, message: t.logs.pickPersonAndRange };
}
```

Do **not** add a `requireSession()` call — the permission check already gave
you the session, and a second call would be a second load.

The count-carrying success message cannot be built by concatenation, because
Urdu puts the words in a different order. Write it as a sentence with a slot
and substitute in the action:

```ts
const template = count === 1 ? t.logs.approvedOne : t.logs.approvedMany;
return { ok: true, message: template.replace("{count}", String(count)) };
```

`String.replace` is correct **here** and wrong in a component. This value is a
plain string being handed to a toast, not React children, so there is no
`<Latin>` to render and no bidi isolation to preserve — the toast is a single
short run. `<Fill>` exists for the case this is not: values rendered inside a
sentence on the page.

**Leave `error.message` passthroughs alone.** Those are raw Postgres errors.
They are untranslatable, they are developer-facing, and inventing an Urdu
sentence to wrap one would hide what actually failed.

Add the keys this needs under a new `logs` group as you go.

- [ ] **Step 5: Verify parity yourself**

The parity test in `src/lib/i18n/index.test.ts` will catch a missing key. Also
check by hand that no value you added is an empty string and that any
`{placeholder}` you used appears in all three languages.

- [ ] **Step 6: Verify**

Run: `npm run typecheck && npm run lint && npm test && npm run build`
Expected: all clean. Report the leaf-key count you ended at.

- [ ] **Step 7: Commit**

```bash
git add src/lib/i18n "src/app/(app)/attendance/logs/actions.ts"
git commit -m "feat: share the floor's common words and translate action messages"
```

---

### Tasks 3–7: the screens

**Controller note — when extracting per-task briefs, prepend this whole section
to each of Tasks 3, 4, 5, 6 and 7.** The nine steps below are the substance of
all five tasks; a brief containing only a task's own subsection would tell an
implementer which files to touch and nothing about what to do to them.

**These five tasks have the same shape.** Each one:

1. Reads its screens and lists every user-facing string.
2. Adds exactly those keys to `en.ts`, `ur.ts` and `roman-ur.ts`, in a group
   named for the screen.
3. Converts the screens: `dictionaryFor(session.profile.language)` in server
   components, `useDictionary()` in client components.
4. Wraps every name, employee code, CNIC, phone number, rupee figure, hour
   count, time and date in `<Latin>`.
5. Uses `<Fill>` for any sentence carrying a value.
6. Converts physical direction utilities to logical ones:

   | Physical | Logical |
   | --- | --- |
   | `pl-` / `pr-` | `ps-` / `pe-` |
   | `ml-` / `mr-` | `ms-` / `me-` |
   | `left-` / `right-` | `start-` / `end-` |
   | `rounded-l-` / `rounded-r-` | `rounded-s-` / `rounded-e-` |
   | `text-left` / `text-right` | `text-start` / `text-end` |

   **Not all of them.** Leave physical any position that is not part of the
   reading flow — a decorative element pinned to a visual corner, an icon whose
   placement is not direction-dependent. Each is a judgement; report which you
   left and why.
7. Translates its own `actions.ts` messages using the Task 2 pattern, if it has
   one.
8. Runs `npm run typecheck && npm run lint && npm test && npm run build`.
9. Commits with the message given.

**A screen is done when all of that is done.** A screen with translated
headings but an unwrapped employee code is not half-done — it is broken in
Urdu.

**If you need a key that exists in another screen's group,** move it to
`common` and say so in your report. Do not duplicate it.

**If a string is a name, a code, a serial number or a piece of hardware
identity, it is not translated** — it is wrapped. A ZKTeco K50's model name and
a terminal's serial number are Latin in every language.

---

### Task 3: The attendance log

The largest screen in the wave and the one with the most direction utilities.

**Files:**
- Modify: `src/app/(app)/attendance/logs/page.tsx` (834 lines, ~42 strings, **30 physical direction utilities**)
- Modify: `src/app/(app)/attendance/logs/approve-range.tsx` (73 lines)
- Modify: `src/lib/i18n/{en,ur,roman-ur}.ts`

**Interfaces:**
- Consumes: the `logs` group Task 2 started; `<Latin>`, `<Fill>`, `useDictionary`
- Produces: the `logs` group, complete

Follow the nine steps above. Two things specific to this screen:

- It is a table of punches with hours and money. **Every cell holding a time, a
  duration, a rupee figure or an employee code needs `<Latin>`.** This is the
  single densest concentration of Latin content in the wave; a missed cell here
  is a number that reads wrong.
- 30 physical direction utilities is the most of any file. A table's column
  alignment is reading-flow and must convert; a fixed-position badge may not.

Commit:

```bash
git add src/lib/i18n "src/app/(app)/attendance/logs"
git commit -m "feat: translate the attendance log"
```

---

### Task 4: The check in/out register

**Files:**
- Modify: `src/app/(app)/attendance/register/page.tsx` (299 lines, ~22 strings, **14 physical direction utilities**)
- Modify: `src/lib/i18n/{en,ur,roman-ur}.ts`

**Interfaces:**
- Consumes: `common`, `<Latin>`, `<Fill>`
- Produces: a `register` group

Follow the nine steps. Specific to this screen: it shows who came in and when,
so it is almost entirely names and times — expect the `<Latin>` count to be
high relative to the string count.

Commit:

```bash
git add src/lib/i18n "src/app/(app)/attendance/register"
git commit -m "feat: translate the check in and out register"
```

---

### Task 5: The canteen

**Files:**
- Modify: `src/app/(app)/canteen/page.tsx` (119 lines)
- Modify: `src/app/(app)/canteen/counter-screen.tsx` (244 lines)
- Modify: `src/app/(app)/canteen/settings/page.tsx` (49 lines)
- Modify: `src/app/(app)/canteen/settings/meal-window-settings.tsx` (434 lines)
- Modify: `src/app/(app)/canteen/settings/actions.ts` (118 lines)
- Modify: `src/lib/i18n/{en,ur,roman-ur}.ts`

**Interfaces:**
- Consumes: `common`, `<Latin>`, `<Fill>`, the Task 2 action pattern
- Produces: `canteen` and `canteenSettings` groups

Follow the nine steps. Three things specific to the canteen:

- **This is the most floor-facing screen in the product.** The counter screen is
  operated by canteen staff and read by workers queuing. If any translation in
  the wave has to be plain rather than correct, it is this one.
- The one-meal-per-24-hours rule produces refusal messages a worker will read
  while being turned away. Translate those with care, and add every one of them
  to the uncertain-translation banner for the native reviewer.
- `meal-window-settings.tsx` is 434 lines of form. Times and window numbers are
  Latin; the labels around them are not.

Commit:

```bash
git add src/lib/i18n "src/app/(app)/canteen"
git commit -m "feat: translate the canteen counter and its settings"
```

---

### Task 6: The terminals

**Files:**
- Modify: `src/app/(app)/devices/page.tsx` (162 lines)
- Modify: `src/app/(app)/devices/device-dialog.tsx` (236 lines)
- Modify: `src/app/(app)/devices/[id]/page.tsx` (213 lines)
- Modify: `src/app/(app)/devices/[id]/device-controls.tsx` (65 lines)
- Modify: `src/app/(app)/devices/actions.ts` (222 lines, the most messages in the wave)
- Modify: `src/lib/i18n/{en,ur,roman-ur}.ts`

**Interfaces:**
- Consumes: `common`, `status.device` (**already exists from Wave 1 — do not
  re-add it**), `<Latin>`, `<Fill>`, the Task 2 action pattern
- Produces: a `devices` group

Follow the nine steps. Specific to the terminals:

- **Hardware identity is not translated.** Serial numbers, IP addresses, port
  numbers, firmware versions, MAC addresses and the model name "ZKTeco K50" are
  Latin in every language — wrap them, do not key them.
- `actions.ts` returns the most messages of any file in the wave, including a
  connection test whose result embeds a firmware string and a device clock.
  Those embedded values are Latin; the sentence around them is not. Use a
  `{placeholder}` and substitute, as Task 2 showed.
- `status.device` is already in the dictionary from Wave 1. Use it.

Commit:

```bash
git add src/lib/i18n "src/app/(app)/devices"
git commit -m "feat: translate the terminals list, detail and controls"
```

---

### Task 7: The live floor and Ask

**Files:**
- Modify: `src/app/(app)/devices/live/page.tsx` (124 lines)
- Modify: `src/app/(app)/assistant/page.tsx` (18 lines)
- Modify: `src/app/(app)/assistant/assistant-client.tsx` (29 lines)
- Modify: `src/components/assistant/assistant-conversation.tsx` (510 lines)
- Modify: `src/components/assistant/assistant-widget.tsx` (100 lines)
- Modify: `src/lib/i18n/{en,ur,roman-ur}.ts`

**Interfaces:**
- Consumes: `common`, `<Latin>`, `<Fill>`
- Produces: `liveFloor` and `ask` groups

Two unrelated screens in one task because the live floor is small (~6 strings)
and Ask is the last thing left.

Follow the nine steps. Specific to these:

- The live floor is a feed of punches: every row is a name, a terminal name and
  a time. Almost pure `<Latin>` content with a thin label around it.
- **Ask already has a language selector of its own**, in
  `assistant-conversation.tsx` — the one whose `bg-primary`/`bg-secondary`
  styling Wave 1 copied for the profile toggle. Read it before changing
  anything. It selects the language the *assistant answers in*, which is not
  the same thing as the language the *interface is written in*. Do not merge
  them, do not make one drive the other, and say in your report how you
  established which is which. Getting this wrong makes a person's whole app
  flip language when they wanted one answer in Urdu.
- Ask's own copy — its placeholder, its effort dial labels, its cost readout —
  is interface text and is translated. The assistant's *answers* are not; they
  come from the model.

Commit:

```bash
git add src/lib/i18n "src/app/(app)/devices/live" "src/app/(app)/assistant" src/components/assistant
git commit -m "feat: translate the live floor and Ask"
```

---

## What this wave does not do

- **It renders nothing.** As with Wave 1, no screen can be opened: Postgres will
  not start, so the RTL layout, the Nastaliq leading, the mirrored icons and the
  bidi isolation are all verified as code and none as pixels. The `line-height: 2`
  question Wave 1 left open stays open, and this wave adds a table-heavy screen
  and a kiosk screen to the list of things that want looking at.
- **It does not translate Wave 3's screens** — payroll, rates, reports, admin,
  roles. Those are the office's, and they are a separate plan.
- **It does not touch `src/components/ui/`.** Vendored primitives.
- **It does not resolve the nine banner-flagged Wave 1 translations.** Those
  want a native Urdu speaker from the factory, not an implementer.

## Definition of done

- `npm run typecheck && npm run lint && npm test && npm run build` clean.
- The three dictionaries have identical leaf-key path sets, no empty values,
  Urdu in Arabic script, Roman Urdu Latin-only.
- A sweep of every file in the table above finds no user-facing English string
  outside Next.js `metadata`, raw Postgres `error.message` passthroughs, and
  hardware identity.
- No physical direction utility remains in any converted file except ones a
  report names and justifies.
- Every screen in `navigationFor()` except payroll, rates, reports, users and
  roles reads in all three languages.
