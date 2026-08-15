-- ============================================================================
-- RadoFlow payroll: effective-dated rate rules, pay periods, per-person
-- results, and freely-defined earning/deduction components.
--
-- Rate rules are effective-dated rather than edited in place, so reopening an
-- old period recomputes with the rates that applied at the time.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- Rate configuration
-- ---------------------------------------------------------------------------

create table public.pay_rules (
  id                       uuid primary key default gen_random_uuid(),
  site_id                  uuid not null references public.sites (id) on delete cascade,
  effective_from           date not null,

  standard_hours_per_day   numeric(4, 2) not null default 8 check (standard_hours_per_day > 0),
  standard_days_per_month  numeric(4, 1) not null default 26 check (standard_days_per_month > 0),

  -- Multipliers applied to the person's base hourly rate.
  ot_multiplier            numeric(5, 2) not null default 1.5  check (ot_multiplier >= 0),
  weekend_multiplier       numeric(5, 2) not null default 2.0  check (weekend_multiplier >= 0),
  holiday_multiplier       numeric(5, 2) not null default 2.0  check (holiday_multiplier >= 0),
  night_multiplier         numeric(5, 2) not null default 1.0  check (night_multiplier >= 0),

  -- Grace and rounding, in minutes.
  late_grace_minutes       integer not null default 10 check (late_grace_minutes >= 0),
  ot_threshold_minutes     integer not null default 30 check (ot_threshold_minutes >= 0),
  round_to_minutes         integer not null default 15 check (round_to_minutes > 0),

  created_by               uuid references public.profiles (id) on delete set null,
  created_at               timestamptz not null default now(),
  unique (site_id, effective_from)
);

comment on table public.pay_rules is
  'Effective-dated rate configuration per site. Never edit in place — insert a new row with a later effective_from.';

create or replace function app.pay_rule_for(p_site uuid, p_day date)
returns public.pay_rules
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select *
    from public.pay_rules
   where site_id = p_site
     and effective_from <= p_day
   order by effective_from desc
   limit 1;
$$;

-- ---------------------------------------------------------------------------
-- Freely-defined earnings and deductions
--
-- 'percent' is of gross, 'fixed' is an absolute amount, 'slab' reads a JSON
-- bracket table — enough to express statutory deductions and income tax
-- without new columns each time the rules change.
-- ---------------------------------------------------------------------------

create type public.component_kind as enum ('earning', 'deduction', 'tax');
create type public.component_calc as enum ('fixed', 'percent', 'slab', 'formula');

create table public.pay_components (
  id             uuid primary key default gen_random_uuid(),
  site_id        uuid references public.sites (id) on delete cascade,
  code           text not null,
  label          text not null,
  kind           public.component_kind not null,
  calc           public.component_calc not null default 'fixed',

  amount         numeric(14, 2) not null default 0,
  percent        numeric(6, 3) not null default 0,
  -- e.g. [{"upto": 600000, "rate": 0}, {"upto": 1200000, "rate": 2.5}]
  slabs          jsonb,

  -- Restrict to a pay class, or leave null for everyone.
  applies_to     public.pay_class,
  is_statutory   boolean not null default false,
  is_active      boolean not null default true,
  sort_order     integer not null default 100,

  effective_from date not null default current_date,
  created_by     uuid references public.profiles (id) on delete set null,
  created_at     timestamptz not null default now(),
  unique (site_id, code, effective_from)
);

-- Per-person overrides: an allowance for one worker, a loan repayment, etc.
create table public.profile_pay_components (
  id            uuid primary key default gen_random_uuid(),
  profile_id    uuid not null references public.profiles (id) on delete cascade,
  code          text not null,
  label         text not null,
  kind          public.component_kind not null,
  amount        numeric(14, 2) not null default 0,
  -- Null end date = recurring until removed.
  effective_from date not null default current_date,
  effective_to   date,
  note          text,
  created_by    uuid references public.profiles (id) on delete set null,
  created_at    timestamptz not null default now()
);

create index on public.profile_pay_components (profile_id);

-- ---------------------------------------------------------------------------
-- Pay periods and results
-- ---------------------------------------------------------------------------

create type public.payroll_status as enum (
  'draft', 'calculating', 'review', 'approved', 'paid', 'cancelled'
);

create table public.payroll_periods (
  id            uuid primary key default gen_random_uuid(),
  site_id       uuid not null references public.sites (id) on delete cascade,
  label         text not null,
  period_start  date not null,
  period_end    date not null,
  status        public.payroll_status not null default 'draft',

  budget        numeric(14, 2) not null default 0,
  total_gross   numeric(14, 2) not null default 0,
  total_deductions numeric(14, 2) not null default 0,
  total_tax     numeric(14, 2) not null default 0,
  total_net     numeric(14, 2) not null default 0,
  headcount     integer not null default 0,

  calculated_at timestamptz,
  approved_by   uuid references public.profiles (id) on delete set null,
  approved_at   timestamptz,
  paid_at       timestamptz,
  locked        boolean not null default false,

  created_by    uuid references public.profiles (id) on delete set null,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  unique (site_id, period_start, period_end),
  check (period_end >= period_start)
);

create index on public.payroll_periods (site_id, status);

create table public.payroll_items (
  id              uuid primary key default gen_random_uuid(),
  period_id       uuid not null references public.payroll_periods (id) on delete cascade,
  profile_id      uuid not null references public.profiles (id) on delete cascade,

  pay_class       public.pay_class not null,
  base_rate       numeric(12, 2) not null default 0,

  regular_hours   numeric(8, 2) not null default 0,
  ot_hours        numeric(8, 2) not null default 0,
  weekend_hours   numeric(8, 2) not null default 0,
  holiday_hours   numeric(8, 2) not null default 0,
  days_present    numeric(5, 1) not null default 0,
  days_absent     numeric(5, 1) not null default 0,
  days_leave      numeric(5, 1) not null default 0,

  base_pay        numeric(14, 2) not null default 0,
  ot_pay          numeric(14, 2) not null default 0,
  weekend_pay     numeric(14, 2) not null default 0,
  holiday_pay     numeric(14, 2) not null default 0,
  allowances      numeric(14, 2) not null default 0,
  gross           numeric(14, 2) not null default 0,
  deductions      numeric(14, 2) not null default 0,
  tax             numeric(14, 2) not null default 0,
  net             numeric(14, 2) not null default 0,

  -- Full line-by-line breakdown backing the payslip.
  breakdown       jsonb not null default '[]'::jsonb,
  status          public.payroll_status not null default 'draft',
  note            text,

  computed_at     timestamptz not null default now(),
  unique (period_id, profile_id)
);

create index on public.payroll_items (profile_id);
create index on public.payroll_items (period_id);

create table public.payslips (
  id            uuid primary key default gen_random_uuid(),
  payroll_item_id uuid not null references public.payroll_items (id) on delete cascade,
  profile_id    uuid not null references public.profiles (id) on delete cascade,
  period_id     uuid not null references public.payroll_periods (id) on delete cascade,
  reference     text not null unique,
  issued_at     timestamptz not null default now(),
  issued_by     uuid references public.profiles (id) on delete set null,
  snapshot      jsonb not null,
  unique (payroll_item_id)
);

create index on public.payslips (profile_id);

-- ---------------------------------------------------------------------------
-- Department KPIs and expense tracking for the C-level panels
-- ---------------------------------------------------------------------------

create table public.department_kpis (
  id            uuid primary key default gen_random_uuid(),
  department_id uuid not null references public.departments (id) on delete cascade,
  month         date not null,
  metric        text not null,
  label         text not null,
  target        numeric(14, 2) not null default 0,
  actual        numeric(14, 2) not null default 0,
  unit          text,
  updated_at    timestamptz not null default now(),
  unique (department_id, month, metric)
);

create table public.expenses (
  id            uuid primary key default gen_random_uuid(),
  site_id       uuid not null references public.sites (id) on delete cascade,
  month         date not null,
  category      text not null,
  label         text not null,
  amount        numeric(14, 2) not null default 0,
  created_by    uuid references public.profiles (id) on delete set null,
  created_at    timestamptz not null default now(),
  unique (site_id, month, category)
);

create index on public.expenses (site_id, month);

create trigger payroll_periods_touch before update on public.payroll_periods for each row execute function app.touch_updated_at();
