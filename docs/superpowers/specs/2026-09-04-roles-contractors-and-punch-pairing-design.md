# Split admin roles, firm-level contractors, and check-in/out/break pairing

**Date:** 2026-09-04
**Status:** Approved design, not yet implemented

## Why

Ten changes were asked for in one sitting. Three of them restructure things the
rest of the system reads from, and the other seven are small once those three
land:

1. Antrosys and the factory's own administrator are different people with
   different reasons to hold the keys, and today they share one role.
2. A contract firm is billed one agreed amount for the whole firm. Payroll
   currently prices each of the firm's people separately, so a three-person
   contractor costs three times what was agreed.
3. A punch is a check-in, a check-out, or the far side of a break, and the
   system cannot tell which. It pairs punches by alternating them and records
   no breaks at all.

The rest — an Accounts role, owners who are on no system at all, staff with no
shift to keep, a per-minute late penalty, clock-out rounding, an employee who
sees only their own record, a manager who can approve, and a live view of the
floor — are each a small change once the model above can express them.

## What already exists

Worth stating, because most of this design is smaller than it looks:

| Requirement | Already in the schema | What is missing |
| --- | --- | --- |
| Factory admin separate from Antrosys | `admin-antrosys`, superuser | a second, non-superuser role |
| Owners keep no attendance | `profiles.requires_attendance` | no way to say "and no salary either" |
| Staff with no shift | `profiles.flexible_hours`, `duty_hours`, nullable `shift_id` | a UI option; the logic is already correct |
| A late margin | `shifts.grace_minutes` (15), `late_penalty_rules` | the tiers are percentages, not per-minute |
| Manager approvals | `attendance.edit` scoped to own reports | no `attendance.approve` grant, no screen |
| Contractors | `worker_type`, four contractor departments | no firm-level amount |

`ingest.ts` already skips lateness for anyone on `flexible_hours`, and
`guard_profile_self_update()` already strips pay columns from a self-edit. Both
are load-bearing for requirements below that would otherwise need new code.

## Phase 1 — The access model

### Factory Admin is granted everything, not flagged superuser

The instruction was "unrestricted as CEO, but the CEO can assign roles
differently". Those cannot both be true of a superuser role.
`app.has_permission()` short-circuits on `app.is_superuser()` **before** it
reads the deny list, deliberately, so that an unrestricted role can never be
locked out of the control centre by an accidental edit. A superuser Factory
Admin would therefore be one the CEO could not restrict at all, in any degree.

So `factory-admin` is created with `is_superuser = false` and granted every row
in `public.permissions`. On day one it can do everything the CEO can. The
difference only appears the day the CEO wants to take one capability away from
one factory administrator, which a `user_permission_overrides` deny row then
does — no role rewrite, no migration.

`admin-antrosys` and `ceo` keep the superuser flag. Two roles that can never be
locked out is the right number: one is the software maintainer, one is the
owner of the business.

```sql
insert into public.roles (key, name, description, is_system, is_superuser, rank)
values ('factory-admin', 'Factory Admin',
        'Runs the factory. Every capability by default; individual ones can be revoked by the CEO.',
        true, false, 25);
```

Rank 25 places it below `admin-antrosys` (5) and `ceo` (20). Rank only breaks
the tie when one person holds two roles, and someone who is both the CEO and a
factory administrator should land on the CEO's dashboard.

The grant is the same cross join `admin-antrosys` uses, so a permission added
by a later migration that re-runs the insert is picked up.

### Accounts

```sql
insert into public.roles (key, name, description, is_system, is_superuser, rank)
values ('accounts', 'Accounts',
        'Sees all attendance and payroll, and runs payroll. Approval and disbursement stay with an admin.',
        true, false, 35);
```

Granted: `dashboard.employee`, `leave.request`, `directory.view`,
`attendance.view.all`, `payroll.view`, `payroll.run`, `payslip.view.all`,
`reports.view`.

Deliberately not granted: `payroll.approve`, `payroll.pay`, `rates.manage`,
`attendance.edit.all`, `people.manage`. Accounts computes; an admin signs off.

**The approval is real, not advisory.** When a run finishes, the period already
moves to `review` (`run.ts` sets this today). On top of that, a run started by
someone who does not hold `payroll.approve` inserts a row into the existing
`public.approvals` table with `required_permission = 'payroll.approve'`,
`entity_type = 'payroll_period'` and the run's net total as `amount`. That is
what the table exists for, and it is what puts the run in front of an admin
rather than leaving it to be noticed.

### Employee sees a department roster and nothing more

`public.employee_directory` gains one branch in its `WHERE` clause:

```sql
   or p.department_id = (select department_id from public.profiles where id = auth.uid())
```

The view carries no `monthly_salary`, `hourly_rate` or `pin_hash` column at
all — that is why it exists — so widening its rows leaks nothing about pay.
Employees see names, codes, designation and status for their own department.
They see no colleague's attendance, hours or payslip.

Their own record stays fully visible: `attendance_days` and `payroll_items`
already have self-select policies, and the employee role holds no `*.edit`
permission, so read-only needs no new policy — it is the absence of grants.

### Manager gains `attendance.approve`

One row in `role_permissions`. Scope stays "own reports" through the existing
RLS policies; the permission does not widen who a manager can see.

## Phase 2 — The people model

Three columns. Each follows the existing pattern of putting an exception in
data rather than in code.

```sql
alter table public.departments
  add column contract_amount numeric(14, 2) not null default 0
    check (contract_amount >= 0);

alter table public.profiles
  add column payroll_exempt boolean not null default false;

alter table public.attendance_days
  add column break_minutes integer not null default 0
    check (break_minutes >= 0),
  add column hours_are_final boolean not null default false;
```

`contract_amount` is the firm's agreed monthly figure. It is meaningful only on
a department whose `default_worker_type` is `contractor`; on any other it stays
zero and is ignored. Antrosys, Folding, Yasine CP and Zafar Nug Packing already
exist as contractor departments.

`payroll_exempt` marks someone who draws no salary through this system at all —
the owners. Distinct from `requires_attendance`, because the two are
independent: a monthly manager keeps no attendance but is very much on payroll.

`hours_are_final` is explained in Phase 3; it exists to stop the same day being
rounded twice.

### One question instead of three checkboxes

The add and edit person forms in `admin/users/users-manager.tsx` and
`rates/people-pay.tsx` currently expose `requires_attendance` and
`flexible_hours` as separate checkboxes with no stated relationship. They are
replaced by one three-way choice:

| Choice | `requires_attendance` | `payroll_exempt` |
| --- | --- | --- |
| Tracked — attendance and salary | `true` | `false` |
| Salary only — no attendance kept | `false` | `false` |
| Neither — owner | `false` | `true` |

And the shift selector gains one option above the roster:

**No shift — must complete duty hours** → `shift_id = null`,
`flexible_hours = true`.

No new logic is needed behind that option. `ingest.ts` already refuses to
record lateness for anyone flexible, and `splitDayHours()` already counts hours
and overtime from punches without reference to a shift. The option makes an
existing capability reachable, which is why it is in the people phase and not
the attendance one.

## Phase 3 — Punch pairing, breaks, rounding, and lateness

### Sessions

New pure module `src/lib/attendance/sessions.ts`. One function, no I/O:

```
first punch of a session          → IN
next punch within 12h of that IN  → OUT
next punch after an OUT           → IN, and the gap since that OUT is a break
a punch more than 12h after the
  session's opening IN            → opens a new session
```

Worked time is the sum of the IN→OUT spans. Break time is the sum of the gaps
between an OUT and the next IN. Breaks are unpaid, which is what the current
alternating pairing already does implicitly — this names it and records it in
`attendance_days.break_minutes` so a supervisor can see where the day went.

**Sequence decides direction, not the device.** `compute.ts` already documents
why: a K50 without dedicated in/out keys stamps every record state 0, which
arrives as an unbroken run of "in", and believing it would report a zero-hour
day for someone who worked a full shift. The device's raw state stays in
`punches.raw` for audit, and the derived value is written back to
`punches.direction` — so the device page and the Phase 5 live feed show real
in/out arrows instead of a column of identical green.

**A session that never closes stays open.** A punch-in with no partner inside
twelve hours produces `status = 'partial'`, zero hours, and the note "missing
clock-out" — exactly what `computeDayFromPunches` does today. Nobody is
silently paid a day they did not work, and nobody is silently docked one they
did. It surfaces on the manager's screen as a correction to make.

`computeDayFromPunches()` keeps its signature and delegates its pairing to the
new module, so `ingest.ts` and the existing tests move across unchanged in
shape.

### Clock-out rounding

For a person with an enforced shift — `shift_id` is set **and**
`flexible_hours` is false — the last OUT of the work date is floored to the
nearest half hour before hours are computed. A date holding two sessions is
rare, and only its closing punch is floored; the earlier session's OUT is a
real finish that was followed by more work, not a leaving time.

```
11:45 → 11:30      11:20 → 11:00      12:00 → 12:00
```

Always down, never up. Applied to the day's closing punch only, not to the
punches that bracket a break: flooring a 13:05 lunch-out to 13:00 would shorten
the morning by five minutes it was actually worked, which is not what was
asked for and is not what rounding a leaving time means.

Someone on no shift keeps their exact minutes. They have no fixed finish to
round against, so flooring would simply shave up to twenty-nine minutes off a
person whose whole arrangement is that they complete their hours.

**Rounding happens once.** `splitDayHours()` opens by calling
`roundHours(day.hoursWorked, rule.roundToMinutes)`, which is half-up on a
fifteen-minute step by default and would hand back some of what the floor just
took. When the clock-out has been floored, the attendance row is written with
`hours_are_final = true`; `AttendanceDay` gains a matching optional
`hoursAreFinal` field, and `splitDayHours()` skips its rounding step when it is
set. Sites that use neither shifts nor flexible hours are unaffected.

### Per-minute late penalty

```sql
alter type public.penalty_basis add value if not exists 'minute';
```

When a tier's `basis` is `minute`, the deduction for a day is:

```
minutesLate × (dayRate ÷ dutyHours ÷ 60)
```

`minutesLate` already has the grace period subtracted —
`minutesLateAgainstShift()` measures from `shiftStart + graceMinutes` and
returns zero inside it. So with the shift's default fifteen-minute grace, an
arrival twenty minutes after start costs five minutes of pay, not twenty. The
margin is free time, not a pass/fail threshold.

`dayRate` is the figure `engine.ts` already computes for penalties: the daily
rate for monthly staff, `hourlyRate × standardHoursPerDay` for hourly. The
divisor is the person's own `duty_hours`, so a guard on a twelve-hour duty
loses a twelfth of their day per hour late and an operator on eight loses an
eighth — each measured against the day they actually contracted for. Deriving
from salary means the penalty tracks every raise with no rule to renegotiate.

`penalty_percent` is not null on the table and is meaningless for this basis; a
minute-basis tier stores 100, read as "one hundred percent of one minute's
wage". A single open-ended tier (`from_minutes = 0`, `to_minutes = null`,
`basis = 'minute'`) is seeded per site. The existing percentage tiers are
untouched and keep working — `findTier()` picks the narrowest matching band, so
a site can run per-minute for small latenesses and a percentage penalty beyond
some threshold if it ever wants to.

Nothing here applies to anyone on `flexible_hours`: `minutes_late` is never
written for them, so no tier ever matches.

## Phase 4 — Payroll

### A contract firm is billed once

```sql
create table public.payroll_contract_items (
  id            uuid primary key default gen_random_uuid(),
  period_id     uuid not null references public.payroll_periods (id) on delete cascade,
  department_id uuid not null references public.departments (id) on delete cascade,
  amount        numeric(14, 2) not null default 0 check (amount >= 0),
  headcount     integer not null default 0,
  note          text,
  computed_at   timestamptz not null default now(),
  unique (period_id, department_id)
);
```

A run emits one row per contractor department at the site with a non-zero
`contract_amount`, and **no `payroll_items` at all** for the people inside it.
`headcount` records how many people the firm had on the floor that period —
recorded because it is what the office checks the invoice against, not because
it prices anything.

`payroll_periods.total_gross` and `total_net` both become
`sum(payroll_items) + sum(payroll_contract_items)`; a contract amount attracts
no deduction or tax, so `total_deductions` and `total_tax` are unchanged.
`payroll_periods.headcount` counts directly-employed people plus contract
headcount, so the number on the dashboard still means "people who worked here".

The table carries RLS mirroring `payroll_items`: read on
`app.can('payroll.view', ...)`, write on `app.can('payroll.run', ...)`, with
the site resolved through the period. A contract amount is payroll data and
must not be readable by a role that cannot read payroll.

**This removes the per-person contractor branch from `engine.ts`.** The
`CONTRACT` payslip line, and the `isContractor` guards on overtime, weekend
pay, holiday pay and late penalties, all go: a contractor no longer reaches the
engine. `run.ts` filters them out before the loop, alongside the
`payroll_exempt` people. The existing engine tests that assert a contractor's
flat amount are rewritten to assert the firm-level behaviour instead.

Contractors' attendance keeps being recorded exactly as now. That was always
the point of tracking them — so the firm's invoice can be checked against the
hours their people actually put in.

### A contract with no amount is a warning, not a silence

A contractor department left at `contract_amount = 0` would, under the rule
above, produce no payroll cost and no payroll items — its people would simply
vanish from the run with nothing said. `RunSummary.skipped` already exists for
telling an operator what a run left out, and gains one entry per such
department: "Antrosys — 3 people, no contract amount set". The same warning
shows on the payroll screen before the run is approved.

### Owners

`payroll_exempt` people are filtered out of `run.ts` before any calculation.
Not zeroed, not skipped-with-a-reason: they are not in payroll, so a zero line
saying they earned nothing would be a false statement rather than an empty one.

## Phase 5 — The live floor feed

New page at `/devices/live`, reachable from the biometric devices page and
guarded by the same `devices.view` / `devices.manage` pair the device pages use
(`requireAnyPermission`, so a role holding only `devices.manage` does not see a
menu entry that lands it on `/denied`).

Shows the last 400 punches across every terminal, newest first: name, employee
code, terminal, time in Pakistan Standard Time, and an in or out marker taken
from the direction Phase 3 derives. Unmapped enrolment ids keep the existing
warning treatment, since an unlinked terminal id is the most common reason a
worker's punches never reach their timesheet.

**Polling, not Realtime.** Punches only enter the database when
`sync-worker.ts` polls the terminals, currently every thirty seconds. A
websocket would deliver the same rows on the same cadence while adding
per-table replication config and a new failure mode. `AutoRefresh` at ten
seconds is live to within one poll cycle, and `auto-refresh.tsx` already
documents itself as the seam to swap Realtime in if punches ever start arriving
faster than the worker fetches them.

The query is `order by punched_at desc limit 400` against the existing
`punches (punched_at desc)` index.

## Out of scope

**A missed-punch request flow.** "The manager can approve attendances" is
implemented here as: a manager approves a day, or a date range, for their own
department. That stamps `approved_by` and `approved_at` on the affected
`attendance_days` rows and sets `locked = true`, which
`recomputeAttendanceDay()` already honours — so a correction survives the next
terminal sync instead of being overwritten by it. Managers also keep approving
leave, which they can already do.

What is **not** built: an employee submitting "I was here on the 3rd, the
terminal missed me", that request entering a queue, and a manager accepting or
rejecting it. There is no request flow of that shape in the codebase to extend,
and it needs its own states, screens and notifications. It is a follow-on
project, not a line item in this one.

## Build order

Phase 2 → 3 → 4 is a chain: payroll reads the flags Phase 2 adds and the hours
Phase 3 computes. Phase 1 and Phase 5 touch nothing either depends on and can
land in any order.

## Testing

The money and hour changes are pure modules with existing test files, and are
written test-first:

- `sessions.test.ts` — pairing, breaks, the twelve-hour boundary, an unclosed
  session, a single punch, punches arriving out of order.
- `compute.test.ts` — clock-out flooring at :00 and :30, both directions of the
  half-hour boundary, and that a flexible-hours person is never floored.
- `late.test.ts` — per-minute deduction, grace subtracted, a flexible person
  never matching a tier, percentage tiers still behaving.
- `engine.test.ts` — contractors and payroll-exempt people absent from results;
  the rewritten contractor assertions.
- `hours.test.ts` — `hoursAreFinal` suppressing `roundHours`.

Phase 1's policy changes are verified in the style of `claims.test.ts`: that
Accounts resolves without `payroll.approve`, that Factory Admin resolves with
every permission, and that a deny override actually bites on Factory Admin —
the property that motivated not flagging it superuser.
