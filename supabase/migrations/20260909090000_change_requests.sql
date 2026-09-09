-- ============================================================================
-- Changes that need somebody else to say yes.
--
-- Some things in this app are corrections — a missed punch, a wrong shift on a
-- profile — and some are decisions about money or about the working week. The
-- second kind was being made unilaterally by whoever happened to hold the
-- permission: a manager could change a salary, an accountant could reopen a
-- Sunday, and nothing recorded that anyone had agreed.
--
-- This is the record of the asking. A request holds the change rather than
-- applying it, so the row it targets keeps its old value until a CEO approves;
-- nothing wrong ever reaches a payslip while it waits. The payload is applied
-- verbatim on approval, by the same code that would have written it directly.
--
-- Antrosys never queues. They are the ones who fix what this workflow itself
-- gets wrong, and cannot be made to wait on it.
-- ============================================================================

create type public.change_kind as enum (
  'attendance_correction',  -- a day's hours, status or lateness put right
  'calendar_day',           -- a dated exception: this Sunday on, that Tuesday off
  'work_week',              -- the standing weekly pattern
  'pay_change',             -- one person's salary, rate or duty terms
  'contract_amount'         -- what a contract firm is owed for a month
);

create table public.change_requests (
  id            uuid primary key default gen_random_uuid(),
  kind          public.change_kind not null,

  /*
   * What it changes, and what it changes it to.
   *
   * `entity_id` is null for something that does not exist yet — a calendar day
   * being created, say. `payload` is the write itself: the columns and values
   * to apply, held as jsonb so one table can carry every kind of change
   * without a column per kind. It is applied by code that re-checks the
   * approver's own permissions, never blindly.
   */
  entity_table  text not null,
  entity_id     text,
  payload       jsonb not null,
  site_id       uuid references public.sites (id) on delete cascade,

  -- What the approver reads. Written when the request is made, because the
  -- summary has to survive the underlying row changing underneath it.
  title         text not null,
  summary       text,

  requested_by  uuid not null references public.profiles (id) on delete cascade,
  /*
   * The specific person asked to decide.
   *
   * A named approver rather than "anyone with the permission": the floor
   * asked for it that way, and a request addressed to everybody is a request
   * nobody feels is theirs. Anyone holding a superuser role can still decide
   * any request — see the policy below — so a director on leave never blocks
   * the factory.
   */
  assigned_to   uuid references public.profiles (id) on delete set null,

  status        public.request_status not null default 'pending',
  decided_by    uuid references public.profiles (id) on delete set null,
  decided_at    timestamptz,
  decision_note text,
  /** Set when applying the change failed, so a stuck request explains itself. */
  apply_error   text,
  created_at    timestamptz not null default now()
);

create index on public.change_requests (status, assigned_to);
create index on public.change_requests (requested_by, created_at desc);
create index on public.change_requests (kind, status);

comment on table public.change_requests is
  'A change held until somebody senior approves it. The payload is applied on approval, never before.';

-- ---------------------------------------------------------------------------
-- Who may see and decide
-- ---------------------------------------------------------------------------

alter table public.change_requests enable row level security;

-- Your own requests, and the ones put in front of you. A manager should be
-- able to watch what they asked for; nobody needs to read the whole queue.
create policy change_requests_read on public.change_requests
  for select to authenticated
  using (
    requested_by = auth.uid()
    or assigned_to = auth.uid()
    or app.can('payroll.approve', site_id)
    or app.can('attendance.approve', site_id)
  );

-- Anyone may ask. What they may ask *for* is decided by the action that builds
-- the payload, which holds the same permission checks the direct write did.
create policy change_requests_insert on public.change_requests
  for insert to authenticated
  with check (requested_by = auth.uid());

/*
 * Deciding is the superuser's, not the assignee's alone.
 *
 * Addressing a request to one director is a courtesy, not a lock: the factory
 * cannot stop because the named person is on leave. Both superuser roles
 * qualify, which is why this tests a permission every superuser resolves to
 * rather than naming roles.
 */
create policy change_requests_decide on public.change_requests
  for update to authenticated
  using (app.can('payroll.approve', site_id) or app.can('attendance.approve', site_id))
  with check (app.can('payroll.approve', site_id) or app.can('attendance.approve', site_id));

-- ---------------------------------------------------------------------------
-- Antrosys is billed as a contract firm, at a stated monthly amount
--
-- It was sitting at zero, which the payroll run reads as "charge nothing and
-- put none of its people on a line" — correct behaviour for an unset firm, and
-- wrong for one that is actually owed money every month.
-- ---------------------------------------------------------------------------

update public.departments
   set contract_amount = 35000
 where name = 'Antrosys'
   and default_worker_type = 'contractor';
