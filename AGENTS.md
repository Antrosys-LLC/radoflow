# Working on RadoFlow

Attendance and payroll for Rado Dyeing & Textile. Everything is in Pakistan
Standard Time (`Asia/Karachi`) and Pakistani rupees.

## Before you change payroll or attendance logic

The money and hour calculations live in pure, tested modules. Run the tests —
they encode real decisions, not just coverage:

```bash
npm test
```

- `src/lib/payroll/` — rates, overtime, late penalties, net pay
- `src/lib/attendance/compute.ts` — turning punches into worked hours
- `src/lib/devices/zkteco/` — the K50 and MB460 wire protocols

Rules worth knowing before editing:

- **A monthly salary is a daily rate, not a take-home figure.** Base pay is
  `salary ÷ calendar days in the month × days actually worked`. Sundays are
  never working days, so nobody receives the full stated salary in any month.
  Absence is not a deduction; it is a day that was never earned.
- **Overtime is `daily rate ÷ 8`, derived from salary.** This is a deliberate
  exception to the rule below, added because it is how Rado actually pays. A
  raise does raise overtime with it.
- **Weekend and holiday rates are absolute rupees per hour, never multiples of
  basic pay.** A multiplier chains a premium to the base wage, so a raise
  silently inflates it and the two can never be negotiated apart.
- **`duty_hours` is what the salary covers, not the length of the shift.** A
  guard's twelve hours are all duty; an operator on the same twelve-hour shift
  is paid for eight, with the last four as overtime.
- **A contract firm is billed once, not per person.** The agreed amount lives
  on the department (`departments.contract_amount`) and becomes one row in
  `payroll_contract_items`. The firm's people produce no payroll item at all —
  `calculatePayroll` throws if one reaches it. Their attendance is still
  recorded so the office can check the firm's invoice against real hours.
- **Someone `payroll_exempt` is not on payroll at all.** Owners are filtered
  out of a run rather than priced at zero: a zero line states they earned
  nothing, which is a different claim from not being paid here.
- **Overtime stops at four hours a working day** (`pay_rules.ot_daily_cap_hours`).
  Hours past the ceiling are recorded but dropped, never moved into the duty
  bucket — paying them at the duty rate would reintroduce the uncapped cost the
  ceiling exists to prevent. Sundays are exempt: every Sunday hour is overtime.
- **`flexible_hours` means no in or out time is enforced.** Lateness is never
  recorded for that person, whatever shift they are rostered to. Hours and
  overtime are still counted from the punches.
- **Net pay can never be negative.** Withholding is capped at gross earnings.

The reasoning behind the pay model is in
`docs/superpowers/specs/2026-08-25-duty-hours-and-salary-formula-design.md`.

## The terminals hold one roster between them

Three MB460s are on the wall — a check-in gate, a check-out gate and the
kitchen counter — and a person enrolled on any one of them reaches the other
two on their own. Rules worth knowing before touching that path:

- **A terminal is a replica, not an original.** It is authoritative about one
  thing only: the template it just captured, because it owns the sensor.
  RadoFlow holds the master copy in `person_biometrics`, which is what makes a
  replaced terminal recoverable without re-scanning the factory.
- **The fan-out lives in database triggers**, not in the route that received
  the upload — there are three ways a person can change (a terminal push, the
  on-site agent's pull, an office edit) and a trigger covers all three by
  construction. See `app.fan_out_person` in `20260913090000`.
- **`source_device_id` is how the loop is broken.** A template is never queued
  back to the terminal that captured it; that box would apply it, re-upload it,
  and trigger the fan-out again.
- **Templates are replayed byte for byte**, in the dialect the enrolling
  terminal spoke (`FP` or `BIODATA`). Never re-serialise one from parsed
  fields — a firmware field this code has not heard of would be dropped, and
  the receiving terminal accepts a corrupted template without complaining.
- **A person's enrolment number is `profiles.device_pin`, and it is the same
  on every terminal.** A terminal stores the user id as a number; anything else
  is silently truncated, which is how `RD-2070` became `2070` and dropped its
  punches. `scripts/fix-terminal-ids.ts` exists because of that.
- **What a punch means comes from the terminal, not the record.** The MB460 has
  no in/out keys and stamps every record state 0, so `devices.direction`
  overrides it — which door the box is bolted beside is a fact about the
  installation. `devices.purpose = 'canteen'` branches earlier still: a kitchen
  scan becomes a meal claim and never an attendance punch, or walking past the
  lunch counter would pay somebody for eating.
- **A deletion on a terminal clears the hardware, never the person.** Their
  attendance and unpaid payroll lines are records of work that happened, and a
  supervisor pressing DELETE on a wall-mounted box is not a decision about
  employment.
- **Only active staff are ever pushed to a terminal.** The check lives in
  `app.push_person_to_device`, the one point every enrolment passes through, so
  the triggers and the resync button inherit it and no future caller has to
  remember. Suspending or terminating somebody withdraws them from all three
  boxes; making them active again puts them back. Their templates survive a
  suspension — reinstatement is a status change, not four hundred re-scans —
  and that is only safe because nothing can push a non-active person.
- **A terminal is only ever sent what it lacks.** `device_inventory` holds one
  row per user record and one per finger on each terminal, filled from its own
  roster uploads and from every instruction it confirms. `app.queue_device_command`
  refuses a finger the target already holds, in any version, and a relayed
  user record for a PIN it already has. Office changes to a RadoFlow person's
  name, privilege or card still go through — but only when the office is what
  changed. A finger or face fanning out from the terminal that captured it
  (`app.fan_out_biometric`) sends the person's user record only to a terminal
  that does not hold the PIN; one that already has them keeps its name and
  card. That is the third argument to `push_person_to_device`, and every other
  caller leaves it at its default. This is what the factory asked for, and it
  is also what makes an echo harmless.
- **Uploads must be fast and idempotent.** A terminal reads a slow reply as a
  failure and resends the whole roster; on the first live day that happened
  every thirty-five seconds for ten minutes. `applyRosterUpload` plans in
  memory (`roster-plan.ts`) and writes in bulk. Keep it that way.
- **Merging rosters is `reconcile_rosters(order)`.** It queues each terminal's
  gaps, taking the version from the terminal earliest in `order`, users before
  fingers, never copying suspended or terminated people. Run it only once every
  terminal's inventory is complete. `merge_terminal_rosters()` is the same
  thing behind the permission check, in check-in, check-out, kitchen order —
  that is what the button on the devices screen calls.
- **An administrator is the one exception to the additive rule.** Privilege is
  learned upward only: a terminal reporting somebody as `Pri=0` when RadoFlow
  holds them at 14 is describing its own drift, not a demotion, and it is sent
  a correction rather than believed. Nothing else about them moves — the
  correction is that terminal's _own_ record with only `Pri` rewritten, because
  PIN 1 is one person under two names on the two gates and restoring their menu
  access must not rename them on either. Both halves matter: `adminCorrections`
  in `roster-plan.ts` catches it on every upload, `app.restore_administrators`
  at the end of a merge catches a box that is not going to upload. A terminal
  left with no administrator opens its menu to whoever presses the button.
- **Pull mode is the kill switch.** Setting every terminal's `mode` to `pull`
  stops all fan-out and relays without a deploy; punches and meals still
  record, and queued instructions are still delivered.
- **What terminals send is kept** in `device_uploads` (excerpts) and
  `device_commands.result_raw`. Read those before guessing at firmware.

Setup and troubleshooting: [TERMINALS-THREE-MACHINE-SETUP.md](TERMINALS-THREE-MACHINE-SETUP.md).

## Access changes force a re-login

Permissions are resolved once per request from the session. Changing someone's
role stamps `profiles.roles_changed_at`, and any token issued before that stamp
is refused — the person is sent to `/auth/reauth`, signed out, and must sign in
again. Without this, a demotion would not reach them until they happened to log
out. Redirect stale sessions to `/auth/reauth`, never straight to `/login`: the
middleware bounces anyone holding a valid cookie away from the login page.

## Leadership, and who waits for approval

- **C-Level is the `ceo` role, renamed; owners are the `owner` role.** Arham
  Sethi and Ghaffar Sethi hold `owner` — unrestricted, and the only people
  besides Antrosys who give or take away C-Level, owner or Antrosys roles.
  C-Level holds every permission except `access.manage` and is not
  `is_superuser`. The line is held in `app.guard_leadership_roles` on
  `user_roles`; `setUserRole` only words the refusal.
- **Leadership never queues.** `needsApproval` is false for owner, C-Level and
  Antrosys (`isLeadership`). Everybody else's pay, calendar and attendance
  changes wait in `change_requests`.
- **A decision can be undone for an hour.** Approving stores what the row held
  (`previous_values`, or `created_row`) and undo writes exactly that back. A
  requester may withdraw, and restore within the hour; the trigger
  `app.guard_change_request_requester` stops them editing what the approver
  reads.

## Shifts follow the floor

Day 08:00–16:00 with overtime to 20:00; night 20:00–04:00 with overtime to
08:00 (`shifts.overtime_until`). After `shifts.auto_switch_after_days` attended
days in a row that all started on the other shift, a person is moved to it
(`followShifts`, after the day is recomputed) unless
`profiles.shift_follows_attendance` is off. A night worker's punch between
05:00 and 10:00 belongs to the previous night while an evening check-in is
open (`creditWorkDates`) — otherwise overtime would split one night into two
dates. Both fail soft: a punch is never refused because the roster was unread.

## The salary ledger

The office sheet's ADVANCE, ADVANCE, LOAN DED. and SUITE DED. columns are
`salary_adjustments` (one figure, one person, one month) and `employee_loans`.
The payroll run turns them into payslip components with fixed codes
(`LEDGER_CODES`), and the register reads its columns back out by code. A loan's
balance is never stored: it is the principal less `loan_recoveries`, one
payroll line per loan per month, replaced on a re-run so an installment is
never taken twice. A short month takes the shortfall off loan lines first.

## Downloads

Every PDF and workbook carries the Rado letterhead and mark
(`src/lib/export/brand-logo.ts`, generated from `public/`). Worksheet elements
must stay in schema order — `autoFilter` before `mergeCells` before the print
settings before `drawing` — or Excel "repairs" the file. The tests pin it.

## Access control

Permissions live in the database, not in the code. A role's capabilities are
rows in `role_permissions`, and RLS policies call `app.has_permission()`. Hiding
a button in React is a courtesy; the policy is what actually protects the data.

Roles flagged `is_superuser` (Admin, CEO) bypass every check.

## Local development

```bash
npm run db:start     # Supabase in Docker
npm run db:reset     # apply migrations + seed
npm run dev
```

Demo accounts sign in with their CNIC and the password `antrosys123`. Never run `supabase/seed.sql`
against production.

## Deployment

See [DEPLOYMENT.md](DEPLOYMENT.md) and [TERMINALS-SETUP.md](TERMINALS-SETUP.md) — particularly the note on why a clean build
can still return "Internal Server Error", and why the biometric terminals
cannot be polled from a cloud host.

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
