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

Setup and troubleshooting: [TERMINALS-THREE-MACHINE-SETUP.md](TERMINALS-THREE-MACHINE-SETUP.md).

## Access changes force a re-login

Permissions are resolved once per request from the session. Changing someone's
role stamps `profiles.roles_changed_at`, and any token issued before that stamp
is refused — the person is sent to `/auth/reauth`, signed out, and must sign in
again. Without this, a demotion would not reach them until they happened to log
out. Redirect stale sessions to `/auth/reauth`, never straight to `/login`: the
middleware bounces anyone holding a valid cookie away from the login page.

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
