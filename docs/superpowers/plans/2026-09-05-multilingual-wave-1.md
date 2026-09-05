# Multilingual Wave 1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let each person read the app in English, Urdu or Roman Urdu, proven on the dashboard, the attendance screen and their own profile.

**Architecture:** A typed dictionary — `en.ts` is the source of truth and the other two languages are annotated against it, so a missing key is a build error rather than a blank label. The language is a column on `profiles`, arrives through the existing session bootstrap with no extra query, and is read directly by server components; client components take it from one context provider seeded in the layout. Urdu alone gets `dir="rtl"` and the Nastaliq font; names, codes and numbers stay Latin and bidi-isolated in every language.

**Tech Stack:** Next.js 16 App Router, React 19, TypeScript with `exactOptionalPropertyTypes`, Tailwind 4, `next/font/google`, Supabase, vitest.

**Spec:** `docs/superpowers/specs/2026-09-05-multilingual-design.md`

## Global Constraints

- **Language codes are `en`, `ur`, `roman-ur`** — exactly the three already defined as `Language` in `src/components/assistant/assistant-conversation.tsx`. Do not invent a second set.
- **`en.ts` must NOT use `as const`.** `as const` would give `Dictionary` literal string types, forcing `ur.ts` to contain the same English strings. A plain object gives `string`, which is what makes the other two files typecheck.
- **`dir="rtl"` for `ur` only.** Roman Urdu is Urdu in Latin letters and reads left-to-right.
- **The Nastaliq font applies to `ur` only.** English and Roman Urdu keep Plus Jakarta Sans.
- **Names, employee codes, CNICs, money, times and dates stay Latin and bidi-isolated** in every language, via the `Latin` component. Never translate a person's name.
- **Numbers stay Western digits** (`1234`, not `۱۲۳۴`).
- **English stays every user's default.** The column defaults to `'en'`; nobody is switched automatically.
- **`exactOptionalPropertyTypes` is on.** Build optional fields by spreading, never assigning `undefined`.
- **Comments explain *why*, not *what*.**
- **Never edit an existing migration file.** New ones are named `20260906*`.
- **Local Postgres cannot start** — port 54322 is inside the OS-reserved range 54319–54418. Do NOT run `db:start`, `db:reset`, `db:types:local` or `db:types` (the last targets the linked REMOTE project). Migrations are written and read-verified only.
- **Verification:** `npm test`, `npm run typecheck`, `npm run lint`, `npm run build` all clean. There are currently 324 passing tests.

---

## Wave 1 scope

Three routes and the chrome around them: `/` (dashboard), `/attendance`, `/me/profile`, plus the sidebar, header and navigation labels.

`/attendance/logs` and `/attendance/register` are **Wave 2**, not Wave 1. Payroll, rates, reports and admin are **Wave 3**. A screen is either fully done — strings translated *and* Latin content wrapped *and* direction utilities converted — or not started. A half-converted screen is worse than an untouched one, because it looks finished.

---

## File Structure

**Created:**

| Path | Responsibility |
| --- | --- |
| `src/lib/i18n/en.ts` | The source of truth. Every key, in English. |
| `src/lib/i18n/ur.ts` | Urdu script, annotated `Dictionary` |
| `src/lib/i18n/roman-ur.ts` | Urdu in Latin letters, annotated `Dictionary` |
| `src/lib/i18n/index.ts` | `LanguageCode`, `resolveLanguage`, `dictionaryFor`, `directionFor` |
| `src/lib/i18n/index.test.ts` | Resolution, direction, completeness, no-empty-strings |
| `src/components/latin.tsx` | `<Latin>` — bidi-isolated Latin content |
| `src/components/language-provider.tsx` | Context for client components |
| `src/app/(app)/me/profile/language-toggle.tsx` | The three-way picker |
| `supabase/migrations/20260906090000_profile_language.sql` | `profiles.language` + `session_bootstrap()` |

**Modified:**

| Path | Change |
| --- | --- |
| `src/app/layout.tsx` | Nastaliq font; `lang` and `dir` from the session |
| `src/app/globals.css` | `--font-nastaliq`, the `font-latin` utility, Urdu line-height |
| `src/lib/auth/session.ts` | `SessionProfile.language` |
| `src/app/(app)/layout.tsx` | Wrap children in the provider |
| `src/components/app-shell.tsx` | Translated chrome; direction utilities |
| `src/lib/navigation.ts` | Labels become dictionary keys |
| `src/app/(app)/page.tsx` | Dashboard translated |
| `src/app/(app)/attendance/page.tsx` | Attendance translated |
| `src/app/(app)/me/profile/page.tsx` | Profile translated; toggle added |

---

## Task 1: The dictionary

**Files:**
- Create: `src/lib/i18n/en.ts`, `src/lib/i18n/ur.ts`, `src/lib/i18n/roman-ur.ts`, `src/lib/i18n/index.ts`, `src/lib/i18n/index.test.ts`

**Interfaces:**
- Consumes: nothing
- Produces: `type LanguageCode = "en" | "ur" | "roman-ur"`; `type Dictionary = typeof en`; `resolveLanguage(value: unknown): LanguageCode`; `dictionaryFor(language: LanguageCode): Dictionary`; `directionFor(language: LanguageCode): "ltr" | "rtl"`; `LANGUAGE_LABELS: Record<LanguageCode, string>`

- [ ] **Step 1: Write the failing test**

Create `src/lib/i18n/index.test.ts`:

```ts
import { describe, expect, it } from "vitest";

import en from "./en";
import roman from "./roman-ur";
import ur from "./ur";
import { dictionaryFor, directionFor, LANGUAGE_LABELS, resolveLanguage } from "./index";

/** Every leaf path in a nested dictionary, e.g. "nav.dashboard". */
function paths(value: unknown, prefix = ""): string[] {
  if (typeof value === "string") return [prefix];
  if (!value || typeof value !== "object") return [];
  return Object.entries(value).flatMap(([key, child]) =>
    paths(child, prefix ? `${prefix}.${key}` : key),
  );
}

describe("resolveLanguage", () => {
  it("accepts each of the three codes", () => {
    expect(resolveLanguage("en")).toBe("en");
    expect(resolveLanguage("ur")).toBe("ur");
    expect(resolveLanguage("roman-ur")).toBe("roman-ur");
  });

  /*
   * The value reaches this from two untrusted places: a profiles row written
   * before the column was constrained, and the browser at the toggle.
   */
  it.each([["urdu"], ["UR"], ["en-GB"], [""], [null], [undefined], [7], [{}]])(
    "falls back to English for %s",
    (value) => {
      expect(resolveLanguage(value)).toBe("en");
    },
  );
});

describe("directionFor", () => {
  it("is right-to-left for Urdu script only", () => {
    expect(directionFor("ur")).toBe("rtl");
  });

  it("keeps Roman Urdu left-to-right", () => {
    // Urdu written in Latin letters. Flipping it would be wrong, and this is
    // the case most likely to be got wrong by someone pattern-matching on
    // "Urdu".
    expect(directionFor("roman-ur")).toBe("ltr");
  });

  it("keeps English left-to-right", () => {
    expect(directionFor("en")).toBe("ltr");
  });
});

describe("dictionaryFor", () => {
  it("returns the matching dictionary", () => {
    expect(dictionaryFor("en")).toBe(en);
    expect(dictionaryFor("ur")).toBe(ur);
    expect(dictionaryFor("roman-ur")).toBe(roman);
  });
});

describe("the dictionaries agree", () => {
  const expected = paths(en).sort();

  it.each([
    ["ur", ur],
    ["roman-ur", roman],
  ])("%s has exactly the keys English has", (_name, dictionary) => {
    // TypeScript already catches a *missing* key through the Dictionary
    // annotation. This catches the reverse — a stale key left behind after a
    // rename — and names the offending path instead of failing structurally.
    expect(paths(dictionary).sort()).toEqual(expected);
  });

  it.each([
    ["en", en],
    ["ur", ur],
    ["roman-ur", roman],
  ])("%s has no empty strings", (_name, dictionary) => {
    // An empty string satisfies the type and renders as a blank label. It is
    // the one failure the type system cannot see.
    const blanks = paths(dictionary).filter((path) => {
      const value = path
        .split(".")
        .reduce<unknown>((node, key) => (node as Record<string, unknown>)[key], dictionary);
      return typeof value === "string" && value.trim() === "";
    });
    expect(blanks).toEqual([]);
  });

  it("labels every language in its own script", () => {
    expect(LANGUAGE_LABELS.en).toBe("English");
    expect(LANGUAGE_LABELS.ur).toBe("اردو");
    expect(LANGUAGE_LABELS["roman-ur"]).toBe("Roman Urdu");
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npm test -- i18n`
Expected: FAIL — cannot resolve `./en`.

- [ ] **Step 3: Write the English dictionary**

Create `src/lib/i18n/en.ts`. Cover the chrome plus the three Wave 1 screens.

**Do not add `as const`.** It would give every value a literal type, and `ur.ts` would then be required to contain the identical English string.

```ts
/**
 * Every user-facing string in Wave 1, in English.
 *
 * The source of truth: the other two languages are annotated against
 * `typeof` this object, so a key missing from either is a build error rather
 * than a blank label somebody finds on the floor.
 *
 * Deliberately not `as const` — literal types would force the translations to
 * repeat the English text to typecheck.
 */
const en = {
  nav: {
    dashboard: "Dashboard",
    attendance: "Attendance",
    checkInOut: "Check In / Out",
    attendanceLog: "Attendance Log",
    devices: "Biometric Devices",
    liveFloor: "Live Floor",
    rates: "Pay Rates",
    canteen: "Canteen",
    reports: "Reports",
    payroll: "Payroll",
    ask: "Ask",
    users: "User Accounts",
    roles: "Roles & Access",
    myProfile: "My Profile",
    signOut: "Sign out",
  },
  common: {
    save: "Save",
    saving: "Saving…",
    cancel: "Cancel",
    loading: "Loading…",
    nothingYet: "Nothing to show yet",
    today: "Today",
    hours: "Hours",
    present: "Present",
    absent: "Absent",
    onLeave: "On leave",
    late: "Late",
    checkedIn: "IN",
    checkedOut: "OUT",
  },
  dashboard: {
    title: "Your day at a glance",
    onSiteNow: "On site now",
    finishedToday: "Finished today",
    notInYet: "Not in yet",
    clockedInNotOut: "Clocked in, not yet out",
  },
  attendance: {
    title: "Attendance",
    subtitle: "Who is in today, and when they arrived",
    nobodyClockedIn: "Nobody is currently clocked in.",
    clockedOut: "Clocked out",
    noShift: "No shift",
    flexibleHours: "Flexible hours",
  },
  profile: {
    title: "My profile",
    subtitle: "Your record as the office holds it",
    fullName: "Name",
    employeeCode: "Employee code",
    cnic: "CNIC",
    phone: "Phone",
    email: "Email",
    designation: "Designation",
    department: "Department",
    site: "Factory",
    shift: "Shift",
    joinedOn: "Joined on",
    notRecorded: "Not recorded",
    language: "Language",
    languageHint: "Changes every screen. Names and numbers stay as they are.",
    languageSaved: "Language changed.",
    languageFailed: "Could not change the language.",
  },
};

export default en;
```

Read the three Wave 1 screens before finalising this — if a screen shows a string not covered above, add a key for it rather than leaving it in English.

- [ ] **Step 4: Write the two translations**

Create `src/lib/i18n/ur.ts` and `src/lib/i18n/roman-ur.ts`, each opening with the review banner below, then the same structure annotated `Dictionary`.

The banner is not decoration. A payroll app's vocabulary is where a plausible-but-wrong translation does real damage, and the terms listed are ones this factory has its own words for.

```ts
import type { Dictionary } from "./index";

/**
 * Urdu (اردو).
 *
 * ⚠️ NEEDS REVIEW BY A NATIVE URDU SPEAKER BEFORE THIS IS OFFERED AS A DEFAULT.
 *
 * Written to be natural rather than literal, but a factory has its own words
 * for its own trades. Check these first, because a dictionary-correct term
 * nobody on the floor uses is worse than leaving it in English:
 *   duty hours · overtime · grace period · flexible hours · shift ·
 *   contract firm · attendance · payroll · leave
 *
 * Names, employee codes, CNICs and money are NOT translated anywhere — see
 * the `Latin` component.
 */
const ur: Dictionary = {
  nav: {
    dashboard: "ڈیش بورڈ",
    attendance: "حاضری",
    // ... every key from en.ts
  },
  // ...
};

export default ur;
```

Write natural Urdu, not transliterated English. For Roman Urdu write it the way people actually type on a phone — `haazri`, `chutti`, `tankhwah` — not academic romanisation.

- [ ] **Step 5: Write the module**

Create `src/lib/i18n/index.ts`:

```ts
import en from "./en";
import roman from "./roman-ur";
import ur from "./ur";

/**
 * The three languages, using the codes the Ask assistant already defines in
 * `src/components/assistant/assistant-conversation.tsx`. One set of codes for
 * one set of languages — two would drift.
 */
export type LanguageCode = "en" | "ur" | "roman-ur";

/** The shape every dictionary must have. English is the source of truth. */
export type Dictionary = typeof en;

const DICTIONARIES: Record<LanguageCode, Dictionary> = { en, ur, "roman-ur": roman };

/** Each language named in its own script, for the picker. */
export const LANGUAGE_LABELS: Record<LanguageCode, string> = {
  en: "English",
  ur: "اردو",
  "roman-ur": "Roman Urdu",
};

/**
 * The language to actually use, given whatever was stored or submitted.
 *
 * Takes `unknown` because it is reached from two untrusted places: a profiles
 * row written before the column was constrained, and the browser at the
 * toggle. Anything unrecognised is English — the safe default, since English
 * is what the app was written in.
 */
export function resolveLanguage(value: unknown): LanguageCode {
  return value === "ur" || value === "roman-ur" || value === "en" ? value : "en";
}

export function dictionaryFor(language: LanguageCode): Dictionary {
  return DICTIONARIES[language];
}

/**
 * Urdu script reads right to left. Roman Urdu does not — it is Urdu written
 * in Latin letters, and flipping it would be wrong.
 */
export function directionFor(language: LanguageCode): "ltr" | "rtl" {
  return language === "ur" ? "rtl" : "ltr";
}
```

`ur.ts` imports `Dictionary` from `index.ts` while `index.ts` imports `ur.ts`. That circularity is fine — the import is type-only in one direction and TypeScript erases it.

- [ ] **Step 6: Run to verify it passes**

Run: `npm test -- i18n`
Expected: PASS. If the key-parity test fails, it names the offending path — fix the dictionary, not the test.

- [ ] **Step 7: Full suite, typecheck, lint**

Run: `npm test && npm run typecheck && npm run lint`
Expected: all clean.

- [ ] **Step 8: Commit**

```bash
git add src/lib/i18n
git commit -m "feat: add the English, Urdu and Roman Urdu dictionaries"
```

---

## Task 2: The language column

**Files:**
- Create: `supabase/migrations/20260906090000_profile_language.sql`

**Interfaces:**
- Consumes: `public.profiles`, `public.session_bootstrap()`
- Produces: `profiles.language`; `session_bootstrap()` returns it inside `profile`

- [ ] **Step 1: Read the function you are replacing**

Open `supabase/migrations/20260902090000_session_bootstrap.sql` and read `session_bootstrap()` in full. You are going to `create or replace` it, which **replaces the whole body** — anything not carried forward is silently lost, and this function is what every request's session is built from.

- [ ] **Step 2: Write the migration**

Create `supabase/migrations/20260906090000_profile_language.sql`:

```sql
-- ============================================================================
-- Each person reads the app in their own language.
--
-- On profiles rather than in a cookie or local storage: the preference should
-- follow the person to whatever phone or terminal they sign in on, and the
-- session already loads their profile once per request, so this costs no
-- extra query.
-- ============================================================================

alter table public.profiles
  add column language text not null default 'en'
    check (language in ('en', 'ur', 'roman-ur'));

comment on column public.profiles.language is
  'Interface language. Codes match the Ask assistant''s. Defaults to English: nobody is switched automatically, and the translations are reviewed before being offered as a default.';
```

Then `create or replace function public.session_bootstrap()` — reproducing the body you read in Step 1 **verbatim**, with `language` added to the profile select list:

```sql
          select id, employee_code, full_name, email, photo_url, designation,
                 site_id, department_id, pay_class, requires_attendance,
                 language, roles_changed_at
            from public.profiles
           where id = auth.uid()
```

Every other line of the function — its signature, `security definer`, `set search_path`, the roles aggregate, the permissions aggregate, the closing `where` — is carried across unchanged. Add a short comment above the function saying only the profile select list changed, so the next person does not diff two large blocks to find out.

- [ ] **Step 3: Verify by reading**

The local Postgres cannot start (port 54322 is inside the OS-reserved range 54319–54418), so this cannot be applied. Instead, diff your reproduction against the original by eye, line by line, and state in your report that you did.

Do **not** run `db:reset`, `db:types:local` or `db:types`. Do **not** hand-edit `src/lib/supabase/database.types.ts`.

- [ ] **Step 4: Typecheck and test**

Run: `npm run typecheck && npm test`
Expected: clean; nothing reads the column yet.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/20260906090000_profile_language.sql
git commit -m "feat: store each person's interface language on their profile"
```

---

## Task 3: Carry the language through the session

**Files:**
- Modify: `src/lib/auth/session.ts`

**Interfaces:**
- Consumes: `resolveLanguage` from `@/lib/i18n`; `language` from `session_bootstrap()`
- Produces: `SessionProfile.language: LanguageCode`

- [ ] **Step 1: Add it to the types**

In `src/lib/auth/session.ts`, add to `SessionProfile`:

```ts
  /** Interface language. Always one of the three; never whatever was stored. */
  language: LanguageCode;
```

and to `BootstrapPayload`'s `profile` shape:

```ts
    language: string | null;
```

`string | null` there because it describes what the RPC returns — a row written before the column existed would have no value, and the guard below is what turns that into a usable code.

Import at the top:

```ts
import { resolveLanguage, type LanguageCode } from "@/lib/i18n";
```

- [ ] **Step 2: Resolve it where the profile is built**

Find where `loadSession` maps the bootstrap payload into `SessionProfile` and add:

```ts
      language: resolveLanguage(payload.profile.language),
```

Through `resolveLanguage`, never assigned directly. The column is constrained now, but rows written before the constraint — and the `string | null` the RPC is typed as — mean the value is not guaranteed to be one of the three, and every screen in the app is about to index a dictionary with it.

- [ ] **Step 3: Typecheck, lint, test**

Run: `npm run typecheck && npm run lint && npm test`
Expected: all clean. `database.types.ts` still lacks the column, so if the RPC's typed shape rejects `language`, read how the file already handles `BootstrapPayload` — it declares its own interface rather than using the generated type, precisely so the RPC's `Json` return does not have to be cast at every use.

- [ ] **Step 4: Commit**

```bash
git add src/lib/auth/session.ts
git commit -m "feat: carry the interface language on the session"
```

---

## Task 4: The font, the direction, and Latin content

**Files:**
- Modify: `src/app/layout.tsx`
- Modify: `src/app/globals.css`
- Create: `src/components/latin.tsx`

**Interfaces:**
- Consumes: `directionFor`, `resolveLanguage` from `@/lib/i18n`; `getSession` from `@/lib/auth/session`
- Produces: `<Latin>{children}</Latin>`; the `font-latin` utility; `--font-nastaliq`

- [ ] **Step 1: Load the font and set the direction**

In `src/app/layout.tsx`, beside the existing `Plus_Jakarta_Sans` import:

```ts
import { Noto_Nastaliq_Urdu, Plus_Jakarta_Sans } from "next/font/google";

const notoNastaliqUrdu = Noto_Nastaliq_Urdu({
  subsets: ["arabic"],
  weight: ["400", "500", "600", "700"],
  display: "swap",
  variable: "--font-nastaliq",
});
```

Loaded through `next/font/google`, **not** from `Noto_Nastaliq_Urdu.zip` in the repository root. Google's copy is self-hosted at build time, subsetted, and carries a `size-adjust` descriptor that removes the layout shift a late font causes. The zip gives up all three and adds 2.8 MB to the repository permanently — **delete it in this task**.

Then add these two imports beside the existing ones:

```ts
import { getSession } from "@/lib/auth/session";
import { directionFor } from "@/lib/i18n";
```

`getSession`, not `requireSession`: this layout also renders `/login`, where
nobody is signed in and `requireSession` would redirect into a loop.

Then make the root layout read the session and set `lang` and `dir`:

```tsx
export default async function RootLayout({ children }: { children: ReactNode }) {
  /*
   * Read here rather than in the (app) layout because `<html>` lives here, and
   * `dir` has to be on it. This layout also covers /login, where there is no
   * session — `getSession()` returns null and English is used, which is right
   * for a sign-in page nobody has identified themselves on yet.
   */
  const session = await getSession();
  const language = session?.profile.language ?? "en";

  return (
    <html
      lang={language === "roman-ur" ? "ur-Latn" : language}
      dir={directionFor(language)}
      className={`${plusJakartaSans.variable} ${notoNastaliqUrdu.variable}`}
      data-language={language}
    >
      <body>{/* unchanged */}</body>
    </html>
  );
}
```

`ur-Latn` is the correct BCP 47 tag for Urdu in Latin script; screen readers and spellcheckers use it. `data-language` is what the stylesheet keys the Urdu font off in the next step.

`getSession()` is wrapped in React's `cache`, so this shares the round trip the `(app)` layout already makes rather than adding one. It does make the root layout dynamic — acceptable here because the last build showed everything except `/icon.svg` is already dynamic.

- [ ] **Step 2: Wire the fonts in CSS**

In `src/app/globals.css`, beside the existing `--font-sans` (around line 52):

```css
  /* --font-nastaliq is injected by next/font in src/app/layout.tsx */
  --font-urdu: var(--font-nastaliq), var(--font-plus-jakarta), serif;
```

Then, after the existing `body { font-family: var(--font-sans); }` rule (around line 126):

```css
/*
 * Urdu script only. Roman Urdu is Latin letters and keeps the Latin face —
 * Nastaliq's Latin coverage is not its purpose.
 */
[data-language="ur"] body {
  font-family: var(--font-urdu);
  /*
   * Nastaliq is calligraphic and occupies far more vertical space than a Latin
   * face at the same size. Without extra leading the descenders of one line
   * collide with the next.
   */
  line-height: 2;
}

/*
 * Content that is Latin whatever the interface language: names, employee
 * codes, CNICs, money, times, dates. Wins over the document font in Urdu and
 * is a no-op in the other two languages.
 */
.font-latin {
  font-family: var(--font-sans);
  line-height: normal;
}
```

- [ ] **Step 3: Write the Latin component**

Create `src/components/latin.tsx`:

```tsx
import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

/**
 * Content that stays Latin whatever the interface language — a person's name,
 * an employee code, a CNIC, money, a time, a date.
 *
 * Two problems, and the second corrupts what the screen says.
 *
 * The font: Nastaliq is a Perso-Arabic face whose Latin coverage is not its
 * purpose, so `RD-1042` set in it would look nothing like the same code on the
 * payslip or the terminal display it is being checked against.
 *
 * The direction: inside a right-to-left paragraph, digits are weak-directional
 * and hyphens are neutral under the Unicode bidirectional algorithm, so
 * `RD-1042` can be reordered **on display** to `1042-RD`. Nothing in the
 * database changes; the screen simply shows a different code from the one
 * stored. `<bdi>` isolates the run so the surrounding direction cannot reach
 * it, and `dir="ltr"` states the direction outright rather than leaving it to
 * be inferred from a first strong character a number does not have.
 */
export function Latin({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <bdi dir="ltr" className={cn("font-latin", className)}>
      {children}
    </bdi>
  );
}
```

- [ ] **Step 4: Delete the font zip**

```bash
git rm Noto_Nastaliq_Urdu.zip
```

If it is untracked rather than tracked, delete it with `rm` and say so in your report.

- [ ] **Step 5: Typecheck, lint, build**

Run: `npm run typecheck && npm run lint && npm run build`
Expected: all clean. The build is what proves `next/font/google` can fetch and subset Noto Nastaliq Urdu — if it fails there, the font name or the `subsets` value is wrong, and the correct subset for this face is `arabic`.

- [ ] **Step 6: Commit**

```bash
git add src/app/layout.tsx src/app/globals.css src/components/latin.tsx
git rm --cached Noto_Nastaliq_Urdu.zip 2>/dev/null || true
git commit -m "feat: load Nastaliq for Urdu and keep names and numbers Latin"
```

---

## Task 5: The provider and the toggle

**Files:**
- Create: `src/components/language-provider.tsx`
- Create: `src/app/(app)/me/profile/language-toggle.tsx`
- Create: `src/app/(app)/me/profile/actions.ts`
- Modify: `src/app/(app)/layout.tsx`

**Interfaces:**
- Consumes: `dictionaryFor`, `resolveLanguage`, `LANGUAGE_LABELS`, `type LanguageCode`, `type Dictionary` from `@/lib/i18n`
- Produces: `<LanguageProvider language={...}>`; `useDictionary(): Dictionary`; `useLanguage(): LanguageCode`; `setLanguage(prev, form): Promise<{ ok: boolean; message: string }>`

- [ ] **Step 1: Write the provider**

Create `src/components/language-provider.tsx`:

```tsx
"use client";

import { createContext, useContext, type ReactNode } from "react";

import { dictionaryFor, type Dictionary, type LanguageCode } from "@/lib/i18n";

/**
 * The language, for client components.
 *
 * Server components call `dictionaryFor` directly — they already hold the
 * session. This exists for the 62 client components that do not, and is a
 * context rather than a prop because a prop every component needs is a
 * context wearing a disguise.
 */
const LanguageContext = createContext<LanguageCode>("en");

export function LanguageProvider({
  language,
  children,
}: {
  language: LanguageCode;
  children: ReactNode;
}) {
  return <LanguageContext.Provider value={language}>{children}</LanguageContext.Provider>;
}

export function useLanguage(): LanguageCode {
  return useContext(LanguageContext);
}

export function useDictionary(): Dictionary {
  return dictionaryFor(useContext(LanguageContext));
}
```

- [ ] **Step 2: Seed it from the layout**

In `src/app/(app)/layout.tsx`, wrap the shell:

```tsx
  return (
    <LanguageProvider language={session.profile.language}>
      <AppShell session={session}>{children}</AppShell>
    </LanguageProvider>
  );
```

- [ ] **Step 3: Write the action**

Create `src/app/(app)/me/profile/actions.ts`.

**This file was deliberately deleted by an earlier project** — the one that made
the profile read-only and removed self-service password change. Re-creating it
is not a regression and not a reversal of that decision: it holds exactly one
action, `setLanguage`, and nothing else. The profile page stays read-only for
every field the office owns. Language is the single thing a person may change
about their own record, and it was asked for.

Say this in your report, because a reviewer seeing a deleted file return will
otherwise reasonably flag it.

```ts
"use server";

import { revalidatePath } from "next/cache";

import { requireSession } from "@/lib/auth/session";
import { resolveLanguage } from "@/lib/i18n";
import { createClient } from "@/lib/supabase/server";

export interface LanguageResult {
  ok: boolean;
  message: string;
}

/**
 * Changes the signed-in person's interface language.
 *
 * Scoped to `auth.uid()` rather than to a submitted id: this is the one field
 * a person may change about themselves, and taking the target from the form
 * would let anyone restyle anyone else's app.
 */
export async function setLanguage(_prev: LanguageResult, form: FormData): Promise<LanguageResult> {
  const session = await requireSession();
  const language = resolveLanguage(form.get("language"));

  const supabase = await createClient();
  const { error } = await supabase
    .from("profiles")
    .update({ language })
    .eq("id", session.userId);

  if (error) return { ok: false, message: error.message };

  // Every screen renders from this, so the whole tree is stale, not one route.
  revalidatePath("/", "layout");
  return { ok: true, message: "Language changed." };
}
```

`guard_profile_self_update()` strips pay, placement and employment columns from a self-edit and leaves `language` alone, so this needs no policy change — confirm that by reading the trigger in `supabase/migrations/20260814090300_rls.sql` before assuming it.

- [ ] **Step 4: Write the toggle**

Create `src/app/(app)/me/profile/language-toggle.tsx` as a client component. Follow the pattern `src/app/(app)/rates/people-pay.tsx` uses — a form ref, `startTransition`, `toast`, `router.refresh()` — rather than inventing another.

Three buttons, each labelled from `LANGUAGE_LABELS` so اردو appears in Urdu script even while the interface is English. Mark the current one selected using the `bg-primary` / `bg-secondary` split the language selector in `src/components/assistant/assistant-conversation.tsx` already uses.

- [ ] **Step 5: Typecheck, lint, test, build**

Run: `npm run typecheck && npm run lint && npm test && npm run build`
Expected: all clean.

- [ ] **Step 6: Commit**

```bash
git add src/components/language-provider.tsx "src/app/(app)/me/profile" "src/app/(app)/layout.tsx"
git commit -m "feat: let each person choose their interface language"
```

---

## Task 6: Translate the three screens

**Files:**
- Modify: `src/lib/navigation.ts`
- Modify: `src/components/app-shell.tsx`
- Modify: `src/app/(app)/page.tsx`
- Modify: `src/app/(app)/attendance/page.tsx`
- Modify: `src/app/(app)/me/profile/page.tsx`

**Interfaces:**
- Consumes: everything from Tasks 1–5
- Produces: nothing

- [ ] **Step 1: Make navigation labels keys**

`src/lib/navigation.ts` currently hardcodes English `label` and `description`. Change each to a dictionary key path — `labelKey: "nav.dashboard"` — and resolve it where the menu renders, so the list stays a plain data structure that can cross the server/client boundary.

Do **not** import the dictionary into `navigation.ts` itself: its comment explains that `icon` is a string rather than a component precisely because this list is built on the server and handed to a client component.

- [ ] **Step 2: Translate the chrome**

`src/components/app-shell.tsx`: replace hardcoded strings with `useDictionary()`, and wrap the signed-in person's name in `<Latin>`.

While in this file, convert its direction utilities — it holds the sidebar and the header, which is where a wrong one is most visible:

| Physical | Logical |
| --- | --- |
| `pl-` / `pr-` | `ps-` / `pe-` |
| `ml-` / `mr-` | `ms-` / `me-` |
| `left-` / `right-` | `start-` / `end-` |
| `rounded-l-` | `rounded-s-` |

**Not all of them.** Leave physical any position that is not part of the reading flow — a decorative element pinned to a visual corner, an icon whose placement is not direction-dependent. Each is a judgement; say in your report which you left and why.

- [ ] **Step 3: Translate the three screens**

For `src/app/(app)/page.tsx`, `src/app/(app)/attendance/page.tsx` and `src/app/(app)/me/profile/page.tsx`:

- Server components: `const t = dictionaryFor(session.profile.language)`.
- Client components beneath them: `useDictionary()`.
- Wrap in `<Latin>`: every person's name, employee code, CNIC, phone number, rupee figure, hour count, time and date.
- Convert direction utilities as in Step 2.

A screen is done when all four are done. A screen with translated headings but an unwrapped employee code is not half-done — it is broken in Urdu, because the code can display reordered.

- [ ] **Step 4: Typecheck, lint, test, build**

Run: `npm run typecheck && npm run lint && npm test && npm run build`
Expected: all clean.

- [ ] **Step 5: Commit**

```bash
git add src/lib/navigation.ts src/components/app-shell.tsx "src/app/(app)/page.tsx" "src/app/(app)/attendance/page.tsx" "src/app/(app)/me/profile/page.tsx"
git commit -m "feat: translate the dashboard, attendance and profile screens"
```

---

## Notes for the implementer

**`en.ts` must not use `as const`.** It is the single mistake that makes this whole approach not work: literal types would require the translations to contain the English text to typecheck.

**Roman Urdu is left-to-right.** The one thing most likely to be got wrong by pattern-matching on the word "Urdu".

**A wrapped code matters more than a translated heading.** An unwrapped `RD-1042` in a right-to-left page can display as `1042-RD`. The database is fine; the screen lies. That is worse than an untranslated label, which is merely unhelpful.

**The migrations cannot be applied.** Port 54322 is inside the OS-reserved range 54319–54418. Write and read-verify; do not run `db:reset` or regenerate types.
