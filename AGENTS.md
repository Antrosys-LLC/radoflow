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

Two rules worth knowing before editing:

- **Premium rates are absolute rupees per hour, never multiples of basic pay.**
  A multiplier chains overtime to the base wage, so a raise silently inflates
  every premium.
- **Net pay can never be negative.** Withholding is capped at gross earnings.

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
