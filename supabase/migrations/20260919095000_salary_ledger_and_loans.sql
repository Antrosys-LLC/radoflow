-- ============================================================================
-- The salary ledger: advances, suits, allowances, and loans paid back from pay.
--
-- The office's salary sheet has four columns after G SALARY that RadoFlow did
-- not know about — ADVANCE, ADVANCE, LOAN DED. and SUITE DED. — and they are
-- filled in by hand every month. This is where those figures live now, so the
-- payroll run takes them off pay itself and the sheet it prints is the sheet
-- the office already reads.
--
--   salary_adjustments  one figure for one person for one month: an advance
--                       (two columns, as the sheet has), a suit, an allowance,
--                       or any other deduction.
--   employee_loans      a loan and how it is paid back: a fixed installment,
--                       or the principal spread over a number of months.
--   loan_recoveries     what was actually taken back, month by month. Written
--                       by the payroll run (idempotently — a re-run replaces
--                       its own line) or by hand for cash repaid.
--
-- A loan's balance is never stored. It is the principal less what the
-- recoveries say was taken, so a re-run payroll and a hand-entered repayment
-- can never leave two figures disagreeing.
-- ============================================================================

do $$
begin
  create type public.salary_adjustment_kind as enum (
    'advance', 'advance_2', 'suit', 'allowance', 'deduction'
  );
exception when duplicate_object then null;
end $$;

create table if not exists public.salary_adjustments (
  id          uuid primary key default gen_random_uuid(),
  profile_id  uuid not null references public.profiles (id) on delete cascade,
  -- The first of the month the figure belongs to.
  month       date not null check (extract(day from month) = 1),
  kind        public.salary_adjustment_kind not null,
  amount      numeric(12, 2) not null check (amount > 0),
  label       text,
  note        text,
  given_on    date,
  created_by  uuid references public.profiles (id) on delete set null,
  created_at  timestamptz not null default now()
);

create index if not exists salary_adjustments_month on public.salary_adjustments (month);
create index if not exists salary_adjustments_person on public.salary_adjustments (profile_id, month);

create table if not exists public.employee_loans (
  id            uuid primary key default gen_random_uuid(),
  profile_id    uuid not null references public.profiles (id) on delete cascade,
  principal     numeric(12, 2) not null check (principal > 0),
  installment   numeric(12, 2) not null check (installment > 0),
  installments  integer not null check (installments > 0),
  -- The first month an installment comes off pay.
  first_month   date not null check (extract(day from first_month) = 1),
  taken_on      date not null default current_date,
  status        text not null default 'active' check (status in ('active', 'settled', 'cancelled')),
  note          text,
  created_by    uuid references public.profiles (id) on delete set null,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  check (installment <= principal)
);

create index if not exists employee_loans_person on public.employee_loans (profile_id, status);

drop trigger if exists employee_loans_touch on public.employee_loans;
create trigger employee_loans_touch
  before update on public.employee_loans
  for each row execute function app.touch_updated_at();

create table if not exists public.loan_recoveries (
  id          uuid primary key default gen_random_uuid(),
  loan_id     uuid not null references public.employee_loans (id) on delete cascade,
  period_id   uuid references public.payroll_periods (id) on delete set null,
  month       date not null check (extract(day from month) = 1),
  amount      numeric(12, 2) not null check (amount >= 0),
  source      text not null default 'payroll' check (source in ('payroll', 'manual')),
  note        text,
  created_at  timestamptz not null default now(),
  unique (loan_id, month, source)
);

create index if not exists loan_recoveries_loan on public.loan_recoveries (loan_id);

-- The two figures the sheet prints that a payroll line did not keep: the
-- salary it was priced from, and the days that earned it.
alter table public.payroll_items
  add column if not exists monthly_salary numeric(14, 2),
  add column if not exists working_days numeric(5, 1);

-- ---------------------------------------------------------------------------
-- Access: read with the payroll, written by whoever runs or pays it.
-- ---------------------------------------------------------------------------

alter table public.salary_adjustments enable row level security;
alter table public.employee_loans     enable row level security;
alter table public.loan_recoveries    enable row level security;

drop policy if exists salary_adjustments_read on public.salary_adjustments;
create policy salary_adjustments_read on public.salary_adjustments
  for select to authenticated
  using (profile_id = auth.uid() or app.can('payroll.view'));

drop policy if exists salary_adjustments_write on public.salary_adjustments;
create policy salary_adjustments_write on public.salary_adjustments
  for all to authenticated
  using (app.can('payroll.run') or app.can('payroll.pay'))
  with check (app.can('payroll.run') or app.can('payroll.pay'));

drop policy if exists employee_loans_read on public.employee_loans;
create policy employee_loans_read on public.employee_loans
  for select to authenticated
  using (profile_id = auth.uid() or app.can('payroll.view'));

drop policy if exists employee_loans_write on public.employee_loans;
create policy employee_loans_write on public.employee_loans
  for all to authenticated
  using (app.can('payroll.run') or app.can('payroll.pay'))
  with check (app.can('payroll.run') or app.can('payroll.pay'));

drop policy if exists loan_recoveries_read on public.loan_recoveries;
create policy loan_recoveries_read on public.loan_recoveries
  for select to authenticated
  using (
    app.can('payroll.view')
    or exists (
      select 1 from public.employee_loans l
       where l.id = loan_id and l.profile_id = auth.uid()
    )
  );

drop policy if exists loan_recoveries_write on public.loan_recoveries;
create policy loan_recoveries_write on public.loan_recoveries
  for all to authenticated
  using (app.can('payroll.run') or app.can('payroll.pay'))
  with check (app.can('payroll.run') or app.can('payroll.pay'));
