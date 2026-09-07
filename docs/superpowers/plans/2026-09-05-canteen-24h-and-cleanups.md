# Canteen 24-Hour Rule and Five Cleanups Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Enforce one meal per person per 24 hours at a canteen terminal, and clear five pieces of UI that are no longer wanted.

**Architecture:** The 24-hour guarantee stays in the database, matching how the canteen was built — a `BEFORE INSERT` trigger on `meal_claims` raises `unique_violation`, so the ingest's existing "insert first and let the database answer" pattern keeps working untouched. `decideMealScan` stops refusing scans that fall outside a serving window. The five cleanups are deletions and small layout changes.

**Tech Stack:** Next.js 16 App Router, React 19, TypeScript with `exactOptionalPropertyTypes`, Supabase (Postgres + RLS + generated types), vitest, Tailwind 4.

**Spec:** `docs/superpowers/specs/2026-09-05-canteen-24h-cleanups-and-antrosys-design.md`

## Global Constraints

- **Never edit an existing migration file.** Add new ones, named `20260905*`, applying after `20260904090700_guard_payroll_inserts.sql`.
- **The 24-hour rule is enforced in the database, not in application code.** The canteen was deliberately built this way — `20260830140000_canteen.sql` says so in its header — because two terminals, a replayed buffer and a retried request all have to collapse to one meal.
- **The trigger raises `unique_violation` (SQLSTATE 23505) deliberately.** `src/lib/canteen/ingest.ts` already catches 23505 and reports `duplicate`. Raising anything else silently turns a duplicate into a 500.
- **A repeat scan is a `duplicate`, never a refusal.** `duplicate` already exists in the `meal_scan_outcome` enum.
- **`exactOptionalPropertyTypes` is on.** Build optional fields by spreading, never by assigning `undefined`.
- **Comments explain *why*, not *what*.**
- **Local Supabase is currently unavailable** — port 54322 sits inside the OS-reserved range 54319–54418, so `supabase start`, `db:reset` and `db:types:local` all fail. Migrations in this plan are therefore **written and read-verified, not applied**. Do not attempt them; do not hand-edit `src/lib/supabase/database.types.ts` to compensate.
- **Never run bare `npm run db:types`** — it targets the linked REMOTE project.
- **Verification:** `npm test`, `npm run typecheck`, `npm run lint` must all be clean. There are currently 321 passing tests.

---

## Ruling carried from the spec

The user's instruction was: *"if the biometric device is punched enter it; if it is punched again in 24 hours it should not be counted as duplicated — make it 24 instead of 12."*

Read literally, "punch it and it enters" means a serving window must no longer be able to refuse a scan. So **windows stop deciding whether someone may eat** and become a label for which sitting a meal belonged to.

Two consequences, both deliberate:

- `meal_claims.meal_window_id` becomes **nullable** — a meal eaten at 03:00 when no window covers it is still a meal, recorded with no window.
- `outside_window` **stays in the `meal_scan_outcome` enum** even though nothing produces it any more. Postgres cannot cleanly drop an enum value, historical `meal_scan_log` rows already carry it, and the counter screen still needs its label to render that history.

---

## File Structure

**Created:**

| Path | Responsibility |
| --- | --- |
| `supabase/migrations/20260905090000_meal_once_per_24h.sql` | Nullable window, drop the old unique constraint, the interval index, the 24-hour trigger |
| `docs/antrosys-contract-setup.md` | The operational steps for Antrosys — deliberately not code |

**Modified:**

| Path | Change |
| --- | --- |
| `src/lib/canteen/meals.ts` | `decideMealScan` stops returning `outside_window` |
| `src/lib/canteen/meals.test.ts` | Replace the outside-window refusal test; add the boundary cases |
| `src/lib/canteen/ingest.ts` | Allow a claim with no window |
| `src/lib/navigation.ts` | Remove the registers entry |
| `src/components/app-shell.tsx` | Sidebar scrolls independently |
| `src/app/(app)/devices/[id]/page.tsx` | Remove the enrolment panel; IN / OUT wording |
| `src/app/(app)/devices/live/page.tsx` | IN / OUT wording beside the arrow |
| `src/app/(app)/me/profile/page.tsx` | Read-only details |

**Deleted:**

| Path |
| --- |
| `src/app/(app)/admin/registers/` (whole directory) |
| `src/app/(app)/devices/[id]/enrollment-manager.tsx` |
| `src/app/(app)/me/profile/profile-forms.tsx` and `actions.ts` |

---

## Task 1: The 24-hour guarantee

**Files:**
- Create: `supabase/migrations/20260905090000_meal_once_per_24h.sql`

**Interfaces:**
- Consumes: `public.meal_claims` from `20260830140000_canteen.sql`
- Produces: a `BEFORE INSERT` trigger raising SQLSTATE 23505 when a claim exists within 24 hours; `meal_claims.meal_window_id` nullable

- [ ] **Step 1: Write the migration**

Create `supabase/migrations/20260905090000_meal_once_per_24h.sql`:

```sql
-- ============================================================================
-- One meal per person per 24 hours.
--
-- The canteen previously allowed one serving per *window* per day: someone who
-- ate at lunch could eat again at dinner, because those were different windows.
-- The rule is now a rolling twenty-four hours, measured from the previous
-- serving rather than from midnight — so a night-shift worker who eats at 23:00
-- is not entitled to another meal at 00:30 simply because the date changed.
--
-- Enforced here rather than in application code, for the reason the original
-- canteen migration gives: two scanners firing at the same instant, a replayed
-- device buffer and a retried request must all collapse to one meal, and only
-- the database sees all three.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- A meal no longer needs a window
--
-- Windows stop deciding whether someone may eat and become a label for which
-- sitting a meal belonged to. A scan at 03:00 that no window covers is still a
-- meal — it is simply recorded without one.
-- ---------------------------------------------------------------------------

alter table public.meal_claims
  alter column meal_window_id drop not null;

comment on column public.meal_claims.meal_window_id is
  'Which sitting this meal belonged to, where one was running. Null when no window covered the scan — a window no longer decides whether a person may eat.';

-- ---------------------------------------------------------------------------
-- The old guarantee no longer states the rule
--
-- unique (profile_id, meal_window_id, served_on) says "one serving per window
-- per day", which is now both too weak (it allowed lunch and dinner) and too
-- strong (it would reject a legitimate meal 25 hours later that happened to
-- fall in the same named window). It also cannot survive a null window.
-- ---------------------------------------------------------------------------

alter table public.meal_claims
  drop constraint if exists meal_claims_profile_id_meal_window_id_served_on_key;

-- The interval lookup below runs once per scan and grows with the table.
create index if not exists meal_claims_profile_recent
  on public.meal_claims (profile_id, claimed_at desc);

-- ---------------------------------------------------------------------------
-- The new guarantee
--
-- Raises unique_violation (23505) rather than a bespoke error code on purpose:
-- src/lib/canteen/ingest.ts already inserts first and reads 23505 as "already
-- ate", so the ingestion path needs no new branch and a replayed buffer keeps
-- being absorbed silently instead of being logged as a refusal.
-- ---------------------------------------------------------------------------

create or replace function app.enforce_meal_interval()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  /*
   * Bounded on both sides. The upper bound matters: a backdated correction
   * inserted after a later meal must not be refused by a claim that happened
   * after it, which an open-ended "within 24 hours" test would do.
   */
  if exists (
    select 1
      from public.meal_claims c
     where c.profile_id = new.profile_id
       and c.claimed_at >  new.claimed_at - interval '24 hours'
       and c.claimed_at <= new.claimed_at
  ) then
    raise exception 'This person was already served within the last 24 hours.'
      using errcode = 'unique_violation';
  end if;

  return new;
end;
$$;

create trigger meal_claims_once_per_24h
  before insert on public.meal_claims
  for each row execute function app.enforce_meal_interval();

comment on function app.enforce_meal_interval() is
  'One meal per person per rolling 24 hours. Raises 23505 so the ingestion path reads it as a duplicate rather than an error.';
```

- [ ] **Step 2: Verify the constraint name you are dropping actually exists**

The `drop constraint if exists` above uses Postgres's default name for
`unique (profile_id, meal_window_id, served_on)` on `meal_claims`. `if exists`
means a wrong guess fails silently, which would leave the old constraint in
place and reject legitimate meals.

Since the local stack cannot run, confirm by reading rather than by executing:
`supabase/migrations/20260830140000_canteen.sql` declares the constraint inline
as `unique (profile_id, meal_window_id, served_on)` on `create table
public.meal_claims`. Postgres names such a constraint
`<table>_<col>_<col>_<col>_key`, giving
`meal_claims_profile_id_meal_window_id_served_on_key`.

Record in your report that this name is derived, not observed, and that it must
be confirmed the first time the migration is applied — a silent no-op here is
the one failure mode this migration has.

- [ ] **Step 3: Typecheck and test**

Run: `npm run typecheck && npm test`
Expected: clean; 321 tests still pass. Nothing reads the new trigger yet.

Do **not** run `npm run db:reset` or `db:types:local` — the local Postgres
cannot start (port 54322 is inside the OS-reserved range 54319–54418).

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/20260905090000_meal_once_per_24h.sql
git commit -m "feat: allow one meal per person per rolling 24 hours"
```

---

## Task 2: Windows stop deciding

**Files:**
- Modify: `src/lib/canteen/meals.ts` (`decideMealScan`, around line 133)
- Modify: `src/lib/canteen/meals.test.ts`

**Interfaces:**
- Consumes: nothing new
- Produces: `decideMealScan` never returns `outside_window`; `MealScanDecision.window` may be `null` on a `served` outcome, and `servedOn` falls back to the local date

- [ ] **Step 1: Write the failing tests**

In `src/lib/canteen/meals.test.ts`, find the existing test asserting
`expect(decision.outcome).toBe("outside_window")` (around line 129). Replace
that test with the block below, and add the rest after it:

```ts
  it("serves a scan that no window covers, recording no window", () => {
    // The counter being shut no longer refuses anybody: the terminal is the
    // rule now, and a meal eaten at 03:00 is still a meal.
    const decision = decideMealScan({
      profileId: "p1",
      windows: [{ id: "w1", code: "LUNCH", name: "Lunch", startsAt: "12:00", endsAt: "14:00" }],
      localDate: "2026-09-05",
      localTime: "03:00",
      alreadyClaimed: false,
    });

    expect(decision.outcome).toBe("served");
    expect(decision.window).toBeNull();
    // With no window to credit it to, the meal counts against today.
    expect(decision.servedOn).toBe("2026-09-05");
  });

  it("still labels a scan with the window that was running", () => {
    const decision = decideMealScan({
      profileId: "p1",
      windows: [{ id: "w1", code: "LUNCH", name: "Lunch", startsAt: "12:00", endsAt: "14:00" }],
      localDate: "2026-09-05",
      localTime: "12:30",
      alreadyClaimed: false,
    });

    expect(decision.outcome).toBe("served");
    expect(decision.window?.code).toBe("LUNCH");
  });

  it("still refuses an unrecognised finger, window or not", () => {
    const decision = decideMealScan({
      profileId: null,
      windows: [],
      localDate: "2026-09-05",
      localTime: "03:00",
      alreadyClaimed: false,
    });

    expect(decision.outcome).toBe("unknown_person");
  });

  it("reports a repeat as a duplicate rather than a refusal", () => {
    const decision = decideMealScan({
      profileId: "p1",
      windows: [],
      localDate: "2026-09-05",
      localTime: "03:00",
      alreadyClaimed: true,
    });

    expect(decision.outcome).toBe("duplicate");
  });
```

If the existing `MealWindow` shape in this file differs from the object literal
above, use the file's own shape — read it rather than trusting this snippet.

- [ ] **Step 2: Run to verify it fails**

Run: `npm test -- meals`
Expected: FAIL — the no-window case still returns `outside_window`.

- [ ] **Step 3: Change the decision**

In `src/lib/canteen/meals.ts`, replace the body of `decideMealScan`:

```ts
export function decideMealScan(input: MealScanInput): MealScanDecision {
  const resolved = resolveMealWindow(input.windows, input.localDate, input.localTime);

  /*
   * Identity is now the only thing that can refuse a scan outright. A window
   * no longer decides whether someone may eat — it labels which sitting the
   * meal belonged to, and a scan no window covers is still a meal. Whether
   * they have eaten recently is settled by the database, which is the only
   * place that sees two terminals at once.
   */
  if (!input.profileId) {
    return {
      outcome: "unknown_person",
      window: resolved?.window ?? null,
      servedOn: resolved?.servedOn ?? null,
    };
  }

  return {
    outcome: input.alreadyClaimed ? "duplicate" : "served",
    window: resolved?.window ?? null,
    /*
     * With no window to credit it to, the meal counts against the local date.
     * A window that crosses midnight still wins, which is why this is a
     * fallback and not a replacement — see resolveMealWindow.
     */
    servedOn: resolved?.servedOn ?? input.localDate,
  };
}
```

Leave `resolveMealWindow` and every other export in this file alone.

Update the doc comment on `MealScanInput.alreadyClaimed` — it currently says
"already has a claim for the resolved window and date", which is no longer the
rule:

```ts
  /**
   * Whether this person was served within the last 24 hours. The caller looks
   * this up; the trigger on meal_claims is what actually enforces it.
   */
  alreadyClaimed: boolean;
```

Do **not** remove `outside_window` from `MealScanOutcome`. It is a value in the
Postgres `meal_scan_outcome` enum, historical `meal_scan_log` rows carry it, and
the counter screen renders its label.

- [ ] **Step 4: Run to verify it passes**

Run: `npm test -- meals`
Expected: PASS.

- [ ] **Step 5: Full suite, typecheck, lint**

Run: `npm test && npm run typecheck && npm run lint`
Expected: all clean.

- [ ] **Step 6: Commit**

```bash
git add src/lib/canteen/meals.ts src/lib/canteen/meals.test.ts
git commit -m "feat: let a canteen scan stand without a serving window"
```

---

## Task 3: Wire the ingestion path

**Files:**
- Modify: `src/lib/canteen/ingest.ts`

**Interfaces:**
- Consumes: `decideMealScan` from Task 2, the trigger from Task 1
- Produces: nothing new

- [ ] **Step 1: Read the file first**

`src/lib/canteen/ingest.ts` currently calls `decideMealScan` with
`alreadyClaimed: false`, then inserts and treats a 23505 as `duplicate`. That
pattern is correct and stays — Task 1's trigger raises 23505, so the database
now answers the 24-hour question the same way the unique index answered the
per-window one.

The only thing that must change is the guard around the insert, which currently
requires a window.

- [ ] **Step 2: Allow a claim with no window**

Find the block that reads:

```ts
    if (
      provisional.outcome === "served" &&
      profileId &&
      provisional.window &&
      provisional.servedOn
    ) {
```

Remove the `provisional.window &&` clause so a meal outside every window is
still inserted:

```ts
    if (provisional.outcome === "served" && profileId && provisional.servedOn) {
```

Then find the insert that follows and make its `meal_window_id` tolerate a null
window:

```ts
      meal_window_id: provisional.window?.id ?? null,
```

Read the surrounding code and match its field names exactly — do not rewrite the
insert, only the one field and the one guard.

- [ ] **Step 3: Check the counters still mean something**

`MealIngestResult.outsideWindow` can no longer be incremented, because
`decideMealScan` never returns `outside_window`. Leave the field on the
interface and leave it at zero: it is part of the JSON the ingest routes return,
and removing it would change a response shape for no gain while historical
reporting still uses the outcome.

Add a one-line comment where it is declared saying it stays at zero now that a
window cannot refuse a scan, so nobody spends time working out why it never
moves.

- [ ] **Step 4: Typecheck, lint, test**

Run: `npm run typecheck && npm run lint && npm test`
Expected: all clean, 321+ tests.

- [ ] **Step 5: Commit**

```bash
git add src/lib/canteen/ingest.ts
git commit -m "feat: record a canteen meal even when no window is running"
```

---

## Task 4: Two removals

**Files:**
- Delete: `src/app/(app)/admin/registers/` (the whole directory)
- Delete: `src/app/(app)/devices/[id]/enrollment-manager.tsx`
- Modify: `src/lib/navigation.ts` (the registers entry, around line 132)
- Modify: `src/app/(app)/devices/[id]/page.tsx`

**Interfaces:**
- Consumes: nothing
- Produces: nothing

- [ ] **Step 1: Remove the Digitalize Register module**

```bash
git rm -r "src/app/(app)/admin/registers"
```

Then delete its entry from `src/lib/navigation.ts` — the object whose `href` is
`/admin/registers` (around line 132), including its `requires: ["registers.import"]`.

Check for other references before moving on:

```bash
grep -rn "admin/registers\|registers.import\|registers-client" src/ --include=*.ts --include=*.tsx
```

Anything that turns up outside the deleted directory must be cleaned up too. If
`registers` is a key in `src/components/nav-icons.tsx`, remove it there as well.

**Do not write a migration removing the `registers.import` permission.**
Deleting a permission row cascades to `role_permissions` and to any
`user_permission_overrides` naming it, and re-inserting the row later does not
bring those grants back. A permission nothing checks is inert; a deleted one
takes history with it.

- [ ] **Step 2: Remove the Employee enrolment mapping panel**

```bash
git rm "src/app/(app)/devices/[id]/enrollment-manager.tsx"
```

In `src/app/(app)/devices/[id]/page.tsx`, remove the `EnrollmentManager` import
and the `{canManage ? <EnrollmentManager ... /> : null}` block that renders it.

**Keep everything else on that page**, specifically:

- the `device_enrollments` query, if anything else on the page still uses it —
  check before deleting it;
- the `unmapped` computation and the "Unlinked terminal ID" warning in the
  recent-punches list. That warning is the signal that punches are arriving for
  somebody nobody has claimed. Removing the manual fixer makes it more
  important, not less.

If the `device_enrollments` query and the `mappedIds`/`unmapped` derivation
become genuinely unused after the panel goes, remove them — but read the whole
file first and be sure. `staff`/`nameById` are used by the punches list and stay.

The `device_enrollments` table and `app.sync_device_enrollments()` stay
untouched. They maintain the mapping automatically from `employee_code`; the
panel was manual repair for something that now repairs itself.

- [ ] **Step 3: Typecheck, lint, build**

Run: `npm run typecheck && npm run lint && npm run build`
Expected: all clean. The build is the check that matters here — a dangling
import or a nav entry pointing at a deleted route fails there rather than in
tests.

Confirm `/admin/registers` is absent from the build's route list.

- [ ] **Step 4: Commit**

```bash
git add -A "src/app/(app)/admin" "src/app/(app)/devices" src/lib/navigation.ts src/components/nav-icons.tsx
git commit -m "refactor: remove the register import module and the manual enrolment panel"
```

---

## Task 5: Three UI changes

**Files:**
- Modify: `src/app/(app)/me/profile/page.tsx`
- Delete: `src/app/(app)/me/profile/profile-forms.tsx`, `src/app/(app)/me/profile/actions.ts`
- Modify: `src/components/app-shell.tsx` (the `<aside>`, around line 63)
- Modify: `src/app/(app)/devices/live/page.tsx`, `src/app/(app)/devices/[id]/page.tsx`

**Interfaces:**
- Consumes: nothing
- Produces: nothing

- [ ] **Step 1: Make the profile read-only**

Rewrite `src/app/(app)/me/profile/page.tsx` as a plain details view showing, for
the signed-in person: full name, employee code, CNIC, phone, email, designation,
department, site, shift, and joining date. Use the page's existing `Card` and
`SectionTitle` components and the definition-list style the app already uses —
read a neighbouring page rather than inventing a layout.

Then delete `profile-forms.tsx` and `actions.ts` in the same directory, and any
import of them.

Read `actions.ts` before deleting it and check nothing outside this directory
imports from it:

```bash
grep -rn "me/profile/actions" src/ --include=*.ts --include=*.tsx
```

Note in your report that `guard_profile_self_update()` — the trigger that strips
pay, placement and employment columns from a self-edit — is what actually
protects this data. The read-only page is a simplification of the screen, not a
security control, and the trigger must not be touched.

- [ ] **Step 2: Give the sidebar its own scroll**

In `src/components/app-shell.tsx`, the sidebar is currently:

```tsx
<aside className="sticky top-28 hidden h-fit w-64 shrink-0 rounded-3xl border border-border bg-card p-3 shadow-[0_1px_2px_rgb(0_0_0/0.04),0_8px_24px_rgb(0_0_0/0.05)] lg:block">
```

`h-fit` makes it as tall as its content, so the whole document scrolls and the
sidebar merely sticks. Replace `h-fit` with a bounded height and its own
overflow:

```tsx
<aside className="sticky top-28 hidden max-h-[calc(100vh-8rem)] w-64 shrink-0 overflow-y-auto overscroll-contain rounded-3xl border border-border bg-card p-3 shadow-[0_1px_2px_rgb(0_0_0/0.04),0_8px_24px_rgb(0_0_0/0.05)] lg:block">
```

Three deliberate parts:

- `max-h-[calc(100vh-8rem)]` — bounded so there is something to scroll. `8rem`
  clears the `top-28` offset plus breathing room below.
- `overflow-y-auto` — the sidebar scrolls itself.
- `overscroll-contain` — reaching the end of the sidebar does **not** start
  scrolling the page behind it. This is the specific annoyance being reported,
  and a plain `overflow-y-auto` leaves it in place.

Do not restructure the shell into a fixed-height flex row. The sidebar is
already `sticky`, and this is the smallest change that produces the behaviour.

- [ ] **Step 3: Tell check-in and check-out apart**

Both `src/app/(app)/devices/live/page.tsx` and
`src/app/(app)/devices/[id]/page.tsx` render a punch's direction as an icon plus
a time, coloured `text-success` for in and `text-info` for out:

```tsx
{isIn ? <LogIn className="size-4" /> : <LogOut className="size-4" />}
{formatTime(punch.punched_at)}
```

Add an explicit word:

```tsx
{isIn ? <LogIn className="size-4" /> : <LogOut className="size-4" />}
<span className="tabular-nums">{formatTime(punch.punched_at)}</span>
<span className="font-extrabold">{isIn ? "IN" : "OUT"}</span>
```

Colour alone is the current signal, and it fails twice over: for roughly one man
in twelve with a colour vision deficiency, and for anyone reading a phone in
daylight on a factory floor. The word carries the meaning; the colour and icon
reinforce it.

Check for other places rendering a direction before finishing:

```bash
grep -rn 'direction === "in"' src/ --include=*.tsx
```

Apply the same treatment anywhere else it appears.

- [ ] **Step 4: Typecheck, lint, test, build**

Run: `npm run typecheck && npm run lint && npm test && npm run build`
Expected: all clean.

- [ ] **Step 5: Commit**

```bash
git add -A "src/app/(app)/me" src/components/app-shell.tsx "src/app/(app)/devices"
git commit -m "feat: read-only profile, an independently scrolling sidebar, and IN/OUT labels"
```

---

## Task 6: The Antrosys runbook

**Files:**
- Create: `docs/antrosys-contract-setup.md`

**Interfaces:**
- Consumes: nothing
- Produces: nothing

- [ ] **Step 1: Write the runbook**

This section is **deliberately not code**. Both changes are operational data,
and a migration would re-apply them on every `db:reset` — silently putting the
contract back to ₨35,000 if the office ever renegotiates.

Create `docs/antrosys-contract-setup.md`:

```markdown
# Antrosys: contract firm, no attendance

Antrosys is a contract firm. The factory pays it one agreed amount a month and
does not track its people's hours for pay. Two settings express that, and both
are made in the app rather than in a migration — a migration would re-apply
them on every database reset and overwrite whatever the office had since set.

## 1. The contract amount

**Where:** Pay Rates → Contract firms

Set **Antrosys** to **35000**.

Payroll then bills that figure once per period as a single
`payroll_contract_items` row, and produces no `payroll_items` for the people
inside the firm. If the amount is left at zero, the run reports Antrosys in its
warnings rather than passing over it silently.

## 2. Antrosys people keep no attendance

**Where:** User Accounts → each Antrosys person → Attendance and pay

Set every Antrosys person to **"Salary only — no attendance kept"**.

They stay in the system with their history and directory entry intact. They stop
appearing in attendance screens, absent counts and the live floor, because
`computeDayFromPunches` returns `present` rather than `absent` for anyone whose
`requires_attendance` is false.

## Why not a migration

Both figures are decisions the office makes and re-makes. A migration is a
statement about the shape of the database, not about what a contract is worth
this month. Encoding ₨35,000 in one would mean the number silently returned
every time anyone reset a local database, and would make the real answer live in
two places.
```

- [ ] **Step 2: Commit**

```bash
git add docs/antrosys-contract-setup.md
git commit -m "docs: how Antrosys is set up as a contract firm with no attendance"
```

---

## Notes for the implementer

**The migrations cannot be applied.** The local Postgres will not start — port
54322 is inside the OS-reserved range 54319–54418, a Windows/Hyper-V
reservation needing `net stop winnat` in an elevated shell. Write and
read-verify the SQL; do not try to run it, and do not hand-edit
`src/lib/supabase/database.types.ts` to compensate. Nothing in this plan adds a
column, so no type regeneration is needed.

**The trigger's error code is load-bearing.** `ingest.ts` reads SQLSTATE 23505
as "already ate". Raising anything else turns every duplicate scan into a 500
and fills the fraud log with errors.

**Do not delete the `registers.import` permission**, and do not delete
`device_enrollments` or its triggers. Both are explained in Task 4.
