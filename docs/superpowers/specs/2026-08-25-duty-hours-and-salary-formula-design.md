# Duty hours, calendar-day salary, contractors, and the 34 departments

**Date:** 2026-08-25
**Status:** Approved design, not yet implemented

## Why

Payroll currently prorates a monthly salary against a fixed 26-day month and
pays overtime at an absolute rupee rate negotiated per person. Neither matches
how Rado actually pays.

The floor works on a calendar-day rate: a salary figure divided by the real
length of the month, multiplied by the days a person actually turned up.
Overtime is one eighth of that daily rate. Guards work twelve-hour duty that
their salary already covers, while operators on the same twelve-hour shift are
paid for four of those hours as overtime. Sunday is not a working day for
anyone, and every hour worked on one is overtime. Four departments are staffed
by contractors who receive an agreed amount and no calculation at all.

None of that is expressible today.

## What changes

### The pay model

```
daysInMonth = calendar days in the period      (28 / 29 / 30 / 31)
perDay      = netSalary / daysInMonth
otRate      = perDay / 8                       universal, including guards
```

**Base pay** is `perDay × workingDays`. A working day is a non-Sunday day the
person actually attended. Sundays never count. Absences never count.

Two consequences of "actually attended" that are easy to miss:

- **A day counts once, whatever its length.** Someone who clocks two hours and
  someone who clocks eight both earn one working day. Hours only matter above
  the duty boundary, where they become overtime. A short day is therefore paid
  in full, which is deliberate: the alternative is paying salary by the hour,
  which is not what a salary is.
- **Leave is unpaid.** A day on approved leave was not attended, so it is not a
  working day and earns nothing. This follows directly from the confirmed
  model, but it is a change in kind rather than degree — today leave is tracked
  separately from absence — so it is called out here and raised again in the
  open questions.

The salary figure is therefore a **daily rate, not a monthly take-home**. Nobody
receives the full stated salary in any month, because Sundays are never working
days. On ₨40,000 across a 31-day month, a flawless month pays roughly ₨33,500.
This was confirmed deliberately with the worked example
`40000 / 31 = 1290.32 × 25 working days = ₨32,258`.

**Overtime** is `otRate ×` the sum of:

- hours clocked beyond the person's duty hours on a non-Sunday day, and
- every hour clocked on a Sunday.

**Duty hours** is one number per person: how many hours their salary covers.

| Person          | Duty hours | 12h Monday           | 12h Sunday     |
| --------------- | ---------- | -------------------- | -------------- |
| Operator, 8 + 4 | 8          | 8 duty + 4 OT = ₨645 | 12 OT = ₨1,935 |
| Guard           | 12         | 12 duty, no OT       | 12 OT = ₨1,935 |

Same shift, same clock, different pay boundary.

**Sunday policy** is a separate per-person flag: `off`, `optional`, or
`compulsory`. Compulsory carries **no additional deduction**. Missing a Sunday
already costs that person their Sunday overtime, which is real money; a second
penalty on a day that is not a working day is hard to defend to the worker.
A missed compulsory Sunday is flagged as a violation in attendance and reports
instead.

**Contractors** receive a flat agreed amount. No day proration, no overtime, no
late penalty, no attendance dependency.

**Hourly staff are unchanged** — hours × their hourly rate.

### Reversal of an existing rule

`AGENTS.md` states that premium rates are absolute rupees per hour and never
multiples of basic pay, because a multiplier chains overtime to the base wage so
a raise silently inflates every premium.

This design deliberately reverses that rule for **overtime**, which becomes
`perDay / 8` and is therefore derived from salary. The reason the original rule
existed still holds — a raise now does raise overtime — but that is how Rado
pays, and the per-person absolute overtime rate it replaces was never used as
intended. `AGENTS.md` must be updated in the same change so the documentation
and the code do not contradict each other.

Weekend and holiday premiums keep their absolute rupee rates. Only overtime
changes.

## Schema

One migration.

```sql
create type public.worker_type   as enum ('employee','contractor');
create type public.sunday_policy as enum ('off','optional','compulsory');

alter table public.departments
  add column default_worker_type public.worker_type not null default 'employee';

alter table public.profiles
  add column worker_type   public.worker_type   not null default 'employee',
  add column duty_hours    numeric(4,2)         not null default 8
    check (duty_hours > 0 and duty_hours <= 24),
  add column sunday_policy public.sunday_policy not null default 'off';
```

Contractors reuse `monthly_salary` as their agreed amount. A separate
`contract_amount` column would hold the same number under a second name and
create a question about which one wins. A column comment records the dual
meaning.

`profiles.duty_hours` defaults to 8, so every existing person keeps today's
behaviour until someone changes them.

### Saturday becomes a working day

`work_week` currently marks both Saturday and Sunday as non-working at both
sites. The rule is "all days except Sunday". Saturday flips to working in this
migration. Without it every Saturday would pay as overtime, which is a large
and silent overpayment.

### The 34 departments

Seeded idempotently for every site, `on conflict do nothing`.

| Code     | Name              | Type       |
| -------- | ----------------- | ---------- |
| `ADMIN`  | Admin             | employee   |
| `ACCT`   | Accounts          | employee   |
| `KORA`   | Kora              | employee   |
| `TSTORE` | Tayyar Store      | employee   |
| `ELEC`   | Electric          | employee   |
| `WSHOP`  | Workshop          | employee   |
| `CREAT`  | Creation          | employee   |
| `KARE`   | Kare              | employee   |
| `SING`   | Singing           | employee   |
| `KARADR` | Kara Drawing      | employee   |
| `MERC`   | Mercrize          | employee   |
| `BOUZ`   | Bouzer            | employee   |
| `ENGR`   | Engraving         | employee   |
| `COLOR`  | Color             | employee   |
| `SUNTX`  | Suntex            | employee   |
| `DGMAN`  | Digital Mandi Man | employee   |
| `AUTO1`  | Auto 01           | employee   |
| `AUTO2`  | Auto 02           | employee   |
| `CALND`  | Calander          | employee   |
| `SOOPR`  | Sooper            | employee   |
| `VENCH`  | Vench             | employee   |
| `AGER`   | Ager Machine      | employee   |
| `JIGDY`  | Jigger Dyeing     | employee   |
| `JIGDR`  | Jigger Drawing    | employee   |
| `DGMC`   | Digital Machine   | employee   |
| `PPC`    | PPC               | employee   |
| `BOILR`  | Boiler            | employee   |
| `GM`     | GM                | employee   |
| `SWEEP`  | Sweepers          | employee   |
| `RESGN`  | Resigned          | employee   |
| `FOLD`   | Folding           | contractor |
| `YCP`    | Yasine CP         | contractor |
| `ZNP`    | Zafar Nug Packing | contractor |
| `ANTRO`  | Antrosys          | contractor |

Several names are transliterations and may need correcting against the
company's own spelling. `RESGN` (Resigned) is a status bucket rather than a
real department; it is included because it was requested, and it is worth
revisiting whether `employment_status = 'terminated'` should carry that
meaning instead.

The five existing demo departments in `supabase/seed.sql` are development-only
and are left alone.

## Engine

All in `src/lib/payroll/`.

### `types.ts`

`Employee` gains `workerType`, `dutyHours`, and `sundayPolicy`. `PayrollInput`
gains the period's `daysInMonth`, since the daily rate can no longer be derived
from the employee and the rule alone.

`PayRule.standardDaysPerMonth` stops driving monthly pay. The field and its
column stay, marked deprecated. Dropping them is a separate, riskier change and
is out of scope.

### `hours.ts`

`derivedHourlyRate(monthlySalary, rule)`, which divides by 26, is deleted.
It is replaced by:

- `dailyRate(netSalary, daysInMonth)` → `netSalary / daysInMonth`
- `overtimeRate(netSalary, daysInMonth)` → `dailyRate / 8`

`splitDayHours` stops reading the site-wide `rule.standardHoursPerDay` and takes
the person's `dutyHours`. Sunday hours route to the **overtime** bucket rather
than the weekend bucket.

The `weekend` bucket survives for declared off-days and special working days
that are not Sundays, but will be zero for most people once Saturday is a
working day.

### `engine.ts`

`calculatePayroll` gains a third branch. In order:

1. **Contractor** — base pay is the agreed amount, one payslip line, exits
   before overtime, absence proration, and late penalties.
2. **Monthly employee** — `perDay × workingDays`, plus overtime as defined
   above.
3. **Hourly** — unchanged.

The existing "unpaid absence" deduction line disappears for monthly employees.
Absence is no longer a deduction from a full salary; it is simply a day that
was never earned. The payslip must show `workingDays × perDay` directly, so a
worker can check their own payslip by counting days on a calendar.

### `late.ts`

The day rate behind late penalties changes from `salary / 26` to
`salary / daysInMonth`, so a penalty expressed as "one day" matches what a day
is actually worth.

### `run.ts`

Derives `daysInMonth` from the period and passes it through. Selects
`worker_type`, `duty_hours`, and `sunday_policy`. Payroll totals split employee
cost from contractor cost.

## The add-person form

`src/app/(app)/admin/users/` — department is chosen first and pre-fills worker
type from `departments.default_worker_type`, overridable per person.

Contractor selected → duty fields hide, a single agreed-amount field shows.

Employee selected → two fields:

| Requested option     | `duty_hours` | Shift         |
| -------------------- | ------------ | ------------- |
| 8 hours direct duty  | 8            | 8-hour shift  |
| 8 hours + 4 overtime | 8            | 12-hour shift |
| 12 hours duty        | 12           | 12-hour shift |

The first two options store an identical pay boundary and differ only in the
shift the person is rostered to; overtime comes from the clock in both cases.
They are presented as separate named choices because that is how the floor
talks about them, and the form sets both fields.

Sunday policy is its own select: off, optional, compulsory.

## Testing

Test-first. The anchor case is the one confirmed in conversation:
₨40,000 salary, 31-day month, 25 working days → ₨32,258.

Beyond that:

- guard at 12h duty earns zero overtime on a 12-hour Monday
- that same guard earns ₨1,935 for a 12-hour Sunday
- an 8h-duty worker earns the same ₨1,935 for the same Sunday
- an 8h-duty worker on a 12-hour Monday earns 4 hours of overtime, ₨645
- leaving at 11 hours pays 3 hours of overtime, not 4
- one salary produces different daily rates in February and August
- a two-hour day and an eight-hour day both earn exactly one working day
- a day on approved leave earns nothing
- a contractor receives the flat amount with no proration and no overtime
- a contractor with zero attendance still receives the flat amount
- Saturday is a working day and pays no overtime

The existing suite in `engine.test.ts` encodes the old
`salary − (salary/26 × absences)` rule. Those cases are rewritten rather than
deleted, and each rewrite is shown for review rather than applied silently.

## Migration risk

The engine recomputes from source on every run rather than adjusting stored
figures. Any **unlocked** past period will therefore produce different numbers
once this ships.

Closed periods must be locked before deployment. The implementation adds a
guard that refuses to recompute a period starting before a configured cutover
date, so an old period cannot be silently repriced by someone pressing
recalculate.

## Out of scope

- Declared holidays keep their existing absolute rupee rate. Only Sunday
  becomes overtime.
- A named `duty_patterns` table for editing "Guard" centrally across every
  guard. Two columns on `profiles` are enough at this size; the columns migrate
  into such a table cleanly if editing people one at a time becomes a chore.
- Dropping `standard_days_per_month`.
- Any change to how contractors are invoiced or paid outside the system.

## Open questions for the reviewer

1. Do the department spellings match the company's own? Several are
   transliterations.
2. Should `SWEEP` (Sweepers) default to contractor rather than employee?
3. Should a missed compulsory Sunday carry a deduction after all, or is losing
   the Sunday overtime penalty enough?
4. Is approved leave genuinely unpaid? The confirmed model says a working day is
   a day attended, which makes leave worth nothing. If any leave type is meant
   to be paid, it has to be counted as a working day and the leave types need a
   paid/unpaid flag.
