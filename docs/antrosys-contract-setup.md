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
