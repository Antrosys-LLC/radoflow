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
- `src/lib/devices/zkteco/` — the K50 wire protocol

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
- **Contractors have nothing calculated for them.** The agreed amount in
  `monthly_salary` is paid flat: no proration, no overtime, no late penalty.
- **Net pay can never be negative.** Withholding is capped at gross earnings.

The reasoning behind the pay model is in
`docs/superpowers/specs/2026-08-25-duty-hours-and-salary-formula-design.md`.

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
