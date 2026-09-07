# English, Urdu and Roman Urdu across the whole app

**Date:** 2026-09-05
**Status:** Approved design, not yet implemented

## Why

Most of the people this app is built for are not comfortable in English, and
some are not confident readers at all. The Ask assistant already answers in
Urdu, Roman Urdu or English — but every label, button, heading and error around
it is English only, so a worker who can ask a question in Urdu still cannot read
the screen the answer arrives on.

Each person picks their own language and the whole interface follows.

## What this is measured against

Numbers taken from the codebase rather than estimated, because the two that
matter are both routinely underestimated:

| | Count |
| --- | --- |
| `.tsx` files under `src/app/(app)` and `src/components` | 107 |
| Lines in those files | ~15,900 |
| Translatable strings (conservative heuristic) | ~420 |
| Translatable strings (realistic, incl. multi-line JSX and conditionals) | 600–900 |
| Physical direction utilities needing RTL conversion | ~118 |

The string count times two extra languages is roughly **1,400 translations**.
The 118 direction utilities are the RTL work, and they are the part that looks
free until someone opens the app in Urdu and finds the sidebar on the wrong
side of a half-mirrored screen.

Encouragingly, `text-left`, `text-right`, `border-l`, `border-r` and
`rounded-r` are all **zero** — alignment is mostly default, so the conversion is
padding, margin and absolute positioning rather than typography.

## Decisions already taken

Four, settled before this spec:

- **Three languages**, reusing the codes the Ask assistant already defines in
  `src/components/assistant/assistant-conversation.tsx`: `en`, `ur`,
  `roman-ur`. Inventing a second set of codes for the same three languages
  would guarantee they drift.
- **Per person**, stored on their profile and remembered.
- **Names never translate.** Stored once, shown as-is, in every language.
- **A typed dictionary, no library.**

## Section 1 — Why a dictionary and not next-intl

`next-intl` is the obvious choice and is the wrong one here.

Its central feature is locale routing — `/en/attendance`, `/ur/attendance` —
with the locale in the URL and middleware to negotiate it. This app wants the
opposite: the preference belongs to the person, travels with their session, and
should not change any URL. Adopting next-intl would mean either fighting its
routing model or accepting locale-prefixed URLs nobody asked for, and carrying a
dependency for plural and date handling this app barely uses.

The alternative is small:

```
src/lib/i18n/
  en.ts          the source of truth
  ur.ts          Urdu script
  roman-ur.ts    Urdu in Latin letters
  index.ts       resolution, types, the dictionary map
```

`en.ts` exports a nested object of strings. The other two are typed against it:

```ts
import type en from "./en";
export type Dictionary = typeof en;

const ur: Dictionary = { ... };
```

That one annotation is the whole safety story. A key missing from `ur.ts`, or
misspelled, is a **build error** — not a blank label discovered by a worker on
the floor. A database-backed alternative was considered and rejected for exactly
this: it would turn every missing string into a runtime blank and put a database
read behind every label.

## Section 2 — How a screen gets its language

The session already loads the profile once per request and caches it for the
whole render (`src/lib/auth/session.ts`). Language rides along with it.

- **Schema:** `profiles.language text not null default 'en'`, constrained to the
  three codes. Default `'en'` so every existing row is valid the moment the
  column exists.
- **Session:** `SessionProfile` gains `language`, read by
  `session_bootstrap()` alongside everything else — no extra query.
- **Server components** take the dictionary directly:
  `const t = dictionaryFor(session.profile.language)`.
- **Client components** read it from a context provider seeded once in the
  `(app)` layout from the same value. A provider rather than prop-drilling
  because the alternative is threading `t` through 62 components, and a prop
  that every component needs is a context.

`src/lib/i18n/index.ts` exports four things and nothing else:

```ts
export type LanguageCode = "en" | "ur" | "roman-ur";

/** Falls back to English for an unknown, absent or malformed value. */
export function resolveLanguage(value: unknown): LanguageCode;

export function dictionaryFor(language: LanguageCode): Dictionary;

/** "rtl" for `ur` only — Roman Urdu is Latin script and reads left-to-right. */
export function directionFor(language: LanguageCode): "ltr" | "rtl";
```

`resolveLanguage` takes `unknown` because the value reaches it from two
untrusted places: a database column that predates the constraint on any row
written before this migration, and the browser at the toggle.

The `(app)` layout also sets, on the `<html>` element:

- `lang` — `en`, `ur` or `ur-Latn` for Roman Urdu (the correct BCP 47 tag for
  Urdu in Latin script; screen readers and spellcheckers use it).
- `dir` — `rtl` for `ur` only. **Roman Urdu is left-to-right**: it is Urdu
  written in Latin letters, and flipping it would be wrong.

## Section 3 — Right-to-left

`dir="rtl"` on the document does most of the work *if* the CSS uses logical
properties. Tailwind's `ps-`/`pe-`/`ms-`/`me-`/`start-`/`end-` follow the text
direction; `pl-`/`pr-`/`ml-`/`mr-`/`left-`/`right-` do not.

So the ~118 physical utilities are converted:

| Physical | Logical |
| --- | --- |
| `pl-4` / `pr-4` | `ps-4` / `pe-4` |
| `ml-auto` / `mr-2` | `ms-auto` / `me-2` |
| `left-3` / `right-5` | `start-3` / `end-5` |
| `rounded-l-2xl` | `rounded-s-2xl` |

**Not every one should be converted**, and this is where a mechanical
find-and-replace would break things. A physical property is correct wherever the
thing being positioned is not part of the reading flow — a spinner centred with
`left-1/2`, a decorative element pinned to a visual corner, an icon inside a
control whose position is not direction-dependent. Each occurrence is a
judgement, which is why this is spread across waves rather than done in one
sweep.

Directional **icons** flip too: a back arrow must point right in Urdu. Icons
whose meaning is not directional — a fingerprint, a clock — do not.

### Numbers and dates stay Western

Urdu can be written with Eastern Arabic numerals (۱۲۳). This app will not use
them.

Pakistani business, payroll and banking run on Western digits; an employee code,
a CNIC and a rupee figure are read and cross-checked against payslips, bank
records and the biometric terminal's own display, none of which will be
localised. A worker checking `₨32,258` against a printed slip must see the same
glyphs. Dates likewise stay in the existing format.

## Section 4 — The font

**Noto Nastaliq Urdu, loaded through `next/font/google`** — not from the
`Noto_Nastaliq_Urdu.zip` in the repository root.

`next/font/google` self-hosts the file, subsets it, and emits a `size-adjust`
descriptor that removes the layout shift a late-loading font causes. Committing
2.8 MB of TTFs would give up all three and add the weight to the repository
permanently. **The zip should be deleted once this lands.**

The font applies only when the language is `ur`. English and Roman Urdu are
Latin script and keep Plus Jakarta Sans — rendering Roman Urdu in a Nastaliq
face would be actively worse, since Nastaliq's Latin coverage is not its
purpose.

Nastaliq is a calligraphic style with far more vertical extent than a Latin
face: the same point size occupies noticeably more height, and lines need more
leading. The Urdu stylesheet therefore sets its own `line-height`, and the wave
that introduces the font checks the screens for clipping rather than assuming
the existing spacing holds.

### Names and numbers stay Latin, in the Latin font

Even in Urdu, a person's name, an employee code, a CNIC, a rupee figure, a time
and a date render in **Plus Jakarta Sans, left-to-right** — never in Nastaliq.

Two separate reasons, and the second is a real bug rather than a preference.

**The font.** Nastaliq is a Perso-Arabic face; its Latin coverage is not its
purpose. `Muhammad Umar Riaz` set in it would fall back to some other face
anyway, inconsistently, and `RD-1042` would look nothing like the same code on
the payslip or the terminal display it is being checked against.

**The direction.** This is the part that silently corrupts data on screen. In a
right-to-left paragraph, digits are weak-directional and hyphens are neutral
under the Unicode bidirectional algorithm, so a mixed run like `RD-1042` can be
**reordered on display to `1042-RD`**. Nothing in the database changes; the
screen simply shows a different employee code from the one stored. A worker
reading their own code back to the office would read it wrong, and nobody would
be able to reproduce it from the data.

The fix is bidi **isolation**, not merely alignment. A single component:

```tsx
/**
 * Content that is Latin whatever the interface language — a person's name, an
 * employee code, a CNIC, money, a time, a date.
 *
 * `<bdi>` isolates the run from the surrounding paragraph's direction, so a
 * code like RD-1042 cannot be reordered to 1042-RD by the bidi algorithm when
 * the page is right-to-left. `dir="ltr"` states the direction outright rather
 * than leaving it to be inferred from the first strong character — a string
 * beginning with a digit has none.
 */
export function Latin({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <bdi dir="ltr" className={cn("font-latin", className)}>
      {children}
    </bdi>
  );
}
```

`font-latin` is a Tailwind utility bound to the Plus Jakarta Sans variable, so
it wins over the document font in Urdu and is a no-op in the other two
languages.

Every name, code, CNIC, money figure, time and date goes through it. That is a
large number of call sites, and it is why the waves are scoped by screen: each
wave converts the strings *and* wraps the Latin content on its own screens, so
neither job is left half-done on a page somebody is using.

## Section 5 — Translation quality, and what is honestly uncertain

I write all three languages. English is authoritative; Urdu and Roman Urdu are
written to be natural rather than literal.

**Every language file carries a review banner** naming the terms most likely to
be wrong, because a payroll app's vocabulary is where a plausible translation
does real damage. "Overtime ceiling", "duty hours", "flexible hours",
"contract firm", "grace period" and "per-minute late penalty" are terms this
factory has its own words for, and a dictionary-correct rendering that nobody on
the floor uses is worse than English.

**English stays every user's default** until a native Urdu speaker has reviewed
those two files. The toggle works from day one; nobody is switched
automatically. This is deliberate: shipping unreviewed Urdu as the default would
put unverified wording in front of people making pay decisions.

## Section 6 — Rollout in waves

The machinery ships with a small, proven set of screens; the rest follows.

**Wave 1 — machinery and three screens**
The dictionary, the schema column, session plumbing, the context provider, the
`dir`/`lang` switching, the font, and the language toggle. Applied to exactly three routes: `/` (the
dashboard), `/attendance` and `/me/profile` — chosen because between them they
cover a data-dense page, a table-heavy page and a plain read-only page, so the
RTL conversion meets each shape once. `/attendance/logs` and
`/attendance/register` are Wave 2, not Wave 1.

**Wave 2 — the floor's screens**
Attendance log, check in/out, canteen, devices, live floor, Ask.

**Wave 3 — the office's screens**
Payroll, rates, reports, admin, roles.

Each wave is separately reviewable, and a mistake in the conversion affects one
wave rather than 107 files at once. Waves 2 and 3 are separate plans; **this
spec covers Wave 1**, plus the shared decisions the later waves inherit.

## Section 7 — Testing

The dictionary is pure data and pure functions, and that is where the tests go:

- **`src/lib/i18n/index.test.ts`** — `dictionaryFor` returns the right
  dictionary for each of the three codes, and falls back to English for an
  unknown, absent or malformed value (the language arrives from a database
  column and, at the toggle, from the browser). `directionFor` returns `rtl`
  only for `ur`, and `ltr` for `roman-ur` — the case most likely to be got
  wrong, since it is Urdu that is not right-to-left.
- **A completeness test** — every key in `en.ts` exists in `ur.ts` and
  `roman-ur.ts`, and no file has extra keys. TypeScript already catches missing
  keys through the `Dictionary` annotation; this catches the reverse, and gives
  a readable failure naming the key instead of a structural type error.
- **An empty-string test** — no value in any dictionary is an empty string. An
  empty string satisfies the type and renders as a blank label, which is the one
  failure the type system cannot see.

`Latin` is a five-line component whose whole job is two attributes, so it gets
no unit test — a jsdom assertion that `<bdi dir="ltr">` renders would be
asserting the JSX back to itself. What it exists to prevent is verified by
looking at an employee code and a rupee figure on an Urdu screen and confirming
they read in the same order as on the English one.

RTL layout and the font are visual and are verified by looking at the three
Wave 1 screens in each language — a jsdom assertion that `dir="rtl"` is present
tests the attribute, not whether the screen is usable.

## Not in this project

**Translating employee names.** Settled earlier and recorded here so it is not
revisited: names are stored once and shown as-is. Automatic transliteration
mangles Pakistani names, and a worker seeing their own name spelled wrong is a
worse outcome than seeing it in Latin script.

**Translating data.** Department names, designations, shift names, leave types
and note text are data the factory typed, not interface strings. They render as
stored. Translating them would mean a second column per language on five tables
and an editing burden on the office for every row.

**Waves 2 and 3.** Their own plans, after Wave 1 proves the pattern.
