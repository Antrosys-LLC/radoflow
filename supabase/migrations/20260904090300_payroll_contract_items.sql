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
