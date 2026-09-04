# Roles, Contractors, and Punch Pairing Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Split the admin role in two, add an Accounts role, bill contract firms once instead of per person, exempt owners from attendance and payroll, pair punches into check-in/check-out/break, deduct late arrivals by the minute, floor clock-outs to the half hour, and show the floor live.

**Architecture:** Everything that decides money or hours stays in pure, dependency-free modules under `src/lib/payroll/` and `src/lib/attendance/`, unit-tested with vitest and never talking to Supabase. Database changes are additive, effective-dated migrations that never edit an existing migration file. Access control is data — rows in `permissions` and `role_permissions` read by RLS policies calling `app.has_permission()` — so a new role is an insert, not a policy rewrite.

**Tech Stack:** Next.js 16 (App Router, server components + server actions), React 19, TypeScript with `exactOptionalPropertyTypes`, Supabase (Postgres + RLS + generated types), vitest, Tailwind 4.

**Spec:** `docs/superpowers/specs/2026-09-04-roles-contractors-and-punch-pairing-design.md`

## Global Constraints

- **Timezone is `Asia/Karachi` and currency is PKR.** Never use `new Date(y, m, d)` for a work date — parse `YYYY-MM-DD` as UTC (`new Date(\`${d}T00:00:00Z\`)`) so the server's own zone cannot move a Sunday to a Saturday.
- **Never edit an existing migration file.** Add a new one named `supabase/migrations/YYYYMMDDHHMMSS_<topic>.sql`. The migrations in this plan are numbered `20260904*` and must be applied in the order given.
- **`exactOptionalPropertyTypes` is on.** Build optional fields by spreading (`...(x === undefined ? {} : { key: x })`), never by assigning `undefined`.
- **Money and hours round half-up to 2 decimals** through `round2`/`roundMoney` in `src/lib/payroll/hours.ts`. Do not use bare `Math.round`.
- **Superuser roles are `admin-antrosys` and `ceo` only.** Nothing in this plan adds a third.
- **Every new table gets RLS.** `alter table ... enable row level security`, a read policy, a write policy, and `grant` to `authenticated, service_role`.
- **After any migration:** run `npm run db:reset`, then `npm run db:types:local`, then `npm run typecheck`. The regenerated `src/lib/supabase/database.types.ts` is the proof the columns landed. Use `db:types:local` and never bare `db:types` — the latter targets the linked REMOTE Supabase project and will silently generate types that do not reflect your local migrations.
- **Test command:** `npm test` (vitest, `src/**/*.test.ts` only — there is no database test harness; migrations are verified through `db:reset` + `db:types`).

---

## File Structure

**Created:**

| Path | Responsibility |
| --- | --- |
| `supabase/migrations/20260904090000_factory_admin_and_accounts.sql` | Two roles, manager `attendance.approve`, department-scoped directory |
| `supabase/migrations/20260904090100_people_model.sql` | `contract_amount`, `payroll_exempt`, `break_minutes`, `hours_are_final` |
| `supabase/migrations/20260904090200_per_minute_late_penalty.sql` | `'minute'` on the `penalty_basis` enum |
| `supabase/migrations/20260904090250_seed_per_minute_tier.sql` | The seeded per-minute tier (separate file: Postgres refuses a new enum value in its creating transaction) |
| `supabase/migrations/20260904090300_payroll_contract_items.sql` | Firm-level payroll line table + RLS |
| `src/lib/attendance/sessions.ts` | Pure punch → sessions/breaks/directions. No I/O. |
| `src/lib/attendance/sessions.test.ts` | Tests for the above |
| `src/lib/payroll/approval.ts` | Pure: does a finished run need an approval row, and what does it say |
| `src/lib/payroll/approval.test.ts` | Tests for the above |
| `src/lib/payroll/late.test.ts` | Tests for late penalties (none exist today) |
| `src/app/(app)/devices/live/page.tsx` | Live floor feed, last 400 punches |
| `src/lib/people/tracking.ts` | Pure: the three-way tracking choice ↔ two booleans |
| `src/lib/people/tracking.test.ts` | Tests for the above |
| `src/app/(app)/rates/contract-firms.tsx` | Client component for editing contract amounts |
| `supabase/migrations/20260904090400_attendance_approval.sql` | `approved_by` / `approved_at`, manager update policy |
| `src/app/(app)/attendance/logs/actions.ts` | Manager sign-off action |

**Modified:**

| Path | Change |
| --- | --- |
| `src/lib/attendance/compute.ts` | Delegate pairing to `sessions.ts`; add break minutes and clock-out flooring |
| `src/lib/attendance/compute.test.ts` | Cases for flooring and breaks |
| `src/lib/payroll/types.ts` | `hoursAreFinal` on `AttendanceDay`; `'minute'` on `LatePenaltyTier.basis`; `payrollExempt` on `Employee` |
| `src/lib/payroll/hours.ts` | Honour `hoursAreFinal`; extract `workedHoursOf` |
| `src/lib/payroll/late.ts` | Per-minute basis |
| `src/lib/payroll/engine.ts` | Remove the per-person contractor branch; pass duty hours to late penalties |
| `src/lib/payroll/engine.test.ts` | Rewrite contractor assertions |
| `src/lib/payroll/run.ts` | Exclude contractors and exempt people; emit contract items; warn on unset amounts |
| `src/lib/devices/ingest.ts` | Write derived direction, break minutes, floored hours |
| `src/app/(app)/payroll/actions.ts` | Raise an approval when the runner cannot approve |
| `src/app/(app)/admin/users/users-manager.tsx` | Three-way tracking choice; "No shift" option |
| `src/app/(app)/admin/users/actions.ts` | Persist `payroll_exempt`, `flexible_hours` |
| `src/app/(app)/rates/people-pay.tsx` | Same three-way choice; "No shift" option |
| `src/app/(app)/rates/page.tsx` | Contract-firm amounts card |
| `src/lib/pay/actions.ts` | Persist `payroll_exempt`; `setContractAmount` action |
| `src/lib/navigation.ts` | `/devices/live` entry |
| `src/app/(app)/attendance/logs/page.tsx` | Approved tag and the sign-off control |
| `AGENTS.md` | The contractor rule changes meaning |

---

## Phase 1 — The access model

### Task 1: Factory Admin, Accounts, manager approvals, department directory

**Files:**
- Create: `supabase/migrations/20260904090000_factory_admin_and_accounts.sql`
- Modify: `src/lib/supabase/database.types.ts` (regenerated, not hand-edited)

**Interfaces:**
- Consumes: nothing
- Produces: role keys `'factory-admin'` and `'accounts'` usable by `user_roles`; `public.employee_directory` now returns same-department rows

- [ ] **Step 1: Write the migration**

Create `supabase/migrations/20260904090000_factory_admin_and_accounts.sql`:

```sql
-- ============================================================================
-- Two roles, a manager who can sign off, and a roster an employee may see.
--
-- Antrosys maintains the software; the factory has its own administrator. They
-- are different people with different reasons to hold the keys, and until now
-- they shared one role.
--
-- Factory Admin is deliberately NOT flagged is_superuser. app.has_permission()
-- short-circuits on the superuser flag before it reads the deny list, so a
-- superuser is one nobody can restrict in any degree — which is right for the
-- two roles that must never be locked out, and wrong for a role the CEO wants
-- to be able to trim. Granting every permission explicitly gives identical
-- power on day one and leaves a deny override able to bite.
-- ============================================================================

insert into public.roles (key, name, description, is_system, is_superuser, rank)
values (
  'factory-admin',
  'Factory Admin',
  'Runs the factory. Every capability by default; individual ones can be revoked by the CEO.',
  true,
  false,
  25
)
on conflict (key) do update
   set name         = excluded.name,
       description  = excluded.description,
       is_system    = excluded.is_system,
       is_superuser = excluded.is_superuser,
       rank         = excluded.rank;

-- Every permission in the catalogue, including any a later migration adds that
-- re-runs this insert.
insert into public.role_permissions (role_id, permission_id)
select r.id, p.id
  from public.roles r
  cross join public.permissions p
 where r.key = 'factory-admin'
on conflict (role_id, permission_id) do nothing;

-- ---------------------------------------------------------------------------
-- Accounts
--
-- Computes payroll; does not sign it off. payroll.approve and payroll.pay are
-- withheld deliberately, so the desk that produces the numbers is not the desk
-- that releases the money.
-- ---------------------------------------------------------------------------

insert into public.roles (key, name, description, is_system, is_superuser, rank)
values (
  'accounts',
  'Accounts',
  'Sees all attendance and payroll, and runs payroll. Approval and disbursement stay with an admin.',
  true,
  false,
  35
)
on conflict (key) do update
   set name        = excluded.name,
       description = excluded.description,
       is_system   = excluded.is_system,
       rank        = excluded.rank;

insert into public.role_permissions (role_id, permission_id)
select r.id, p.id
  from public.roles r
  join public.permissions p on true
 where (r.key, p.key) in (
   ('accounts', 'dashboard.employee'),  ('accounts', 'leave.request'),
   ('accounts', 'directory.view'),      ('accounts', 'attendance.view.all'),
   ('accounts', 'payroll.view'),        ('accounts', 'payroll.run'),
   ('accounts', 'payslip.view.all'),    ('accounts', 'reports.view')
 )
on conflict (role_id, permission_id) do nothing;

-- ---------------------------------------------------------------------------
-- A manager may sign off their own department's attendance
--
-- Scope is unchanged: the existing RLS policies keep a manager to their own
-- reports. This grants the action, not a wider view.
-- ---------------------------------------------------------------------------

insert into public.role_permissions (role_id, permission_id)
select r.id, p.id
  from public.roles r
  join public.permissions p on true
 where (r.key, p.key) in (('manager', 'attendance.approve'))
on conflict (role_id, permission_id) do nothing;

-- ---------------------------------------------------------------------------
-- An employee sees who else is in their department
--
-- Names, codes, designation and status only. This view exists precisely
-- because it carries no monthly_salary, hourly_rate or pin_hash column, so
-- widening its rows cannot leak pay. Attendance and payslips are unaffected:
-- those tables have their own self-only policies.
-- ---------------------------------------------------------------------------

create or replace view public.employee_directory
with (security_invoker = off) as
  select
    p.id,
    p.employee_code,
    p.full_name,
    p.photo_url,
    p.site_id,
    p.department_id,
    p.designation,
    p.manager_id,
    p.pay_class,
    p.requires_attendance,
    p.status,
    p.joined_on
  from public.profiles p
  where p.id = auth.uid()
     or p.manager_id = auth.uid()
     or app.can('directory.view', p.site_id)
     or p.department_id = (
          select me.department_id from public.profiles me where me.id = auth.uid()
        );

grant select on public.employee_directory to authenticated;
```

- [ ] **Step 2: Apply it and verify it fails nothing**

Run: `npm run db:reset`
Expected: completes without error, and the migration filename appears in the applied list.

If it errors on `attendance.approve` not existing, stop — the permission is defined in `20260814090400_access_catalog.sql` and a failure here means migrations ran out of order.

- [ ] **Step 3: Verify the rows landed**

Run:

```bash
npx supabase db reset --debug 2>&1 | tail -5
```

Then confirm through the app rather than psql (there is no SQL test harness): start `npm run dev`, sign in as the seeded admin, open `/admin/roles`, and check that **Factory Admin** and **Accounts** both appear. Factory Admin must show the full permission list; Accounts must show exactly eight permissions and must **not** show "Approve payroll" or "Mark payroll paid".

- [ ] **Step 4: Regenerate types and typecheck**

Run: `npm run db:types:local && npm run typecheck`
Expected: both succeed. `database.types.ts` changes only if the view's column list changed — it did not, so an empty diff here is correct and expected.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/20260904090000_factory_admin_and_accounts.sql src/lib/supabase/database.types.ts
git commit -m "feat: add Factory Admin and Accounts roles, manager sign-off, department roster"
```

---

### Task 2: A payroll run by Accounts queues an approval

**Files:**
- Create: `src/lib/payroll/approval.ts`
- Create: `src/lib/payroll/approval.test.ts`
- Modify: `src/app/(app)/payroll/actions.ts` (the `runPeriod` function, around line 68)

**Interfaces:**
- Consumes: `RunSummary` from `src/lib/payroll/run.ts`
- Produces: `needsApproval(permissions: ReadonlySet<string>): boolean` and `approvalRowFor(input: ApprovalInput): ApprovalRow`

- [ ] **Step 1: Write the failing test**

Create `src/lib/payroll/approval.test.ts`:

```ts
import { describe, expect, it } from "vitest";

import { approvalRowFor, needsApproval } from "./approval";

describe("needsApproval", () => {
  it("is true for someone who can run but not approve", () => {
    expect(needsApproval(new Set(["payroll.run", "payroll.view"]))).toBe(true);
  });

  it("is false for someone who can approve their own run", () => {
    expect(needsApproval(new Set(["payroll.run", "payroll.approve"]))).toBe(false);
  });
});

describe("approvalRowFor", () => {
  it("describes the run for the admin who will sign it", () => {
    const row = approvalRowFor({
      periodId: "p1",
      siteId: "s1",
      label: "August 2026",
      requestedBy: "u1",
      headcount: 42,
      net: 1_250_000,
    });

    expect(row.entity_type).toBe("payroll_period");
    expect(row.entity_id).toBe("p1");
    expect(row.site_id).toBe("s1");
    expect(row.required_permission).toBe("payroll.approve");
    expect(row.status).toBe("pending");
    expect(row.amount).toBe(1_250_000);
    expect(row.requested_by).toBe("u1");
    expect(row.title).toBe("Payroll for August 2026");
    expect(row.summary).toBe("42 people, net Rs 1,250,000. Calculated and awaiting sign-off.");
  });

  it("says one person, not 1 people", () => {
    const row = approvalRowFor({
      periodId: "p2",
      siteId: "s1",
      label: "September 2026",
      requestedBy: "u1",
      headcount: 1,
      net: 40_000,
    });

    expect(row.summary).toBe("1 person, net Rs 40,000. Calculated and awaiting sign-off.");
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npm test -- approval`
Expected: FAIL — cannot resolve `./approval`.

- [ ] **Step 3: Write the implementation**

Create `src/lib/payroll/approval.ts`:

```ts
/**
 * Putting a finished payroll run in front of someone who can sign it.
 *
 * Accounts calculates payroll but deliberately does not hold `payroll.approve`.
 * Leaving the period in `review` and hoping an admin notices is not an approval
 * step — it is a status. A row in `public.approvals`, which already exists for
 * exactly this and is what the C-level panels read, is.
 *
 * Kept pure and separate from the action so the wording and the amounts can be
 * tested without a database.
 */

export interface ApprovalInput {
  periodId: string;
  siteId: string;
  /** The period's human label, e.g. "August 2026". */
  label: string;
  requestedBy: string;
  headcount: number;
  net: number;
}

export interface ApprovalRow {
  entity_type: string;
  entity_id: string;
  site_id: string;
  title: string;
  summary: string;
  amount: number;
  requested_by: string;
  required_permission: string;
  status: "pending";
}

/**
 * True when the person who ran payroll cannot sign it off themselves.
 *
 * Superuser expansion has already been applied to the set by the session
 * loader, so an unrestricted role holds `payroll.approve` here and correctly
 * queues nothing.
 */
export function needsApproval(permissions: ReadonlySet<string>): boolean {
  return !permissions.has("payroll.approve");
}

/** Rupees with thousands separators and no decimals — the payslip convention. */
function money(amount: number): string {
  return `Rs ${Math.round(amount).toLocaleString("en-US")}`;
}

export function approvalRowFor(input: ApprovalInput): ApprovalRow {
  const people = input.headcount === 1 ? "1 person" : `${input.headcount} people`;

  return {
    entity_type: "payroll_period",
    entity_id: input.periodId,
    site_id: input.siteId,
    title: `Payroll for ${input.label}`,
    summary: `${people}, net ${money(input.net)}. Calculated and awaiting sign-off.`,
    amount: input.net,
    requested_by: input.requestedBy,
    required_permission: "payroll.approve",
    status: "pending",
  };
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npm test -- approval`
Expected: PASS, 4 tests.

- [ ] **Step 5: Wire it into the run action**

In `src/app/(app)/payroll/actions.ts`, add the import at the top with the other `@/lib` imports:

```ts
import { approvalRowFor, needsApproval } from "@/lib/payroll/approval";
```

Change `runPeriod` so it captures the session (it currently discards the return of `requirePermission`) and queues the approval after a successful run. The function starts at line 68; replace its permission line and add the block after `runPayrollForPeriod` returns:

```ts
export async function runPeriod(periodId: string): Promise<PayrollResultMessage> {
  const session = await requirePermission("payroll.run");

  try {
    const summary = await runPayrollForPeriod(periodId);

    /*
     * Accounts computes; an admin releases. Queuing the run rather than
     * leaving it in `review` is what actually puts it in front of someone —
     * `public.approvals` is what the approval panels read.
     */
    if (needsApproval(session.permissions)) {
      const supabase = await createClient();
      const { data: period } = await supabase
        .from("payroll_periods")
        .select("site_id, label")
        .eq("id", periodId)
        .maybeSingle();

      if (period) {
        await supabase.from("approvals").insert(
          approvalRowFor({
            periodId,
            siteId: period.site_id,
            label: period.label,
            requestedBy: session.userId,
            headcount: summary.headcount,
            net: summary.net,
          }),
        );
      }
    }

    // ... the rest of the existing body is unchanged
```

If `createClient` is not already imported in this file, add `import { createClient } from "@/lib/supabase/server";`.

- [ ] **Step 6: Typecheck and lint**

Run: `npm run typecheck && npm run lint`
Expected: both pass.

- [ ] **Step 7: Commit**

```bash
git add src/lib/payroll/approval.ts src/lib/payroll/approval.test.ts "src/app/(app)/payroll/actions.ts"
git commit -m "feat: queue an approval when payroll is run by someone who cannot sign it"
```

---

## Phase 2 — The people model

### Task 3: The four new columns

**Files:**
- Create: `supabase/migrations/20260904090100_people_model.sql`
- Modify: `src/lib/supabase/database.types.ts` (regenerated)

**Interfaces:**
- Consumes: nothing
- Produces: `departments.contract_amount`, `profiles.payroll_exempt`, `attendance_days.break_minutes`, `attendance_days.hours_are_final`

- [ ] **Step 1: Write the migration**

Create `supabase/migrations/20260904090100_people_model.sql`:

```sql
-- ============================================================================
-- A contract firm's agreed amount, owners who are on no system at all, and
-- the two attendance columns punch pairing needs.
--
-- Each of these puts an exception in data rather than in code, the pattern the
-- rest of this schema follows: requires_attendance, flexible_hours and
-- overtime_eligible all exist for the same reason.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- What the firm is owed, not what its people are owed
--
-- Antrosys bills one agreed figure for the whole firm. Pricing each of its
-- three people separately charged three times what was agreed.
--
-- Meaningful only where default_worker_type is 'contractor'. On any other
-- department it stays zero and nothing reads it.
-- ---------------------------------------------------------------------------

alter table public.departments
  add column contract_amount numeric(14, 2) not null default 0
    check (contract_amount >= 0);

comment on column public.departments.contract_amount is
  'The firm''s agreed monthly amount, billed once for the whole department. Payroll charges this instead of pricing the people inside it. Zero on a directly-employed department.';

-- ---------------------------------------------------------------------------
-- Owners
--
-- Distinct from requires_attendance, because the two are independent: a
-- monthly manager keeps no attendance and is very much on payroll. This says
-- the person draws nothing through this system at all.
-- ---------------------------------------------------------------------------

alter table public.profiles
  add column payroll_exempt boolean not null default false;

comment on column public.profiles.payroll_exempt is
  'Draws no salary through this system. Excluded from payroll runs entirely rather than priced at zero — a zero line would state they earned nothing, which is a different claim from not being paid here.';

create index on public.profiles (payroll_exempt) where payroll_exempt;

-- ---------------------------------------------------------------------------
-- Breaks, and a day whose hours must not be rounded twice
--
-- hours_are_final marks a day whose clock-out was already floored to the half
-- hour. splitDayHours() would otherwise round the total again, half-up on a
-- fifteen-minute step, handing back some of what the floor took.
-- ---------------------------------------------------------------------------

alter table public.attendance_days
  add column break_minutes integer not null default 0
    check (break_minutes >= 0),
  add column hours_are_final boolean not null default false;

comment on column public.attendance_days.break_minutes is
  'Unpaid time between a clock-out and the next clock-in on the same day. Already excluded from the hours totals; recorded so a supervisor can see where the day went.';

comment on column public.attendance_days.hours_are_final is
  'The clock-out was floored to the half hour, so the payroll engine must not round these hours again.';
```

- [ ] **Step 2: Apply and regenerate types**

Run: `npm run db:reset && npm run db:types:local`
Expected: both succeed.

- [ ] **Step 3: Verify the columns reached the generated types**

Run: `grep -n "payroll_exempt\|contract_amount\|break_minutes\|hours_are_final" src/lib/supabase/database.types.ts | head`
Expected: each name appears at least three times (Row, Insert, Update).

- [ ] **Step 4: Typecheck**

Run: `npm run typecheck`
Expected: passes. Nothing reads the new columns yet.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/20260904090100_people_model.sql src/lib/supabase/database.types.ts
git commit -m "feat: add contract amount, payroll exemption, break minutes and final-hours flag"
```

---

### Task 4: One tracking question, and a "No shift" option

**Files:**
- Create: `src/lib/people/tracking.ts`
- Create: `src/lib/people/tracking.test.ts`
- Modify: `src/app/(app)/admin/users/users-manager.tsx` (add form near line 1226, edit form near line 680)
- Modify: `src/app/(app)/admin/users/actions.ts` (the profile insert, line 92–111)
- Modify: `src/app/(app)/admin/users/page.tsx` (the select at line 34, the mapping at line 98)
- Modify: `src/app/(app)/rates/people-pay.tsx` (near line 324)
- Modify: `src/app/(app)/rates/page.tsx` (the select at line 48, the mapping at line 84)
- Modify: `src/lib/pay/actions.ts` (the update at line 55–70)

**Interfaces:**
- Consumes: `profiles.payroll_exempt` from Task 3
- Produces: `trackingFlags(value: string | null): { requires_attendance: boolean; payroll_exempt: boolean }` and `trackingValueOf(flags): "tracked" | "salary_only" | "exempt"` in `src/lib/people/tracking.ts`; a form field named `tracking`; a `shift_id` of `""` meaning no shift

- [ ] **Step 1: Write the failing test for the decoder**

`src/lib/pay/actions.ts` is a `"use server"` module, and every export from one
must be an async function — a synchronous helper there is a build error. The
decoder is pure, so it belongs in `src/lib/people/`, beside `match.ts`.

Create `src/lib/people/tracking.test.ts`:

```ts
import { describe, expect, it } from "vitest";

import { trackingFlags, trackingValueOf } from "./tracking";

describe("trackingFlags", () => {
  it("puts an owner on neither system", () => {
    expect(trackingFlags("exempt")).toEqual({
      requires_attendance: false,
      payroll_exempt: true,
    });
  });

  it("pays salary-only staff without expecting punches", () => {
    expect(trackingFlags("salary_only")).toEqual({
      requires_attendance: false,
      payroll_exempt: false,
    });
  });

  it("tracks everyone else", () => {
    expect(trackingFlags("tracked")).toEqual({
      requires_attendance: true,
      payroll_exempt: false,
    });
  });

  it("defaults a missing or unknown value to tracked", () => {
    // A form that never rendered the field must not silently create an owner.
    expect(trackingFlags(null)).toEqual({ requires_attendance: true, payroll_exempt: false });
    expect(trackingFlags("nonsense")).toEqual({ requires_attendance: true, payroll_exempt: false });
  });
});

describe("trackingValueOf", () => {
  it("round-trips each choice", () => {
    for (const choice of ["tracked", "salary_only", "exempt"] as const) {
      expect(trackingValueOf(trackingFlags(choice))).toBe(choice);
    }
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npm test -- tracking`
Expected: FAIL — cannot resolve `./tracking`.

- [ ] **Step 3: Write the decoder**

Create `src/lib/people/tracking.ts`:

```ts
/**
 * The three arrangements a person can be on, as one choice.
 *
 * `requires_attendance` and `payroll_exempt` are independent booleans, which is
 * right in the schema and wrong in a form: three of their four combinations are
 * real and the fourth ("no salary but keep attendance") is not something anyone
 * has asked for. One question with three answers cannot express the fourth.
 *
 * Pure, and deliberately not in `src/lib/pay/actions.ts`: that file is
 * `"use server"`, where every export must be an async server action.
 */

export type TrackingChoice = "tracked" | "salary_only" | "exempt";

export interface TrackingFlags {
  requires_attendance: boolean;
  payroll_exempt: boolean;
}

/**
 * Unknown and missing both fall through to `tracked`, never to `exempt`. A
 * form that failed to render the field must not quietly create someone who is
 * on no payroll and whose absence nobody notices.
 */
export function trackingFlags(value: string | null): TrackingFlags {
  switch (value) {
    case "exempt":
      return { requires_attendance: false, payroll_exempt: true };
    case "salary_only":
      return { requires_attendance: false, payroll_exempt: false };
    default:
      return { requires_attendance: true, payroll_exempt: false };
  }
}

/** The inverse, for setting a form's default from an existing row. */
export function trackingValueOf(flags: TrackingFlags): TrackingChoice {
  if (flags.payroll_exempt) return "exempt";
  return flags.requires_attendance ? "tracked" : "salary_only";
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npm test -- tracking`
Expected: PASS, 5 tests.

- [ ] **Step 5: Persist it on update**

In `src/lib/pay/actions.ts`, add the import:

```ts
import { trackingFlags } from "@/lib/people/tracking";
```

and in the update call, replace the `requires_attendance: form.get("requires_attendance") !== null,` line with:

```ts
      ...trackingFlags(text(form, "tracking")),
```

- [ ] **Step 6: Persist it on create**

In `src/app/(app)/admin/users/actions.ts`, import the decoder:

```ts
import { trackingFlags } from "@/lib/people/tracking";
```

and in the `admin.from("profiles").insert({...})` call, replace

```ts
    requires_attendance: form.get("requires_attendance") !== null,
```

with

```ts
    ...trackingFlags(text(form, "tracking")),
    flexible_hours: text(form, "shift_id") === "",
```

The `flexible_hours` line is what makes "No shift" mean something: an empty shift selection is the no-shift option, and someone with no shift has no in or out time to keep.

- [ ] **Step 7: Replace the checkbox with the choice, in both forms**

In `src/app/(app)/admin/users/users-manager.tsx`, and again in `src/app/(app)/rates/people-pay.tsx`, replace the `requires_attendance` and `flexible_hours` checkboxes with:

```tsx
<Field label="Attendance and pay">
  <select name="tracking" defaultValue={trackingValue} className={INPUT}>
    <option value="tracked">Tracked — attendance and salary</option>
    <option value="salary_only">Salary only — no attendance kept</option>
    <option value="exempt">Neither — owner</option>
  </select>
  <p className="mt-1 text-xs text-muted-foreground">
    An owner draws nothing through this system and appears on no payroll run.
  </p>
</Field>
```

where `trackingValue` comes from the helper, so the form and the decoder can
never disagree about what a row means:

```tsx
import { trackingValueOf } from "@/lib/people/tracking";

const trackingValue = trackingValueOf({
  requires_attendance: user.requiresAttendance,
  payroll_exempt: user.payrollExempt,
});
```

For the add form (no existing row), use `defaultValue="tracked"`.

- [ ] **Step 8: Add the no-shift option to the shift selector**

In both files, the shift `<select name="shift_id">` gains a first option:

```tsx
<option value="">No shift — must complete duty hours</option>
```

with this note under it:

```tsx
<p className="mt-1 text-xs text-muted-foreground">
  Someone with no shift is never marked late and their clock-out is never
  rounded. Their hours and overtime are still counted from the punches.
</p>
```

- [ ] **Step 9: Carry the new column through the page loaders**

In `src/app/(app)/admin/users/page.tsx` line 34 and `src/app/(app)/rates/page.tsx` line 48, add `payroll_exempt` to the comma-separated select list. In each file's mapping block, add:

```ts
      payrollExempt: profile.payroll_exempt,
```

and add `payrollExempt: boolean;` to the corresponding row interface in `users-manager.tsx` (near line 54) and `people-pay.tsx` (near line 47).

- [ ] **Step 10: Typecheck, lint, and look at it**

Run: `npm run typecheck && npm run lint`
Expected: both pass.

Then start the dev server and open `/admin/users`. Add a person with **Neither — owner** and **No shift**, save, reopen them, and confirm both selections came back. This is a form change with no unit-testable seam; the round trip through the database is the verification.

- [ ] **Step 11: Commit**

```bash
git add src/lib/people/tracking.ts src/lib/people/tracking.test.ts "src/app/(app)/admin/users" "src/app/(app)/rates" src/lib/pay/actions.ts
git commit -m "feat: one tracking question for owners, and a no-shift option"
```

---

### Task 5: Editing a contract firm's amount

**Files:**
- Modify: `src/lib/pay/actions.ts` (new action at the end)
- Create: `src/app/(app)/rates/contract-firms.tsx` (client component)
- Modify: `src/app/(app)/rates/page.tsx` (load contractor departments, render the card)

**Interfaces:**
- Consumes: `departments.contract_amount` from Task 3
- Produces: `setContractAmount(prev: PayResult, form: FormData): Promise<PayResult>` in `src/lib/pay/actions.ts`; `<ContractFirms firms={ContractFirm[]} />` in `src/app/(app)/rates/contract-firms.tsx`, where `ContractFirm = { id: string; name: string; contractAmount: number; headcount: number }`

- [ ] **Step 1: Write the action**

At the end of `src/lib/pay/actions.ts`:

```ts
/**
 * Sets what a contract firm is owed for a month.
 *
 * One figure for the whole department, because that is what was agreed with
 * the firm. The people inside it cost nothing individually — see
 * `runPayrollForPeriod`, which emits one contract line per department and no
 * payroll item for its people.
 */
export async function setContractAmount(_prev: PayResult, form: FormData): Promise<PayResult> {
  await requirePermission("rates.manage");

  const departmentId = text(form, "department_id");
  const amount = Number(text(form, "contract_amount") || 0);

  if (!departmentId) return { ok: false, message: "Pick a contract firm." };
  if (!Number.isFinite(amount) || amount < 0) {
    return { ok: false, message: "The contract amount cannot be negative." };
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from("departments")
    .update({ contract_amount: amount })
    .eq("id", departmentId);

  if (error) return { ok: false, message: error.message };

  revalidatePath("/rates");
  revalidatePath("/payroll");

  return { ok: true, message: "Contract amount saved." };
}
```

Confirm `requirePermission` is imported in this file; if it is not, add `import { requirePermission } from "@/lib/auth/session";`.

- [ ] **Step 2: Load the firms on the rates page**

In `src/app/(app)/rates/page.tsx`, alongside the existing queries:

```ts
const { data: contractFirms } = await supabase
  .from("departments")
  .select("id, name, contract_amount, site_id")
  .eq("default_worker_type", "contractor")
  .eq("is_active", true)
  .order("name");
```

- [ ] **Step 3: Write the client component**

A server action with a `(prev, form)` signature cannot be passed straight to
`<form action=...>`. `people-pay.tsx` already solves this — a client component
holding a form ref, calling the action inside `startTransition`, toasting the
result and calling `router.refresh()`. Follow it exactly.

Create `src/app/(app)/rates/contract-firms.tsx`:

```tsx
"use client";

import { useRef, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Building2 } from "lucide-react";
import { toast } from "sonner";

import { Card, SectionTitle } from "@/components/ui-kit";
import { setContractAmount } from "@/lib/pay/actions";

const INITIAL = { ok: false, message: "" };

export interface ContractFirm {
  id: string;
  name: string;
  contractAmount: number;
  headcount: number;
}

/**
 * What each contract firm is owed for a month.
 *
 * One figure for the whole department, because that is what was agreed with
 * the firm. Payroll bills this once and prices none of the firm's people —
 * see `runPayrollForPeriod`.
 */
export function ContractFirms({ firms }: { firms: readonly ContractFirm[] }) {
  return (
    <Card className="p-4 sm:p-6">
      <SectionTitle
        icon={Building2}
        title="Contract firms"
        subtitle="One agreed amount per firm, billed instead of pricing its people"
      />

      {firms.length === 0 ? (
        <p className="mt-4 text-sm text-muted-foreground">
          No contractor departments at this factory.
        </p>
      ) : (
        <div className="mt-4 grid gap-3">
          {firms.map((firm) => (
            <FirmRow key={firm.id} firm={firm} />
          ))}
        </div>
      )}

      <p className="mt-3 text-xs text-muted-foreground">
        A firm left at zero is charged nothing and its people appear on no
        payroll line. The payroll run warns rather than passing over it in
        silence.
      </p>
    </Card>
  );
}

function FirmRow({ firm }: { firm: ContractFirm }) {
  const form = useRef<HTMLFormElement>(null);
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  function save() {
    const element = form.current;
    if (!element) return;
    const data = new FormData(element);

    startTransition(async () => {
      const result = await setContractAmount(INITIAL, data);
      if (result.ok) toast.success(result.message);
      else toast.error(result.message);
      router.refresh();
    });
  }

  return (
    <form
      ref={form}
      onSubmit={(event) => event.preventDefault()}
      className="flex flex-wrap items-end gap-3 rounded-2xl bg-secondary p-3"
    >
      <input type="hidden" name="department_id" value={firm.id} />

      <div className="min-w-[10rem] flex-1">
        <p className="text-sm font-semibold text-foreground">{firm.name}</p>
        <p className="text-xs text-muted-foreground">
          {firm.headcount} {firm.headcount === 1 ? "person" : "people"} on the floor
        </p>
      </div>

      <label className="flex flex-col gap-1">
        <span className="text-xs font-semibold text-muted-foreground">Monthly amount (PKR)</span>
        <input
          type="number"
          name="contract_amount"
          min={0}
          step="0.01"
          defaultValue={firm.contractAmount}
          className="w-40 rounded-xl border border-border bg-card px-3 py-2 text-sm"
        />
      </label>

      <button
        type="button"
        onClick={save}
        disabled={pending}
        className="rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground disabled:opacity-50"
      >
        {pending ? "Saving…" : "Save"}
      </button>
    </form>
  );
}
```

If `Card` or `SectionTitle` are not exported from `@/components/ui-kit`, match
the imports to whatever `src/app/(app)/rates/page.tsx` already uses. Likewise
reuse that file's input and button class constants if it defines them, rather
than keeping the inline classes above.

- [ ] **Step 4: Render it from the page**

In `src/app/(app)/rates/page.tsx`, count each firm's people and pass them down:

```tsx
<ContractFirms
  firms={(contractFirms ?? []).map((firm) => ({
    id: firm.id,
    name: firm.name,
    contractAmount: Number(firm.contract_amount ?? 0),
    headcount: people.filter(
      (p) => p.departmentId === firm.id && p.workerType === "contractor",
    ).length,
  }))}
/>
```

`people` is the list the page already loads for `PeoplePay`; if its rows do not
carry `departmentId`, add `department_id` to that select and map it through.

- [ ] **Step 5: Typecheck, lint, and check the round trip**

Run: `npm run typecheck && npm run lint`
Expected: both pass.

Open `/rates`, set Antrosys to 150000, save, reload, and confirm the value persisted.

- [ ] **Step 6: Commit**

```bash
git add src/lib/pay/actions.ts "src/app/(app)/rates/page.tsx" "src/app/(app)/rates/contract-firms.tsx"
git commit -m "feat: set a contract firm's agreed monthly amount"
```

---

## Phase 3 — Punch pairing, breaks, rounding, lateness

### Task 6: The session splitter

**Files:**
- Create: `src/lib/attendance/sessions.ts`
- Create: `src/lib/attendance/sessions.test.ts`

**Interfaces:**
- Consumes: nothing
- Produces: `splitIntoSessions(punches: readonly TimedPunch[], windowHours?: number): SessionSplit`, where `TimedPunch = { punchedAt: Date }` and `SessionSplit = { sessions: PunchSession[]; directions: ("in" | "out")[]; breakMinutes: number; workedHours: number; hasOpenSession: boolean }`, and `PunchSession = { in: Date; out: Date | null }`

- [ ] **Step 1: Write the failing test**

Create `src/lib/attendance/sessions.test.ts`:

```ts
import { describe, expect, it } from "vitest";

import { splitIntoSessions } from "./sessions";

/** A punch on 14 August 2026 at the given wall-clock time. */
function at(hour: number, minute = 0, day = 14) {
  return { punchedAt: new Date(2026, 7, day, hour, minute, 0) };
}

describe("splitIntoSessions", () => {
  it("reads the first punch as in and the second as out", () => {
    const split = splitIntoSessions([at(8), at(17)]);

    expect(split.directions).toEqual(["in", "out"]);
    expect(split.workedHours).toBe(9);
    expect(split.breakMinutes).toBe(0);
    expect(split.hasOpenSession).toBe(false);
  });

  it("counts the gap between a clock-out and the next clock-in as a break", () => {
    const split = splitIntoSessions([at(8), at(12), at(13), at(17)]);

    expect(split.directions).toEqual(["in", "out", "in", "out"]);
    expect(split.workedHours).toBe(8);
    expect(split.breakMinutes).toBe(60);
    expect(split.sessions).toHaveLength(2);
  });

  it("handles two breaks in one day", () => {
    const split = splitIntoSessions([at(8), at(10), at(10, 15), at(13), at(13, 30), at(17)]);

    expect(split.breakMinutes).toBe(45);
    expect(split.workedHours).toBe(7.75);
  });

  it("leaves a session open when nothing closes it", () => {
    const split = splitIntoSessions([at(8)]);

    expect(split.directions).toEqual(["in"]);
    expect(split.workedHours).toBe(0);
    expect(split.hasOpenSession).toBe(true);
    expect(split.sessions[0]?.out).toBeNull();
  });

  it("starts a new session past the twelve-hour window", () => {
    // 08:00 then 21:00 is thirteen hours: not a clock-out, a fresh arrival.
    const split = splitIntoSessions([at(8), at(21)]);

    expect(split.directions).toEqual(["in", "in"]);
    expect(split.workedHours).toBe(0);
    expect(split.hasOpenSession).toBe(true);
    expect(split.sessions).toHaveLength(2);
  });

  it("keeps a punch exactly twelve hours later as the clock-out", () => {
    const split = splitIntoSessions([at(8), at(20)]);

    expect(split.directions).toEqual(["in", "out"]);
    expect(split.workedHours).toBe(12);
  });

  it("does not count an overnight gap as a break", () => {
    // A new block starts at 21:00; the gap before it is time at home.
    const split = splitIntoSessions([at(8), at(16), at(21), at(23)]);

    expect(split.breakMinutes).toBe(0);
    expect(split.workedHours).toBe(10);
  });

  it("sorts punches that arrive out of order", () => {
    const split = splitIntoSessions([at(17), at(8), at(13), at(12)]);

    expect(split.workedHours).toBe(8);
    expect(split.breakMinutes).toBe(60);
  });

  it("returns nothing for no punches", () => {
    const split = splitIntoSessions([]);

    expect(split.sessions).toEqual([]);
    expect(split.workedHours).toBe(0);
    expect(split.breakMinutes).toBe(0);
    expect(split.hasOpenSession).toBe(false);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npm test -- sessions`
Expected: FAIL — cannot resolve `./sessions`.

- [ ] **Step 3: Write the implementation**

Create `src/lib/attendance/sessions.ts`:

```ts
import { round2 } from "@/lib/payroll/hours";

/**
 * Turning a day's punches into check-ins, check-outs and breaks.
 *
 * The rule the floor works to: the first punch is a check-in, the next punch
 * inside twelve hours is the matching check-out, and a punch after that opens
 * the day again — so the gap between the check-out and that next check-in is a
 * break. A punch more than twelve hours after the day opened is not a
 * check-out at all; it is somebody arriving.
 *
 * Direction comes from the sequence, not from the terminal. A ZKTeco K50 with
 * no dedicated in/out keys stamps every record with state 0, which arrives as
 * an unbroken run of "in" — trusting it pairs nothing and pays a full shift as
 * zero hours. The device's own state is kept in `punches.raw` for audit.
 *
 * Pure and I/O-free so the pairing can be tested without a database or a
 * terminal.
 */

export interface TimedPunch {
  punchedAt: Date;
}

export interface PunchSession {
  in: Date;
  /** Null when nothing closed the session — a missed clock-out. */
  out: Date | null;
}

export interface SessionSplit {
  sessions: PunchSession[];
  /** One direction per punch, in ascending time order. */
  directions: ("in" | "out")[];
  /** Unpaid minutes between a clock-out and the next clock-in, same block. */
  breakMinutes: number;
  /** Paid time: the sum of the closed sessions. */
  workedHours: number;
  hasOpenSession: boolean;
}

const HOUR_MS = 3_600_000;

const EMPTY: SessionSplit = {
  sessions: [],
  directions: [],
  breakMinutes: 0,
  workedHours: 0,
  hasOpenSession: false,
};

export function splitIntoSessions(
  punches: readonly TimedPunch[],
  windowHours = 12,
): SessionSplit {
  if (punches.length === 0) return { ...EMPTY, sessions: [], directions: [] };

  const times = punches
    .map((p) => p.punchedAt)
    .sort((a, b) => a.getTime() - b.getTime());

  const windowMs = windowHours * HOUR_MS;

  /*
   * Blocks first, pairs second.
   *
   * A block is one stretch of attendance: every punch within the window of the
   * punch that opened it. Splitting on the window before pairing is what stops
   * an overnight gap being read as a very long lunch — the two are
   * indistinguishable once you are only looking at consecutive pairs.
   */
  const blocks: Date[][] = [];
  let block: Date[] = [];
  let anchor: Date | null = null;

  for (const time of times) {
    if (!anchor || time.getTime() - anchor.getTime() > windowMs) {
      if (block.length > 0) blocks.push(block);
      block = [];
      anchor = time;
    }
    block.push(time);
  }
  if (block.length > 0) blocks.push(block);

  const sessions: PunchSession[] = [];
  const directions: ("in" | "out")[] = [];
  let workedMs = 0;
  let breakMs = 0;

  for (const entries of blocks) {
    let previousOut: Date | null = null;

    for (let i = 0; i < entries.length; i += 2) {
      const inAt = entries[i]!;
      const outAt = entries[i + 1] ?? null;

      directions.push("in");
      if (outAt) directions.push("out");

      // Only within a block. The gap before a new block is time at home.
      if (previousOut) breakMs += inAt.getTime() - previousOut.getTime();
      if (outAt) workedMs += outAt.getTime() - inAt.getTime();

      sessions.push({ in: inAt, out: outAt });
      previousOut = outAt;
    }
  }

  return {
    sessions,
    directions,
    breakMinutes: Math.round(breakMs / 60_000),
    workedHours: round2(workedMs / HOUR_MS),
    hasOpenSession: sessions.some((s) => s.out === null),
  };
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npm test -- sessions`
Expected: PASS, 9 tests.

- [ ] **Step 5: Commit**

```bash
git add src/lib/attendance/sessions.ts src/lib/attendance/sessions.test.ts
git commit -m "feat: pair punches into check-ins, check-outs and breaks"
```

---

### Task 7: Clock-out flooring, and compute delegating to sessions

**Files:**
- Modify: `src/lib/attendance/compute.ts`
- Modify: `src/lib/attendance/compute.test.ts`

**Interfaces:**
- Consumes: `splitIntoSessions` from Task 6
- Produces: `floorToHalfHour(at: Date): Date`; `ComputedDay` gains `breakMinutes: number` and `hoursAreFinal: boolean`; `computeDayFromPunches` gains an options field `floorFinalOut?: boolean`

- [ ] **Step 1: Write the failing tests**

Append to `src/lib/attendance/compute.test.ts`:

```ts
import { floorToHalfHour } from "./compute";

describe("flooring a clock-out to the half hour", () => {
  it("takes 11:45 down to 11:30", () => {
    const floored = floorToHalfHour(new Date(2026, 7, 14, 11, 45));
    expect(floored.getHours()).toBe(11);
    expect(floored.getMinutes()).toBe(30);
  });

  it("takes 11:20 down to 11:00", () => {
    const floored = floorToHalfHour(new Date(2026, 7, 14, 11, 20));
    expect(floored.getHours()).toBe(11);
    expect(floored.getMinutes()).toBe(0);
  });

  it("leaves a time already on a slot alone", () => {
    const floored = floorToHalfHour(new Date(2026, 7, 14, 12, 30, 45));
    expect(floored.getHours()).toBe(12);
    expect(floored.getMinutes()).toBe(30);
    expect(floored.getSeconds()).toBe(0);
  });
});

describe("computing a day with flooring on", () => {
  it("floors the leaving time before counting hours", () => {
    // 08:00 to 11:50 is 3h50m; floored to 11:30 it is 3.5.
    const day = computeDayFromPunches([at(8), at(11, 50)], "workday", {
      floorFinalOut: true,
    });

    expect(day.hoursWorked).toBe(3.5);
    expect(day.hoursAreFinal).toBe(true);
  });

  it("does not floor when the person keeps no fixed finish", () => {
    const day = computeDayFromPunches([at(8), at(11, 50)], "workday");

    expect(day.hoursWorked).toBe(3.83);
    expect(day.hoursAreFinal).toBe(false);
  });

  it("floors only the leaving time, not the punches around a break", () => {
    // 08:00-12:05 and 13:00-17:50. Only 17:50 is floored, to 17:30.
    const day = computeDayFromPunches([at(8), at(12, 5), at(13), at(17, 50)], "workday", {
      floorFinalOut: true,
    });

    // 4h05m + 4h30m
    expect(day.hoursWorked).toBe(8.58);
    expect(day.breakMinutes).toBe(55);
  });

  it("never floors a clock-out back past its own clock-in", () => {
    // In at 11:40, out at 11:50. Flooring to 11:30 would invert the session.
    const day = computeDayFromPunches([at(11, 40), at(11, 50)], "workday", {
      floorFinalOut: true,
    });

    expect(day.hoursWorked).toBe(0);
  });

  it("reports the unpaid break minutes", () => {
    const day = computeDayFromPunches([at(8), at(12), at(13), at(17)], "workday");
    expect(day.breakMinutes).toBe(60);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npm test -- compute`
Expected: FAIL — `floorToHalfHour` is not exported, and `hoursAreFinal`/`breakMinutes` are not on `ComputedDay`.

- [ ] **Step 3: Rewrite the pairing half of compute.ts**

In `src/lib/attendance/compute.ts`, delete `pairByDirection`, `pairByAlternating` and the `PairResult` interface, add the import, extend `ComputedDay`, and replace the body of `computeDayFromPunches`:

```ts
import { splitIntoSessions } from "./sessions";
import { round2 } from "@/lib/payroll/hours";
import type { AttendanceStatus, DayType } from "@/lib/payroll/types";

export interface RawPunch {
  punchedAt: Date;
  direction: "in" | "out" | "unknown";
}

export interface ComputedDay {
  firstIn: Date | null;
  lastOut: Date | null;
  hoursWorked: number;
  /** Unpaid time between a clock-out and the next clock-in. */
  breakMinutes: number;
  /**
   * The clock-out was floored to the half hour, so payroll must not round
   * these hours a second time.
   */
  hoursAreFinal: boolean;
  status: AttendanceStatus;
  /** Set when the punch sequence could not be paired cleanly. */
  anomaly: string | null;
  /** Direction per punch in ascending time order, for writing back. */
  directions: ("in" | "out")[];
}

const EMPTY: ComputedDay = {
  firstIn: null,
  lastOut: null,
  hoursWorked: 0,
  breakMinutes: 0,
  hoursAreFinal: false,
  status: "absent",
  anomaly: null,
  directions: [],
};

/**
 * Rounds a leaving time down to :00 or :30.
 *
 * Always down. Someone who leaves at 11:45 is paid to 11:30 and someone who
 * leaves at 11:20 to 11:00 — the factory pays for completed half hours, and
 * rounding up would pay for time nobody worked.
 */
export function floorToHalfHour(at: Date): Date {
  const floored = new Date(at);
  floored.setMinutes(floored.getMinutes() < 30 ? 0 : 30, 0, 0);
  return floored;
}

export interface ComputeOptions {
  requiresAttendance?: boolean;
  /**
   * Floor the day's last clock-out to the half hour.
   *
   * Only true for someone with an enforced shift. A person with no fixed
   * finish has nothing to round against, so flooring them would simply take up
   * to twenty-nine minutes off a day they were asked to complete by hours.
   */
  floorFinalOut?: boolean;
}

export function computeDayFromPunches(
  punches: readonly RawPunch[],
  dayType: DayType,
  options: ComputeOptions = {},
): ComputedDay {
  const isNonWorking = dayType === "off" || dayType === "holiday";

  if (punches.length === 0) {
    if (options.requiresAttendance === false) {
      // Monthly staff who never clock in are not "absent".
      return { ...EMPTY, status: "present" };
    }
    return {
      ...EMPTY,
      status: isNonWorking ? (dayType === "holiday" ? "holiday" : "off") : "absent",
    };
  }

  const split = splitIntoSessions(punches);
  const first = split.sessions[0]!;
  const lastSession = split.sessions[split.sessions.length - 1]!;

  if (split.sessions.length === 1 && lastSession.out === null) {
    // One punch tells us they were here but not for how long. Flag it for a
    // supervisor rather than silently paying or docking a full shift.
    return {
      ...EMPTY,
      firstIn: first.in,
      status: "partial",
      anomaly: "Only one punch recorded — missing clock-out",
      directions: split.directions,
    };
  }

  /*
   * Flooring is applied to the day's closing punch only. An earlier session's
   * clock-out was followed by more work, so it is a break boundary rather than
   * a leaving time, and rounding it would shorten a stretch that was actually
   * worked.
   */
  let hoursWorked = split.workedHours;
  let lastOut = lastSession.out;
  let hoursAreFinal = false;

  if (options.floorFinalOut && lastOut) {
    const floored = floorToHalfHour(lastOut);
    // Never behind its own clock-in: a ten-minute session must not go negative.
    const clamped = floored.getTime() < lastSession.in.getTime() ? lastSession.in : floored;
    const lostMs = lastOut.getTime() - clamped.getTime();
    hoursWorked = round2(Math.max(0, hoursWorked - lostMs / 3_600_000));
    lastOut = clamped;
    hoursAreFinal = true;
  }

  return {
    firstIn: first.in,
    lastOut,
    hoursWorked,
    breakMinutes: split.breakMinutes,
    hoursAreFinal,
    status: hoursWorked > 0 ? "present" : "partial",
    anomaly: split.hasOpenSession ? "Missing clock-out" : null,
    directions: split.directions,
  };
}
```

Leave `workDateFor`, `minutesLateAgainstShift` and `toDateKey` exactly as they are.

- [ ] **Step 4: Run the whole attendance suite**

Run: `npm test -- attendance`
Expected: PASS. Some pre-existing tests in `compute.test.ts` assert `anomaly` wording from the deleted pairing functions ("2 unpaired punch(es)", "Odd number of punches"). Update those assertions to the new single wording, `"Missing clock-out"` — the behaviour they were pinning (a day that could not be paired cleanly is flagged, not silently priced) is unchanged and still tested.

- [ ] **Step 5: Commit**

```bash
git add src/lib/attendance/compute.ts src/lib/attendance/compute.test.ts
git commit -m "feat: floor clock-outs to the half hour and record break minutes"
```

---

### Task 8: Payroll stops rounding an already-floored day

**Files:**
- Modify: `src/lib/payroll/types.ts` (the `AttendanceDay` interface)
- Modify: `src/lib/payroll/hours.ts` (`splitDayHours`, `excessHours`)
- Modify: `src/lib/payroll/engine.test.ts` (new cases)

**Interfaces:**
- Consumes: `hours_are_final` from Task 3
- Produces: `AttendanceDay.hoursAreFinal?: boolean`; `workedHoursOf(day, rule): number`

- [ ] **Step 1: Write the failing test**

Append to `src/lib/payroll/engine.test.ts`:

```ts
describe("hours that are already final", () => {
  it("does not round a day whose clock-out was floored", () => {
    // 7.58h with a 15-minute step would round up to 7.5... and then to 7.58's
    // nearest quarter, 7.5. The floored figure must survive untouched.
    const buckets = splitDayHours(
      day({ workDate: "2026-08-03", hoursWorked: 7.58, hoursAreFinal: true }),
      rule,
    );

    expect(buckets.regular).toBe(7.58);
  });

  it("still rounds a day that was not floored", () => {
    const buckets = splitDayHours(
      day({ workDate: "2026-08-03", hoursWorked: 7.58 }),
      rule,
    );

    expect(buckets.regular).toBe(7.5);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npm test -- engine`
Expected: FAIL — `hoursAreFinal` is not a property of `AttendanceDay`.

- [ ] **Step 3: Add the field to the type**

In `src/lib/payroll/types.ts`, inside `interface AttendanceDay`, after `minutesLate`:

```ts
  /**
   * The clock-out was already floored to the half hour, so these hours must
   * not be rounded again. Rounding twice — down to the slot, then half-up to
   * the site's fifteen-minute step — hands back some of what the floor took.
   */
  hoursAreFinal?: boolean;
```

- [ ] **Step 4: Honour it in hours.ts**

In `src/lib/payroll/hours.ts`, add above `splitDayHours`:

```ts
/**
 * A day's worked hours at the granularity payroll should price.
 *
 * One place, because `splitDayHours` and `excessHours` must agree: if the
 * ceiling measured a differently-rounded figure from the one being paid, the
 * flagged-hours total would drift away from the hours it is meant to describe.
 */
export function workedHoursOf(day: AttendanceDay, rule: PayRule): number {
  const worked = Math.max(0, day.hoursWorked);
  return day.hoursAreFinal ? round2(worked) : roundHours(worked, rule.roundToMinutes);
}
```

Then in both `splitDayHours` and `excessHours`, replace

```ts
  const worked = roundHours(Math.max(0, day.hoursWorked), rule.roundToMinutes);
```

with

```ts
  const worked = workedHoursOf(day, rule);
```

- [ ] **Step 5: Run to verify it passes**

Run: `npm test -- engine`
Expected: PASS, including every pre-existing case (nothing sets `hoursAreFinal`, so they take the unchanged branch).

- [ ] **Step 6: Commit**

```bash
git add src/lib/payroll/types.ts src/lib/payroll/hours.ts src/lib/payroll/engine.test.ts
git commit -m "feat: do not round hours a floored clock-out already settled"
```

---

### Task 9: Per-minute late penalties

**Files:**
- Create: `supabase/migrations/20260904090200_per_minute_late_penalty.sql`
- Create: `supabase/migrations/20260904090250_seed_per_minute_tier.sql`
- Create: `src/lib/payroll/late.test.ts`
- Modify: `src/lib/payroll/types.ts` (`LatePenaltyTier.basis`)
- Modify: `src/lib/payroll/late.ts`
- Modify: `src/lib/payroll/engine.ts` (the `calculateLatePenalties` call)

**Interfaces:**
- Consumes: `shifts.grace_minutes`, `attendance_days.minutes_late`
- Produces: `calculateLatePenalties(days, tiers, dayRate, monthlyBase, dutyHours)` — note the new fifth parameter

- [ ] **Step 1: Write the migration**

Create `supabase/migrations/20260904090200_per_minute_late_penalty.sql`:

```sql
-- ============================================================================
-- Lateness charged by the minute.
--
-- The shift already allows fifteen minutes of grace. Past it, each minute
-- costs a minute of pay — which is what was asked for, and which the existing
-- percentage tiers cannot express: the smallest band they can charge is a
-- fraction of a whole day.
--
-- Percentage tiers are untouched and keep working. findTier() picks the
-- narrowest matching band, so a site can run per-minute for small latenesses
-- and a percentage penalty beyond some threshold if it ever wants to.
-- ============================================================================

alter type public.penalty_basis add value if not exists 'minute';
```

Then a **second** migration file, because Postgres will not let a new enum value be referenced by the transaction that creates it — the same constraint `20260826090000_overtime_eligibility.sql` documents for `adjust_in_leave`. Create `supabase/migrations/20260904090250_seed_per_minute_tier.sql`:

```sql
-- Seeds the ladder every site starts on: one open-ended band, charged by the
-- minute. penalty_percent is meaningless for this basis and stores 100, read
-- as "one hundred percent of one minute's wage".
insert into public.late_penalty_rules
  (site_id, shift_id, label, from_minutes, to_minutes, penalty_percent, basis, is_active)
select s.id, null, 'Late arrival — per minute', 0, null, 100, 'minute', true
  from public.sites s
 where not exists (
   select 1 from public.late_penalty_rules r
    where r.site_id = s.id and r.basis = 'minute'
 );
```

- [ ] **Step 2: Apply and regenerate**

Run: `npm run db:reset && npm run db:types:local`
Expected: both succeed; `grep -n "\"minute\"" src/lib/supabase/database.types.ts` finds the new enum value.

- [ ] **Step 3: Write the failing test**

Create `src/lib/payroll/late.test.ts`:

```ts
import { describe, expect, it } from "vitest";

import { calculateLatePenalties, findTier } from "./late";
import type { AttendanceDay, LatePenaltyTier } from "./types";

const perMinute: LatePenaltyTier = {
  label: "Late arrival — per minute",
  fromMinutes: 0,
  toMinutes: null,
  penaltyPercent: 100,
  basis: "minute",
};

function day(workDate: string, minutesLate: number): AttendanceDay {
  return { workDate, dayType: "workday", hoursWorked: 8, status: "present", minutesLate };
}

describe("per-minute late penalties", () => {
  /*
   * A ₨1,200 day over eight duty hours is ₨150 an hour, ₨2.50 a minute.
   * `minutesLate` already has the shift's grace subtracted, so five here is
   * what a twenty-minute arrival against a fifteen-minute margin looks like.
   */
  it("charges a minute of pay for a minute of lateness", () => {
    const result = calculateLatePenalties([day("2026-08-03", 5)], [perMinute], 1200, 40_000, 8);

    expect(result.total).toBe(12.5);
    expect(result.daysLate).toBe(1);
  });

  it("charges nothing inside the grace period", () => {
    // minutesLate is zero for anyone who arrived within the margin.
    const result = calculateLatePenalties([day("2026-08-03", 0)], [perMinute], 1200, 40_000, 8);

    expect(result.total).toBe(0);
    expect(result.daysLate).toBe(0);
    expect(result.lines).toEqual([]);
  });

  it("divides by the person's own duty hours, not a fixed eight", () => {
    // A guard's ₨1,200 covers twelve hours: ₨100 an hour, ₨1.666 a minute.
    const result = calculateLatePenalties([day("2026-08-03", 6)], [perMinute], 1200, 40_000, 12);

    expect(result.total).toBe(10);
  });

  it("sums a month of small latenesses into one payslip line", () => {
    const result = calculateLatePenalties(
      [day("2026-08-03", 5), day("2026-08-04", 10), day("2026-08-05", 3)],
      [perMinute],
      1200,
      40_000,
      8,
    );

    expect(result.total).toBe(45);
    expect(result.daysLate).toBe(3);
    expect(result.lines).toHaveLength(1);
    expect(result.lines[0]?.label).toBe("Late arrival — per minute (3 days, 18 minutes)");
  });

  it("never applies to someone who keeps no in time", () => {
    // Flexible-hours staff never have minutes_late written, so no tier matches.
    const result = calculateLatePenalties([day("2026-08-03", 0)], [perMinute], 1200, 40_000, 8);
    expect(result.total).toBe(0);
  });
});

describe("percentage tiers still work", () => {
  const halfDay: LatePenaltyTier = {
    label: "Over two hours",
    fromMinutes: 120,
    toMinutes: null,
    penaltyPercent: 50,
    basis: "day",
  };

  it("charges a share of the day", () => {
    const result = calculateLatePenalties([day("2026-08-03", 150)], [halfDay], 1200, 40_000, 8);
    expect(result.total).toBe(600);
  });

  it("prefers the narrowest matching band", () => {
    const narrow: LatePenaltyTier = { ...halfDay, label: "Two to three hours", toMinutes: 180 };
    expect(findTier(150, [halfDay, narrow])?.label).toBe("Two to three hours");
  });
});
```

- [ ] **Step 4: Run to verify it fails**

Run: `npm test -- late`
Expected: FAIL — `basis: "minute"` is not assignable, and `calculateLatePenalties` takes four parameters.

- [ ] **Step 5: Widen the type**

In `src/lib/payroll/types.ts`, in `interface LatePenaltyTier`:

```ts
  /**
   * What the percentage is taken of.
   *
   * `minute` is the exception: it charges one minute of pay per minute late,
   * so `penaltyPercent` is 100 and means "all of one minute's wage".
   */
  basis: "day" | "month" | "minute";
```

- [ ] **Step 6: Implement it**

In `src/lib/payroll/late.ts`, replace `calculateLatePenalties`:

```ts
export function calculateLatePenalties(
  days: readonly AttendanceDay[],
  tiers: readonly LatePenaltyTier[],
  dayRate: number,
  monthlyBase: number,
  /**
   * The hours this person's salary covers. The divisor behind a minute of pay,
   * so a guard on twelve loses a twelfth of their day per hour late and an
   * operator on eight loses an eighth — each against the day they contracted.
   */
  dutyHours = 8,
): LatePenaltyResult {
  if (tiers.length === 0) return { total: 0, daysLate: 0, lines: [] };

  const perMinuteRate = dutyHours > 0 ? dayRate / dutyHours / 60 : 0;

  let total = 0;
  let daysLate = 0;
  const byTier = new Map<
    string,
    { tier: LatePenaltyTier; count: number; minutes: number; amount: number }
  >();

  for (const day of days) {
    const minutesLate = day.minutesLate ?? 0;
    const tier = findTier(minutesLate, tiers);
    if (!tier) continue;

    const amount =
      tier.basis === "minute"
        ? roundMoney((minutesLate * perMinuteRate * tier.penaltyPercent) / 100)
        : roundMoney(((tier.basis === "month" ? monthlyBase : dayRate) * tier.penaltyPercent) / 100);

    if (amount <= 0) continue;

    daysLate += 1;
    total = roundMoney(total + amount);

    const existing = byTier.get(tier.label);
    if (existing) {
      existing.count += 1;
      existing.minutes += minutesLate;
      existing.amount = roundMoney(existing.amount + amount);
    } else {
      byTier.set(tier.label, { tier, count: 1, minutes: minutesLate, amount });
    }
  }

  // One payslip line per tier rather than per day, so a month with twelve
  // small latenesses stays readable.
  const lines: PayslipLine[] = [...byTier.values()].map(({ tier, count, minutes, amount }) => {
    const days = `${count} day${count === 1 ? "" : "s"}`;
    const detail =
      tier.basis === "minute"
        ? `${days}, ${minutes} minute${minutes === 1 ? "" : "s"}`
        : `${days} × ${tier.penaltyPercent}% of ${
            tier.basis === "month" ? "monthly pay" : "daily pay"
          }`;

    return {
      code: `LATE_${tier.fromMinutes}`,
      label: `${tier.label} (${detail})`,
      kind: "deduction",
      amount,
    };
  });

  return { total, daysLate, lines };
}
```

- [ ] **Step 7: Pass duty hours from the engine**

In `src/lib/payroll/engine.ts`, the late-penalty call currently reads:

```ts
    : calculateLatePenalties(days, latePenaltyTiers, dayRate, employee.monthlySalary);
```

Change it to:

```ts
    : calculateLatePenalties(days, latePenaltyTiers, dayRate, employee.monthlySalary, dutyHours);
```

`dutyHours` is already in scope — it is computed near the top of `calculatePayroll`.

- [ ] **Step 8: Run the full suite**

Run: `npm test`
Expected: PASS. `late.test.ts` adds 7 tests; nothing existing regresses because no seeded tier used `minute` before.

- [ ] **Step 9: Commit**

```bash
git add supabase/migrations/20260904090200_per_minute_late_penalty.sql supabase/migrations/20260904090250_seed_per_minute_tier.sql src/lib/payroll/late.ts src/lib/payroll/late.test.ts src/lib/payroll/types.ts src/lib/payroll/engine.ts src/lib/supabase/database.types.ts
git commit -m "feat: charge lateness by the minute past the shift's grace period"
```

---

### Task 10: Ingestion writes directions, breaks and floored hours

**Files:**
- Modify: `src/lib/devices/ingest.ts` (the `recomputeAttendanceDay` function, around lines 220–298)

**Interfaces:**
- Consumes: `computeDayFromPunches` with `floorFinalOut` (Task 7), `attendance_days.break_minutes` / `hours_are_final` (Task 3)
- Produces: nothing new — this is the wiring task

- [ ] **Step 1: Read the punch ids so directions can be written back**

In `recomputeAttendanceDay`, change the punches query to select `id`:

```ts
    supabase
      .from("punches")
      .select("id, punched_at, direction")
      .eq("profile_id", profileId)
      .eq("work_date", workDate)
      .order("punched_at", { ascending: true }),
```

- [ ] **Step 2: Compute with flooring, and write the derived directions back**

Replace the block from `const computed = computeDayFromPunches(...)` down to the start of the lateness section with:

```ts
  /*
   * Someone with an enforced shift has a finish to round against; someone on
   * no shift does not, and flooring them would take up to twenty-nine minutes
   * off a day whose whole arrangement is that they complete their hours.
   */
  const flexible = profile?.flexible_hours ?? false;
  const shiftId = profile?.shift_id ?? null;
  const enforcedShift = Boolean(shiftId) && !flexible;

  const computed = computeDayFromPunches(punches, dayType, {
    requiresAttendance: profile?.requires_attendance ?? true,
    floorFinalOut: enforcedShift,
  });

  /*
   * The terminal's own state byte is not trustworthy — a K50 without dedicated
   * in/out keys stamps every record state 0 — so the direction shown on the
   * device page and the live feed is the one the sequence implies. The raw
   * state stays in `punches.raw` for audit.
   */
  const ordered = (punchRows ?? []).slice().sort((a, b) =>
    new Date(a.punched_at as string).getTime() - new Date(b.punched_at as string).getTime(),
  );

  await Promise.all(
    ordered.flatMap((row, index) => {
      const derived = computed.directions[index];
      if (!derived || derived === row.direction) return [];
      return [supabase.from("punches").update({ direction: derived }).eq("id", row.id)];
    }),
  );
```

Then delete the two lines that previously declared `flexible` and `shiftId` inside the lateness block, since they are now declared above it.

- [ ] **Step 3: Persist the two new columns**

In the `attendance_days` upsert, add alongside `regular_hours`:

```ts
      break_minutes: computed.breakMinutes,
      hours_are_final: computed.hoursAreFinal,
```

- [ ] **Step 4: Typecheck and run the suite**

Run: `npm run typecheck && npm test`
Expected: both pass.

- [ ] **Step 5: Verify against a real terminal round trip**

With `npm run dev` running and the local Supabase stack up, POST a synthetic punch pair to the ingest endpoint:

```bash
curl -X POST http://localhost:3000/api/devices/ingest \
  -H "content-type: application/json" \
  -H "x-device-secret: $DEVICE_INGEST_SECRET" \
  -d '{"serialNumber":"<a seeded serial>","punches":[{"deviceUserId":"<a seeded employee code>","localTimestamp":"2026-09-01 08:00:00","state":0},{"deviceUserId":"<same>","localTimestamp":"2026-09-01 17:50:00","state":0}]}'
```

Then open `/devices/<id>` and confirm the two punches show as one in and one out — not two ins. If the seeded person is on an enforced shift, their attendance row for 2026-09-01 should read 9.5 hours, not 9.83.

- [ ] **Step 6: Commit**

```bash
git add src/lib/devices/ingest.ts
git commit -m "feat: store derived punch directions, break minutes and floored hours"
```

---

## Phase 4 — Payroll

### Task 11: The contract-item table

**Files:**
- Create: `supabase/migrations/20260904090300_payroll_contract_items.sql`
- Modify: `src/lib/supabase/database.types.ts` (regenerated)

**Interfaces:**
- Consumes: `departments.contract_amount` (Task 3)
- Produces: `public.payroll_contract_items`

- [ ] **Step 1: Write the migration**

Create `supabase/migrations/20260904090300_payroll_contract_items.sql`:

```sql
-- ============================================================================
-- A contract firm is one payroll line, not one line per person.
--
-- payroll_items is keyed by profile_id, which cannot express "this department
-- costs ₨150,000 however many people it sent". Attaching the figure to a
-- nominated person would work until that person left, at which point the
-- contract would silently become free.
-- ============================================================================

create table public.payroll_contract_items (
  id            uuid primary key default gen_random_uuid(),
  period_id     uuid not null references public.payroll_periods (id) on delete cascade,
  department_id uuid not null references public.departments (id) on delete cascade,
  amount        numeric(14, 2) not null default 0 check (amount >= 0),
  -- What the office checks the firm's invoice against. Priced nothing.
  headcount     integer not null default 0 check (headcount >= 0),
  note          text,
  computed_at   timestamptz not null default now(),
  unique (period_id, department_id)
);

create index on public.payroll_contract_items (period_id);

comment on table public.payroll_contract_items is
  'One agreed amount per contract firm per period. The firm''s people produce no payroll_items at all — their attendance is recorded so the invoice can be checked, not so it can be priced.';

-- ---------------------------------------------------------------------------
-- RLS
--
-- A contract amount is payroll data and must not be readable by a role that
-- cannot read payroll. The site is resolved through the period, since the row
-- itself carries no site_id.
-- ---------------------------------------------------------------------------

alter table public.payroll_contract_items enable row level security;

create policy contract_items_read on public.payroll_contract_items
  for select to authenticated
  using (
    exists (
      select 1 from public.payroll_periods p
       where p.id = period_id and app.can('payroll.view', p.site_id)
    )
  );

create policy contract_items_write on public.payroll_contract_items
  for all to authenticated
  using (
    exists (
      select 1 from public.payroll_periods p
       where p.id = period_id and app.can('payroll.run', p.site_id)
    )
  )
  with check (
    exists (
      select 1 from public.payroll_periods p
       where p.id = period_id and app.can('payroll.run', p.site_id)
    )
  );

grant select, insert, update, delete on public.payroll_contract_items
  to authenticated, service_role;
```

- [ ] **Step 2: Apply, regenerate, typecheck**

Run: `npm run db:reset && npm run db:types:local && npm run typecheck`
Expected: all three succeed.

- [ ] **Step 3: Verify the table reached the types**

Run: `grep -n "payroll_contract_items" src/lib/supabase/database.types.ts | head -3`
Expected: at least one match.

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/20260904090300_payroll_contract_items.sql src/lib/supabase/database.types.ts
git commit -m "feat: add the firm-level payroll contract item table"
```

---

### Task 12: The engine stops pricing contractors

**Files:**
- Modify: `src/lib/payroll/engine.ts`
- Modify: `src/lib/payroll/types.ts` (`Employee.payrollExempt`, and the `WorkerType` comment)
- Modify: `src/lib/payroll/engine.test.ts`

**Interfaces:**
- Consumes: nothing new
- Produces: `calculatePayroll` throws for a contractor or an exempt person rather than pricing them

- [ ] **Step 1: Write the failing test**

In `src/lib/payroll/engine.test.ts`, find the existing contractor describe block and replace its cases with:

```ts
describe("people the engine must never price", () => {
  const contractor: Employee = {
    id: "e9",
    fullName: "Anas (Antrosys)",
    employeeCode: "RD-2001",
    payClass: "monthly",
    requiresAttendance: true,
    monthlySalary: 50_000,
    hourlyRate: 0,
    workerType: "contractor",
  };

  it("refuses a contractor — their firm is billed, not them", () => {
    expect(() =>
      calculatePayroll({ employee: contractor, rule, days: [], daysInMonth: 31 }),
    ).toThrow(/contractor/i);
  });

  it("refuses someone exempt from payroll", () => {
    expect(() =>
      calculatePayroll({
        employee: { ...contractor, workerType: "employee", payrollExempt: true },
        rule,
        days: [],
        daysInMonth: 31,
      }),
    ).toThrow(/payroll/i);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npm test -- engine`
Expected: FAIL — no throw; `payrollExempt` is not on `Employee`.

- [ ] **Step 3: Add the field**

In `src/lib/payroll/types.ts`, in `interface Employee`, after `workerType`:

```ts
  /**
   * Draws no salary through this system — an owner. Filtered out before a run
   * reaches the engine; the guard in `calculatePayroll` is a second line.
   */
  payrollExempt?: boolean;
```

and change the `WorkerType` doc comment to:

```ts
/**
 * A contractor's firm is billed one agreed amount for the whole department —
 * see `payroll_contract_items`. Nothing is calculated for the individual, who
 * never reaches the payroll engine at all. Their attendance is still recorded
 * so the office can check the firm's invoice against the hours worked.
 */
export type WorkerType = "employee" | "contractor";
```

- [ ] **Step 4: Guard the engine and delete the contractor branches**

In `src/lib/payroll/engine.ts`, at the top of `calculatePayroll`, replace

```ts
  const isContractor = employee.workerType === "contractor";
```

with

```ts
  /*
   * A contract firm is billed once for the whole department, so pricing one of
   * its people would double-charge whatever the firm agreed. An exempt person
   * draws nothing here at all. Both are filtered out in `run.ts`; throwing
   * rather than returning an empty result means a future caller that forgets
   * cannot quietly produce a payslip that should not exist.
   */
  if (employee.workerType === "contractor") {
    throw new Error(
      `${employee.fullName} is a contractor — their firm is billed through payroll_contract_items, not priced per person.`,
    );
  }
  if (employee.payrollExempt) {
    throw new Error(`${employee.fullName} is exempt from payroll and must not be priced.`);
  }
```

Then remove the now-dead contractor handling:
- The `if (isContractor) { ... }` branch that pushes the `CONTRACT` line — delete it, leaving `if (isMonthly) { ... } else { ... }`.
- `const otPay = isContractor ? 0 : roundMoney(...)` → `const otPay = roundMoney(hours.overtime * otRate);`
- `const { weekendPay, holidayPay } = isContractor ? { ... } : premiumPay(...)` → `const { weekendPay, holidayPay } = premiumPay(days, rule, weekendRate, holidayRate);`
- `const late = isContractor ? { total: 0, ... } : calculateLatePenalties(...)` → `const late = calculateLatePenalties(days, latePenaltyTiers, dayRate, employee.monthlySalary, dutyHours);`

- [ ] **Step 5: Run the suite**

Run: `npm test -- engine`
Expected: PASS. If a pre-existing test constructs a contractor and asserts a flat `basePay`, it is the one being replaced in Step 1 — remove it rather than adapting it, because the behaviour it pins no longer exists.

- [ ] **Step 6: Commit**

```bash
git add src/lib/payroll/engine.ts src/lib/payroll/types.ts src/lib/payroll/engine.test.ts
git commit -m "feat: contractors and exempt staff never reach the payroll engine"
```

---

### Task 13: Runs emit contract lines and warn on unset amounts

**Files:**
- Modify: `src/lib/payroll/run.ts`
- Modify: `AGENTS.md`

**Interfaces:**
- Consumes: `payroll_contract_items` (Task 11), the engine guards (Task 12), `AttendanceDay.hoursAreFinal` (Task 8), `attendance_days.hours_are_final` (Task 3, written by Task 10)
- Produces: `RunSummary` unchanged in shape; `skipped` gains contract-firm entries

- [ ] **Step 1: Select the new columns**

In `runPayrollForPeriod`, add `payroll_exempt` to the `profiles` select list, and add a fourth parallel query for the firms:

```ts
      supabase
        .from("departments")
        .select("id, name, contract_amount")
        .eq("site_id", period.site_id)
        .eq("default_worker_type", "contractor")
        .eq("is_active", true),
```

Destructure it as `{ data: contractDepartments }` alongside the existing results.

- [ ] **Step 2: Carry the exemption into the Employee mapping**

In `toEmployee`, add:

```ts
    payrollExempt: row.payroll_exempt ?? false,
```

- [ ] **Step 2b: Read the floored-hours flag back out of attendance**

Task 10 writes `hours_are_final` on every day whose clock-out was floored, and
Task 8 taught `splitDayHours` to honour it — but a run never selects the
column, so `AttendanceDay.hoursAreFinal` would arrive `undefined` on every row
and the flag would do nothing outside its own unit tests. This step is what
connects the two.

In the `attendance_days` query, add `hours_are_final` to the select list:

```ts
    .select(
      "profile_id, work_date, day_type, status, regular_hours, minutes_late, hours_are_final",
    )
```

and in the `daysByProfile` loop that builds each `AttendanceDay`, add:

```ts
      hoursAreFinal: row.hours_are_final ?? false,
```

- [ ] **Step 3: Filter both groups out of the per-person loop**

Immediately inside `for (const person of staff) {`, before `const employee = toEmployee(person);`:

```ts
    /*
     * A contract firm is billed once, below. An exempt person draws nothing
     * here at all. Neither is "skipped" in the sense the summary means — that
     * list is for people who should have been paid and could not be — so
     * neither is reported there.
     */
    if (person.worker_type === "contractor" || person.payroll_exempt) continue;
```

This makes the existing `employee.workerType !== "contractor"` clause in the
no-attendance skip check below unreachable. Delete that clause — the condition
becomes `if (employee.requiresAttendance && days.length === 0)` — rather than
leaving a guard that reads as though contractors still flow through here.

- [ ] **Step 4: Emit one line per firm, and warn on the unset ones**

After the per-person loop and before the `payroll_items` upsert:

```ts
  /*
   * The firm, not its people.
   *
   * Headcount is recorded because it is what the office checks the invoice
   * against — the amount is agreed regardless of how many people turned up.
   */
  const contractRows = [];
  let contractTotal = 0;
  let contractHeadcount = 0;

  for (const dept of contractDepartments ?? []) {
    const people = staff.filter(
      (s) => s.department_id === dept.id && s.worker_type === "contractor",
    );
    const amount = Number(dept.contract_amount ?? 0);

    if (amount <= 0) {
      /*
       * Left at zero this firm would cost nothing and its people would produce
       * no lines — the run would simply pass over them in silence. Say so.
       */
      if (people.length > 0) {
        skipped.push({
          name: dept.name,
          reason: `${people.length} contract worker${people.length === 1 ? "" : "s"}, no contract amount set`,
        });
      }
      continue;
    }

    contractTotal = roundMoney(contractTotal + amount);
    contractHeadcount += people.length;

    contractRows.push({
      period_id: period.id,
      department_id: dept.id,
      amount,
      headcount: people.length,
      note: null,
      computed_at: new Date().toISOString(),
    });
  }

  if (contractRows.length > 0) {
    const { error } = await supabase
      .from("payroll_contract_items")
      .upsert(contractRows, { onConflict: "period_id,department_id" });
    if (error) throw new Error(`Could not save contract lines: ${error.message}`);
  }
```

Add `roundMoney` to the existing import from `./hours`.

- [ ] **Step 5: Fold the firms into the period totals**

Replace the `payroll_periods` update's totals with:

```ts
      total_gross: roundMoney(totals.gross + contractTotal),
      total_deductions: totals.deductions,
      total_tax: totals.tax,
      total_net: roundMoney(totals.net + contractTotal),
      headcount: totals.headcount + contractHeadcount,
```

A contract amount attracts no deduction and no tax, so those two are unchanged — it is a payment to a firm, not a wage with statutory withholding.

Then update the returned `RunSummary` the same way:

```ts
  return {
    periodId: period.id,
    headcount: totals.headcount + contractHeadcount,
    gross: roundMoney(totals.gross + contractTotal),
    deductions: totals.deductions,
    tax: totals.tax,
    net: roundMoney(totals.net + contractTotal),
    skipped,
    flagged,
  };
```

- [ ] **Step 6: Correct the rule in AGENTS.md**

The contractor bullet is now wrong. Replace:

```markdown
- **Contractors have nothing calculated for them.** The agreed amount in
  `monthly_salary` is paid flat: no proration, no overtime, no late penalty.
```

with:

```markdown
- **A contract firm is billed once, not per person.** The agreed amount lives
  on the department (`departments.contract_amount`) and becomes one row in
  `payroll_contract_items`. The firm's people produce no payroll item at all —
  `calculatePayroll` throws if one reaches it. Their attendance is still
  recorded so the office can check the firm's invoice against real hours.
- **Someone `payroll_exempt` is not on payroll at all.** Owners are filtered
  out of a run rather than priced at zero: a zero line states they earned
  nothing, which is a different claim from not being paid here.
```

- [ ] **Step 7: Typecheck and run everything**

Run: `npm run typecheck && npm test && npm run lint`
Expected: all pass.

- [ ] **Step 8: Verify a real run**

With the dev server up: set Antrosys's contract amount to 150000 on `/rates`, put at least one person in the Antrosys department, then create and run a pay period on `/payroll`. Confirm the period's total includes 150,000 once, that no Antrosys person has their own payroll line, and that setting the amount back to 0 and re-running produces the "no contract amount set" warning.

- [ ] **Step 9: Commit**

```bash
git add src/lib/payroll/run.ts AGENTS.md
git commit -m "feat: bill contract firms once per period instead of per person"
```

---

## Phase 5 — The live floor feed

### Task 14: `/devices/live`

**Files:**
- Create: `src/app/(app)/devices/live/page.tsx`
- Modify: `src/lib/navigation.ts`

**Interfaces:**
- Consumes: `punches.direction` written by Task 10
- Produces: nothing

- [ ] **Step 1: Write the page**

Create `src/app/(app)/devices/live/page.tsx`:

```tsx
import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft, LogIn, LogOut, Radio } from "lucide-react";

import { AutoRefresh } from "@/components/auto-refresh";
import { Avatar, Card, SectionTitle } from "@/components/ui-kit";
import { requireAnyPermission } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { formatDate, formatTime } from "@/lib/time";
import { cn } from "@/lib/utils";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: { absolute: "Live floor | Rado Dyeing and Textile" },
};

/**
 * How often this screen re-reads, in seconds.
 *
 * Faster than the thirty-second attendance default because this is the one
 * screen someone stands in front of watching the gate. It is still polling
 * rather than Realtime: punches only enter the database when the sync worker
 * fetches them from the terminals, so a websocket would deliver the same rows
 * on the same cadence while adding replication config and a failure mode.
 */
const LIVE_REFRESH_SECONDS = 10;

/** The most recent punches worth scrolling. Beyond this, use the reports screen. */
const FEED_LIMIT = 400;

export default async function LiveFeedPage() {
  await requireAnyPermission(["devices.view", "devices.manage"]);

  const supabase = await createClient();

  const [{ data: punches }, { data: staff }, { data: devices }] = await Promise.all([
    supabase
      .from("punches")
      .select("id, device_id, device_user_id, profile_id, punched_at, direction")
      .order("punched_at", { ascending: false })
      .limit(FEED_LIMIT),
    supabase
      .from("employee_directory")
      .select("id, full_name, employee_code")
      .eq("status", "active"),
    supabase.from("devices").select("id, name"),
  ]);

  const nameById = new Map((staff ?? []).map((s) => [s.id, s]));
  const deviceById = new Map((devices ?? []).map((d) => [d.id, d.name]));

  return (
    <div className="space-y-5 pb-6">
      <AutoRefresh seconds={LIVE_REFRESH_SECONDS} />

      <Link
        href="/devices"
        className="inline-flex items-center gap-2 text-sm font-semibold text-muted-foreground transition-colors hover:text-foreground"
      >
        <ArrowLeft className="size-4" />
        Biometric Devices
      </Link>

      <Card className="p-4 sm:p-6">
        <SectionTitle
          icon={Radio}
          title="Live floor"
          subtitle={`The last ${FEED_LIMIT} check-ins and check-outs, refreshing every ${LIVE_REFRESH_SECONDS} seconds`}
        />

        {!punches || punches.length === 0 ? (
          <div className="rounded-2xl bg-secondary p-8 text-center">
            <p className="text-sm font-semibold text-foreground">Nothing on the floor yet</p>
            <p className="mt-1 text-sm text-muted-foreground">
              Scans appear here within seconds of a terminal uploading them.
            </p>
          </div>
        ) : (
          <div className="mt-4 grid gap-2 sm:grid-cols-2">
            {punches.map((punch) => {
              const person = punch.profile_id ? nameById.get(punch.profile_id) : null;
              const isIn = punch.direction === "in";

              return (
                <div key={punch.id} className="flex items-center gap-3 rounded-2xl bg-secondary p-3">
                  <Avatar name={person?.full_name ?? "??"} />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold text-foreground">
                      {person?.full_name ?? (
                        <span className="text-warning">
                          Unlinked terminal ID {punch.device_user_id}
                        </span>
                      )}
                    </p>
                    <p className="truncate text-xs text-muted-foreground">
                      {person?.employee_code ?? punch.device_user_id}
                      {punch.device_id ? ` · ${deviceById.get(punch.device_id) ?? "Terminal"}` : ""}
                      {" · "}
                      {formatDate(punch.punched_at)}
                    </p>
                  </div>
                  <span
                    className={cn(
                      "inline-flex shrink-0 items-center gap-1.5 rounded-full bg-card px-3 py-1.5 text-xs font-bold",
                      isIn ? "text-success" : "text-info",
                    )}
                  >
                    {isIn ? <LogIn className="size-4" /> : <LogOut className="size-4" />}
                    {formatTime(punch.punched_at)}
                  </span>
                </div>
              );
            })}
          </div>
        )}
      </Card>
    </div>
  );
}
```

- [ ] **Step 2: Add the menu entry**

In `src/lib/navigation.ts`, immediately after the `/devices` entry in `WORK_MODULES`:

```ts
  {
    href: "/devices/live",
    label: "Live Floor",
    icon: "devices",
    requires: ["devices.view", "devices.manage"],
    description: "Check-ins and check-outs as they happen",
  },
```

- [ ] **Step 3: Typecheck and lint**

Run: `npm run typecheck && npm run lint`
Expected: both pass. If `Avatar`, `Card` or `SectionTitle` are not exported from `@/components/ui-kit`, match the import to whatever `src/app/(app)/devices/[id]/page.tsx` uses — that file renders the same three.

- [ ] **Step 4: Look at it**

Open `/devices/live`. Post a punch through the ingest endpoint (the curl from Task 10, Step 5) and confirm it appears within ten seconds without touching the page, with the correct in/out marker.

- [ ] **Step 5: Commit**

```bash
git add "src/app/(app)/devices/live/page.tsx" src/lib/navigation.ts
git commit -m "feat: live floor feed of the last 400 check-ins and check-outs"
```

---

## Phase 6 — Manager sign-off

Independent of every other phase; it can land at any point after Task 1, which
grants the permission it checks.

### Task 15: A manager approves their department's attendance

**Files:**
- Create: `supabase/migrations/20260904090400_attendance_approval.sql`
- Create: `src/app/(app)/attendance/logs/actions.ts`
- Modify: `src/app/(app)/attendance/logs/page.tsx`

**Interfaces:**
- Consumes: `attendance.approve` granted to `manager` in Task 1
- Produces: `approveAttendanceRange(input: { profileId: string; from: string; to: string }): Promise<{ ok: boolean; message: string }>`

- [ ] **Step 1: Write the migration**

Create `supabase/migrations/20260904090400_attendance_approval.sql`:

```sql
-- ============================================================================
-- Signing off a stretch of attendance.
--
-- `locked` already exists and already stops recomputeAttendanceDay() from
-- overwriting a row — that is what makes an approval durable rather than
-- decorative: a correction a manager accepted survives the next terminal sync
-- instead of being replaced by whatever the punches say.
--
-- What was missing is who accepted it and when. Without that, `locked` says a
-- row is frozen but not on whose authority, which is exactly the question
-- asked when a payslip is disputed.
-- ============================================================================

alter table public.attendance_days
  add column approved_by uuid references public.profiles (id) on delete set null,
  add column approved_at timestamptz;

comment on column public.attendance_days.approved_by is
  'The manager who signed this day off. Set together with locked, which is what actually stops recomputation replacing it.';

create index on public.attendance_days (approved_at) where approved_at is not null;

-- ---------------------------------------------------------------------------
-- A manager may write the days of the people who report to them
--
-- app.manages() already exists for exactly this and is used by the other
-- attendance policies. The `.all` variant carries anyone company-wide.
-- ---------------------------------------------------------------------------

create policy attendance_approve on public.attendance_days
  for update to authenticated
  using (
    (app.can('attendance.approve', site_id) and app.manages(auth.uid(), profile_id))
    or app.can('attendance.edit.all', site_id)
  )
  with check (
    (app.can('attendance.approve', site_id) and app.manages(auth.uid(), profile_id))
    or app.can('attendance.edit.all', site_id)
  );
```

- [ ] **Step 2: Apply and regenerate**

Run: `npm run db:reset && npm run db:types:local && npm run typecheck`
Expected: all three succeed.

If `create policy` fails saying the policy already exists, a policy of that
name was added by an earlier migration — rename this one rather than dropping
the existing one, which other screens rely on.

- [ ] **Step 3: Write the action**

Create `src/app/(app)/attendance/logs/actions.ts`:

```ts
"use server";

import { revalidatePath } from "next/cache";

import { requirePermission } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";

/**
 * Signing off a person's attendance for a stretch of dates.
 *
 * Approval sets `locked`, which is what stops `recomputeAttendanceDay()`
 * replacing the row on the next terminal sync. Without that, a manager who
 * corrected a missed punch would watch the correction disappear within thirty
 * seconds — the approval would be a label rather than a decision.
 *
 * Scope is enforced by RLS, not here: `app.manages()` keeps a manager to their
 * own reports, so a request naming somebody else's employee updates no rows
 * rather than being refused with a message that confirms the person exists.
 */

export interface ApproveResult {
  ok: boolean;
  message: string;
}

export async function approveAttendanceRange(input: {
  profileId: string;
  from: string;
  to: string;
}): Promise<ApproveResult> {
  const session = await requirePermission("attendance.approve");

  if (!input.profileId || !input.from || !input.to) {
    return { ok: false, message: "Pick a person and a date range." };
  }
  if (input.to < input.from) {
    return { ok: false, message: "The end date cannot be before the start date." };
  }

  const supabase = await createClient();

  const { data, error } = await supabase
    .from("attendance_days")
    .update({
      approved_by: session.userId,
      approved_at: new Date().toISOString(),
      locked: true,
    })
    .eq("profile_id", input.profileId)
    .gte("work_date", input.from)
    .lte("work_date", input.to)
    .select("id");

  if (error) return { ok: false, message: error.message };

  const count = data?.length ?? 0;
  if (count === 0) {
    // Either there is nothing in the range, or the policy filtered it out.
    return {
      ok: false,
      message: "Nothing to approve — no attendance in that range for someone who reports to you.",
    };
  }

  revalidatePath("/attendance/logs");
  revalidatePath("/payroll");

  return {
    ok: true,
    message: `Approved ${count} day${count === 1 ? "" : "s"}. They will not be recalculated.`,
  };
}
```

- [ ] **Step 4: Surface it on the log**

`src/app/(app)/attendance/logs/page.tsx` already loads a person's rows for a
date range and already renders an "Edited" tag from `is_manual` (near line
707). Add an approval control beside it, in a small client component following
the `useRef` + `startTransition` + `toast` + `router.refresh()` pattern that
`src/app/(app)/rates/people-pay.tsx` uses.

Pass it the person and the range the page is already showing:

```tsx
{session.permissions.has("attendance.approve") ? (
  <ApproveRange
    profileId={person.id}
    from={range.from}
    to={range.to}
    approvedCount={rows.filter((r) => r.approved_at).length}
    totalCount={rows.length}
  />
) : null}
```

Add `approved_at, approved_by, locked` to the `attendance_days` select at line
158, and to the row interface at line 75. Render an "Approved" tag wherever
`row.approved_at` is set, alongside the existing "Edited" tag.

- [ ] **Step 5: Typecheck and lint**

Run: `npm run typecheck && npm run lint`
Expected: both pass.

- [ ] **Step 6: Verify the scope actually holds**

This is the step that matters, because the permission is only half the guard.

Sign in as a manager. On `/attendance/logs`, approve a date range for someone
who reports to them: the days should show "Approved". Then re-run the terminal
ingest for one of those dates (the curl from Task 10, Step 5) and confirm the
approved row did **not** change — `recomputeAttendanceDay` returns early on
`locked`.

Then confirm the negative: a manager must not be able to approve someone who
does not report to them. The UI will not offer it, so test the policy directly
by calling `approveAttendanceRange` with another department's `profileId` — it
must return the "nothing to approve" message, having updated zero rows.

- [ ] **Step 7: Commit**

```bash
git add supabase/migrations/20260904090400_attendance_approval.sql "src/app/(app)/attendance/logs" src/lib/supabase/database.types.ts
git commit -m "feat: let a manager sign off their department's attendance"
```

---

## Task 16: Full verification

**Files:** none

- [ ] **Step 1: Reset the database from scratch**

Run: `npm run db:reset`
Expected: every migration applies in order, no errors. This is the only check that the four new migrations coexist with the twenty-nine before them.

- [ ] **Step 2: Regenerate types and confirm no drift**

Run: `npm run db:types:local && git diff --stat src/lib/supabase/database.types.ts`
Expected: no diff. A diff here means a migration was applied to the local database without the types being regenerated in its own task.

- [ ] **Step 3: Full suite**

Run: `npm test && npm run typecheck && npm run lint && npm run build`
Expected: all four pass.

- [ ] **Step 4: Commit anything the regeneration touched**

```bash
git add -A
git commit -m "chore: regenerate database types after the roles and payroll migrations"
```

---

## Notes for the implementer

**The one thing most likely to be got wrong:** in Task 7, `computeDayFromPunches` must keep returning `status: "partial"` and `hoursWorked: 0` for a lone punch. It is tempting to treat a single punch as a zero-length session and return `"present"`. That would tell payroll the person attended and earned a working day — `countWorkingDays()` counts `present` and `partial` alike, but `status: "absent"` would wrongly dock them. The existing behaviour is deliberate and its test is already in `compute.test.ts`.

**Do not "fix" the overtime ceiling.** `excessHours` drops hours past `ot_daily_cap_hours` rather than moving them into the regular bucket. That looks like a bug and is not — the reasoning is in `hours.ts` and in `AGENTS.md`.

**Migrations are append-only.** If a migration in this plan needs correcting after it has been committed, write another migration. Editing one that has already run against any database leaves the two out of step forever.
