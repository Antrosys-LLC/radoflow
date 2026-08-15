-- ============================================================================
-- Custom money rates, three-shift working, and late-arrival penalties.
--
-- Replaces the multiplier model ("overtime = 2x basic") with explicit rupee
-- amounts per hour. A multiplier ties every premium to the base wage, so
-- raising someone's basic silently raises their overtime too and the two
-- cannot be negotiated separately — which is not how the floor actually pays.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- Site-level default rates, still effective-dated
-- ---------------------------------------------------------------------------

alter table public.pay_rules
  drop column if exists ot_multiplier,
  drop column if exists weekend_multiplier,
  drop column if exists holiday_multiplier,
  drop column if exists night_multiplier;

alter table public.pay_rules
  add column ot_hourly_rate       numeric(10, 2) not null default 0 check (ot_hourly_rate >= 0),
  add column weekend_hourly_rate  numeric(10, 2) not null default 0 check (weekend_hourly_rate >= 0),
  add column holiday_hourly_rate  numeric(10, 2) not null default 0 check (holiday_hourly_rate >= 0),
  add column night_hourly_rate    numeric(10, 2) not null default 0 check (night_hourly_rate >= 0);

comment on column public.pay_rules.ot_hourly_rate is
  'Rupees per overtime hour. A flat amount, not a multiple of the base wage.';

-- ---------------------------------------------------------------------------
-- Per-employee rate overrides
--
-- Null means "use the site default", so a negotiated overtime rate for one
-- senior operator does not require a separate rule set for everyone.
-- ---------------------------------------------------------------------------

alter table public.profiles
  add column ot_hourly_rate      numeric(10, 2) check (ot_hourly_rate is null or ot_hourly_rate >= 0),
  add column weekend_hourly_rate numeric(10, 2) check (weekend_hourly_rate is null or weekend_hourly_rate >= 0),
  add column holiday_hourly_rate numeric(10, 2) check (holiday_hourly_rate is null or holiday_hourly_rate >= 0);

-- ---------------------------------------------------------------------------
-- Shifts
--
-- The factory runs three rotations. ends_at may be earlier than starts_at,
-- which marks a shift crossing midnight — the night shift.
-- ---------------------------------------------------------------------------

create table public.shifts (
  id             uuid primary key default gen_random_uuid(),
  site_id        uuid not null references public.sites (id) on delete cascade,
  code           text not null,
  name           text not null,
  starts_at      time not null,
  ends_at        time not null,
  /** Minutes after starts_at that are still counted as on time. */
  grace_minutes  integer not null default 10 check (grace_minutes >= 0),
  /** Unpaid break deducted from the shift, in minutes. */
  break_minutes  integer not null default 0 check (break_minutes >= 0),
  is_active      boolean not null default true,
  sort_order     integer not null default 100,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  unique (site_id, code)
);

create index on public.shifts (site_id);

/** True when the shift runs past midnight into the next calendar day. */
create or replace function app.shift_crosses_midnight(p_shift public.shifts)
returns boolean
language sql
immutable
as $$
  select p_shift.ends_at <= p_shift.starts_at;
$$;

alter table public.profiles
  add column shift_id uuid references public.shifts (id) on delete set null;

create index on public.profiles (shift_id);

-- ---------------------------------------------------------------------------
-- Late-arrival penalties
--
-- Tiered: the longer someone is late, the larger the deduction. `basis` is
-- explicit because "10% of salary" is ambiguous — 10% of one day's pay and 10%
-- of a month's pay differ by a factor of twenty-six.
-- ---------------------------------------------------------------------------

create type public.penalty_basis as enum ('day', 'month');

create table public.late_penalty_rules (
  id              uuid primary key default gen_random_uuid(),
  site_id         uuid not null references public.sites (id) on delete cascade,
  /** Null applies the tier to every shift at the site. */
  shift_id        uuid references public.shifts (id) on delete cascade,
  label           text not null,
  /** Lateness band in minutes past the shift start, grace already allowed. */
  from_minutes    integer not null check (from_minutes >= 0),
  /** Null means "and beyond". */
  to_minutes      integer check (to_minutes is null or to_minutes > from_minutes),
  penalty_percent numeric(5, 2) not null check (penalty_percent >= 0 and penalty_percent <= 100),
  basis           public.penalty_basis not null default 'day',
  is_active       boolean not null default true,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create index on public.late_penalty_rules (site_id, shift_id);

-- ---------------------------------------------------------------------------
-- Attendance gains shift context
-- ---------------------------------------------------------------------------

alter table public.attendance_days
  add column shift_id     uuid references public.shifts (id) on delete set null,
  /** Minutes past shift start at first check-in, after the grace period. */
  add column minutes_late integer not null default 0 check (minutes_late >= 0),
  add column is_late      boolean not null default false;

-- ---------------------------------------------------------------------------
-- Terminal enrolment id == employee code
--
-- The ERP code and the number typed into the K50 must be the same, otherwise
-- every punch needs a manual mapping. This trigger keeps an enrolment row on
-- every active terminal at the person's site, keyed by their employee code.
-- ---------------------------------------------------------------------------

create or replace function app.sync_device_enrollments()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if new.site_id is null then
    return new;
  end if;

  insert into public.device_enrollments (device_id, device_user_id, profile_id)
  select d.id, new.employee_code, new.id
    from public.devices d
   where d.site_id = new.site_id
     and d.is_active
  on conflict (device_id, device_user_id)
    do update set profile_id = excluded.profile_id;

  -- A renamed employee code leaves its old mapping behind; drop it so punches
  -- cannot keep arriving under a code that no longer identifies anyone.
  if tg_op = 'UPDATE' and old.employee_code is distinct from new.employee_code then
    delete from public.device_enrollments
     where profile_id = new.id
       and device_user_id = old.employee_code;
  end if;

  return new;
end;
$$;

create trigger profiles_sync_enrollments
  after insert or update of employee_code, site_id on public.profiles
  for each row execute function app.sync_device_enrollments();

/** Back-fills enrolments when a new terminal is added to a site. */
create or replace function app.sync_enrollments_for_device()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if not new.is_active then
    return new;
  end if;

  insert into public.device_enrollments (device_id, device_user_id, profile_id)
  select new.id, p.employee_code, p.id
    from public.profiles p
   where p.site_id = new.site_id
     and p.status = 'active'
  on conflict (device_id, device_user_id)
    do update set profile_id = excluded.profile_id;

  return new;
end;
$$;

create trigger devices_sync_enrollments
  after insert on public.devices
  for each row execute function app.sync_enrollments_for_device();

create trigger shifts_touch before update on public.shifts
  for each row execute function app.touch_updated_at();
create trigger late_rules_touch before update on public.late_penalty_rules
  for each row execute function app.touch_updated_at();

-- ---------------------------------------------------------------------------
-- RLS for the new tables
-- ---------------------------------------------------------------------------

alter table public.shifts enable row level security;
alter table public.late_penalty_rules enable row level security;

-- Everyone needs to know the shift they work.
create policy shifts_read on public.shifts
  for select to authenticated using (true);
create policy shifts_write on public.shifts
  for all to authenticated
  using (app.can('settings.manage', site_id)) with check (app.can('settings.manage', site_id));

create policy late_rules_read on public.late_penalty_rules
  for select to authenticated using (app.can('rates.view', site_id));
create policy late_rules_write on public.late_penalty_rules
  for all to authenticated
  using (app.can('rates.manage', site_id)) with check (app.can('rates.manage', site_id));

grant select, insert, update, delete on public.shifts, public.late_penalty_rules
  to authenticated, service_role;
