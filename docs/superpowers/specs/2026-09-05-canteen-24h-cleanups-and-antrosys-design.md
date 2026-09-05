# A 24-hour meal rule, five UI cleanups, and Antrosys off attendance

**Date:** 2026-09-05
**Status:** Approved design, not yet implemented

## Why

Eight changes, of which seven are small and one is a real rule change:

1. One meal per person per **24 hours**, enforced at a canteen terminal.
2. Antrosys stops being tracked for attendance but stays a contract firm, billed
   ₨35,000 a month.
3. The Digitalize Register module goes.
4. The Employee enrolment mapping panel goes.
5. `/me/profile` becomes a read-only record of who you are — no password change.
6. The sidebar scrolls independently of the page.
7. Check-in and check-out are told apart at a glance, everywhere.

Multilingual support and the Urdu font were asked for at the same time and are
deliberately **not** here — see [Not in this project](#not-in-this-project).

## What already exists

Two of the ten original requests need no work, and are recorded so they are not
rebuilt:

| Asked for | Already there |
| --- | --- |
| A biometric device for the canteen | `device_purpose` is an enum (`attendance` \| `canteen`) from migration `20260830140000`, and the device dialog already exposes it. Adding one is configuration: create the terminal, set its purpose. |
| A canteen scan going to the canteen module | `ingestPunches` in `src/lib/devices/ingest.ts` branches on `device.purpose === "canteen"` and routes those scans to `ingestMealScans`. No path exists by which a lunch queue becomes paid hours. |

## Section 1 — One meal per 24 hours

### What changes

`decideMealScan` in `src/lib/canteen/meals.ts` currently refuses a second meal
**inside the same serving window**: a person who ate at lunch may eat again at
dinner, because those are different windows.

The new rule is a **rolling 24 hours**, independent of windows: if this person
was served less than 24 hours ago, this scan does not count.

### A repeat is ignored, not refused

The distinction matters and is the point of the change. Today a second scan is
recorded as a **refusal**, which is how the canteen measures people going back
for seconds. Under a 24-hour rule the common second scan is not fraud — it is
somebody tapping twice, or wandering back past the terminal. Logging those as
refusals would fill the fraud report with noise and hide the real cases.

So a scan inside the 24-hour shadow of a previous meal is recorded as a
**duplicate** — counted in `MealIngestResult.duplicates`, which already exists
for terminal replays — and not as `outsideWindow` or a refusal.

### Windows stay, but stop deciding

`meal_windows` rows are not deleted, and the serving screen keeps showing which
sitting is running. What changes is that a window no longer decides whether
someone may eat. Deleting the table would throw away the schedule the counter
staff work to; leaving it in the decision would mean two rules that can refuse
someone for reasons the person at the counter cannot see.

### The boundary is where this will go wrong

The rule is "less than 24 hours ago is a duplicate; 24 hours or more is a new
meal", measured from the previous **claim's** timestamp, not from midnight.

Three cases decide whether it is right, and all three are tested:

| Gap since last meal | Outcome |
| --- | --- |
| 23h 59m | duplicate |
| exactly 24h 00m | served |
| 24h 01m | served |

Measuring from the claim rather than the calendar day is deliberate: a shift
worker who eats at 23:00 must not be entitled to another meal at 00:30 simply
because the date changed.

### Schema

`meal_claims` currently carries a uniqueness constraint scoped to the meal
window and date. That constraint no longer expresses the rule and is replaced by
the 24-hour lookup in code, because "no claim within 24 hours of this instant"
is not something a unique index can state.

The lookup is `select ... from meal_claims where profile_id = $1 and claimed_at
> now() - interval '24 hours' limit 1`, and it needs an index on
`(profile_id, claimed_at desc)` to stay cheap as the table grows — a canteen
writes a few hundred rows a day and is queried once per scan.

The old window-scoped unique index is dropped in the same migration. Leaving it
would reject a legitimate second meal 25 hours later that happened to fall in
the same named window.

## Section 2 — Antrosys off attendance

Two changes, both to data rather than code:

- The Antrosys department's `contract_amount` is set to **35000**.
- Every Antrosys person gets `requires_attendance = false`.

They stay in the system. Their profiles, history and directory entries are
untouched; they simply stop appearing on attendance screens, in absent counts
and on the live floor. `computeDayFromPunches` already returns `present` rather
than `absent` for anyone whose `requires_attendance` is false, so nothing
downstream needs teaching.

### Done through the app, not a migration

Both are **operational data**, and a migration would re-apply them on every
`db:reset` — silently overwriting whatever the office later sets. If Antrosys
renegotiates to ₨40,000, a migration would quietly put it back to 35,000 on the
next reset.

The contract amount is set at `/rates`, which already has the control. The
`requires_attendance` change is made per person on the people screen, which
already has the three-way tracking choice built earlier ("Salary only — no
attendance kept").

This section therefore ships as **documented steps**, not code. That is the
correct outcome, not a gap.

## Section 3 — The five cleanups

### Remove the Digitalize Register module

Delete `src/app/(app)/admin/registers/` entirely, its navigation entry in
`src/lib/navigation.ts`, and the `registers.import` permission grant.

The permission row itself stays in the catalogue. Deleting a permission cascades
to `role_permissions` and to any `user_permission_overrides` naming it — and a
migration that removes a permission cannot be undone by re-adding the row,
because the grants that referenced it are gone. A permission nothing checks is
inert; a deleted one takes history with it.

### Remove the Employee enrolment mapping panel

Delete `EnrollmentManager` and its use on `src/app/(app)/devices/[id]/page.tsx`.

The `device_enrollments` table and its triggers **stay**. They are what maps a
terminal's enroll id to a person, and `app.sync_device_enrollments()` maintains
them automatically from `employee_code`. The panel was manual repair for a
mapping that now maintains itself; the mapping is not optional.

The "unlinked terminal ID" warning on that page stays too — it is the signal
that a punch is arriving for somebody nobody has claimed, and removing the
manual fixer makes that warning more important, not less.

### `/me/profile` becomes read-only

Shows name, employee code, CNIC, phone, email, designation, department, site,
shift and joining date. No password change, no editable fields.

`guard_profile_self_update()` already strips pay, placement and employment
columns from a self-edit, so the read-only page is not what protects the data —
the trigger is. This is a simplification of the screen, not a security change,
and the spec records that so nobody later re-adds an edit form believing the
page was the guard.

### The sidebar scrolls independently

The sidebar and the main content each get their own scroll container, so a
cursor over the sidebar scrolls the sidebar and a cursor over the page scrolls
the page.

In practice: the app shell becomes a fixed-height flex row, with the sidebar
`overflow-y-auto` and the content region `overflow-y-auto`, rather than one
document scroll. The change is to the `(app)` layout.

`overscroll-behavior: contain` goes on the sidebar so reaching its end does not
start scrolling the page behind it — which is the specific annoyance being
reported, and the part a naive `overflow-y-auto` leaves in place.

### Check-in and check-out told apart

Everywhere a punch direction is shown — the live floor, the device page, the
attendance log — an explicit **IN** or **OUT** word appears beside the arrow
icon, not only a colour.

Colour alone is the current signal (green for in, blue for out). That fails for
the roughly one in twelve men with a colour vision deficiency, and it fails
again on a phone screen in daylight on a factory floor. The word carries the
meaning; the colour and icon reinforce it.

## Section 4 — Testing

The one genuinely testable unit is the meal rule, and it is where the risk is:

**`src/lib/canteen/meals.test.ts`** — extended with the 24-hour boundary:
23h59m is a duplicate, exactly 24h00m is served, 24h01m is served. Plus: a
person with no previous claim is served; a repeat inside the shadow is counted
as a `duplicate` and not as a refusal; and a claim 25 hours old in the same
named window does not block.

The remaining changes are deletions and layout. They are verified by the app
building, the routes disappearing, and looking at the screens — a jsdom test
asserting that a deleted component is absent is a test of the test.

The Antrosys change has no code and therefore no test; it is verified by
looking at `/rates` and the attendance screen after the steps are followed.

## Not in this project

**Multilingual support and the Urdu font.** Asked for at the same time, and
deliberately separated.

There is no i18n framework in this codebase — the Ask assistant's three-way
language selector is a prompt instruction, not a translation layer. Doing it
properly means extracting every user-facing string across roughly fifteen pages,
writing each three times (English, Urdu, Roman Urdu), storing a per-person
preference, handling right-to-left layout for Urdu script, and loading Noto
Nastaliq Urdu.

That is larger than the other nine requests combined. Folded in here it would
produce a plan too large to review, which is where defects hide. It gets its own
spec and its own plan, next.

Two decisions already taken and carried forward to it: **three languages**
(English, Urdu, Roman Urdu), chosen **per person** and remembered on their
profile; and **names never translate** — stored once and shown as-is, because
automatic transliteration mangles Pakistani names and staff would see their own
spelled wrong.

## Build order

Section 1 is the only one with logic and tests, and is independent of the rest.
Section 3's five cleanups are independent of each other and of Section 1.
Section 2 is documentation, and can be done at any point by the office.
