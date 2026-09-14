-- ============================================================================
-- PENDING MIGRATION (20 Sep 2026) — paste this whole file into the Supabase
-- SQL editor:  Dashboard -> SQL Editor -> New query -> paste -> Run
--
-- The exact content of:
--
--   20260920090000_canteen_menus_meal_limits_and_pay_types.sql
--
-- Run it after APPLY-2026-09-19.sql. It adds the canteen's weekly and daily
-- menus (seeded with the canteen's weekly schedule), no-meal dates, meals per
-- 24 hours for contractors, and corrects eleven people's pay type from the
-- WORKERS LIST notes (matched by unique ID and name).
-- ============================================================================


-- >>> 20260920090000_canteen_menus_meal_limits_and_pay_types.sql
-- ============================================================================
-- The canteen's menu, meals per day for contractors, and three ways of being
-- paid read correctly from the WORKERS LIST.
--
-- 1. Menus. A meal was one flat price all year. The canteen cooks roti and
--    daal one day and haleem another, and the bill should follow what was
--    cooked. The office keeps a weekly schedule (canteen_menu_weekly) and,
--    when a day needs something else, that date's own menu
--    (canteen_menu_days), which replaces the schedule for that date. A meal
--    costs the sum of its day's dishes. Which working day a scheduled menu
--    lands on follows the calendar — see src/lib/canteen/menu.ts.
--
-- 2. Meals per 24 hours. Everybody still eats once in any 24 hours. A
--    contract firm can agree more for its people: the limit is set on the
--    person, or on their department, and the trigger that has always refused
--    a second meal now refuses the one past the limit instead.
--
-- 3. Pay types. The sheet's last column says how each person is paid. Four
--    are "Fixed Salary no Attendance Required", four "8 Hours Duty and no
--    limit duty", and three duty days were recorded at the wrong length. Rows
--    change only where the unique ID and the name both match.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. Menus
-- ---------------------------------------------------------------------------

create table if not exists public.canteen_menu_weekly (
  id          uuid primary key default gen_random_uuid(),
  site_id     uuid not null references public.sites (id) on delete cascade,
  weekday     smallint not null check (weekday between 0 and 6),
  name        text not null check (length(trim(name)) > 0),
  price_pkr   numeric(10, 2) not null default 0 check (price_pkr >= 0),
  sort_order  integer not null default 100,
  created_by  uuid references public.profiles (id) on delete set null,
  created_at  timestamptz not null default now()
);

comment on table public.canteen_menu_weekly is
  'One dish on the weekly canteen schedule. Weekday 0 is Sunday. A meal on that weekday costs the dishes added together.';

create index if not exists canteen_menu_weekly_site_day
  on public.canteen_menu_weekly (site_id, weekday, sort_order);

create table if not exists public.canteen_menu_days (
  id          uuid primary key default gen_random_uuid(),
  site_id     uuid not null references public.sites (id) on delete cascade,
  day         date not null,
  name        text not null check (length(trim(name)) > 0),
  price_pkr   numeric(10, 2) not null default 0 check (price_pkr >= 0),
  sort_order  integer not null default 100,
  created_by  uuid references public.profiles (id) on delete set null,
  created_at  timestamptz not null default now()
);

comment on table public.canteen_menu_days is
  'One dish on a particular date. Any dish on a date replaces that date''s weekly schedule entirely.';

create index if not exists canteen_menu_days_site_day
  on public.canteen_menu_days (site_id, day, sort_order);

alter table public.canteen_menu_weekly enable row level security;
alter table public.canteen_menu_days   enable row level security;

drop policy if exists canteen_menu_weekly_read on public.canteen_menu_weekly;
create policy canteen_menu_weekly_read on public.canteen_menu_weekly
  for select to authenticated
  using (
    app.can('canteen.view', site_id)
    or app.can('canteen.serve', site_id)
    or app.can('canteen.manage', site_id)
  );

drop policy if exists canteen_menu_weekly_write on public.canteen_menu_weekly;
create policy canteen_menu_weekly_write on public.canteen_menu_weekly
  for all to authenticated
  using (app.can('canteen.manage', site_id))
  with check (app.can('canteen.manage', site_id));

drop policy if exists canteen_menu_days_read on public.canteen_menu_days;
create policy canteen_menu_days_read on public.canteen_menu_days
  for select to authenticated
  using (
    app.can('canteen.view', site_id)
    or app.can('canteen.serve', site_id)
    or app.can('canteen.manage', site_id)
  );

drop policy if exists canteen_menu_days_write on public.canteen_menu_days;
create policy canteen_menu_days_write on public.canteen_menu_days
  for all to authenticated
  using (app.can('canteen.manage', site_id))
  with check (app.can('canteen.manage', site_id));

grant select, insert, update, delete on public.canteen_menu_weekly to authenticated;
grant select, insert, update, delete on public.canteen_menu_days   to authenticated;

/*
 * A date the office has said serves no meal — Thursday's meal moved to a
 * Monday leaves the Thursday here. Beats the weekly schedule for that date.
 */
create table if not exists public.canteen_menu_no_meal (
  id          uuid primary key default gen_random_uuid(),
  site_id     uuid not null references public.sites (id) on delete cascade,
  day         date not null,
  reason      text,
  created_by  uuid references public.profiles (id) on delete set null,
  created_at  timestamptz not null default now(),
  unique (site_id, day)
);

comment on table public.canteen_menu_no_meal is
  'A date that serves no meal, whatever the weekly schedule says.';

alter table public.canteen_menu_no_meal enable row level security;

drop policy if exists canteen_menu_no_meal_read on public.canteen_menu_no_meal;
create policy canteen_menu_no_meal_read on public.canteen_menu_no_meal
  for select to authenticated
  using (
    app.can('canteen.view', site_id)
    or app.can('canteen.serve', site_id)
    or app.can('canteen.manage', site_id)
  );

drop policy if exists canteen_menu_no_meal_write on public.canteen_menu_no_meal;
create policy canteen_menu_no_meal_write on public.canteen_menu_no_meal
  for all to authenticated
  using (app.can('canteen.manage', site_id))
  with check (app.can('canteen.manage', site_id));

grant select, insert, update, delete on public.canteen_menu_no_meal to authenticated;

/*
 * The canteen's weekly schedule as the office sent it (canteen pricing.pdf).
 * Thursday serves no meal. Wednesday is "Aloo Kofta / Sabzi, 105 / 85"; a scan
 * cannot say which of the two somebody took, so it is one dish at the dearer
 * price until the office changes it. Only written when the schedule is empty,
 * so re-running never duplicates a dish or undoes an edit.
 */
insert into public.canteen_menu_weekly (site_id, weekday, name, price_pkr, sort_order)
select s.id, v.weekday, v.name, v.price, 10
  from (select id from public.sites order by name limit 1) s
 cross join (values
   (1, 'Chicken', 140),
   (2, 'Daal', 85),
   (3, 'Aloo Kofta / Sabzi', 105),
   (5, 'Daal Mash', 105),
   (6, 'Sabzi', 85),
   (0, 'Chany + Sabzi', 85)
 ) as v(weekday, name, price)
 where not exists (select 1 from public.canteen_menu_weekly);

-- The menu needs to know which days are working days; the weekly pattern is
-- otherwise only read inside security-definer functions.
drop policy if exists work_week_canteen_read on public.work_week;
create policy work_week_canteen_read on public.work_week
  for select to authenticated
  using (app.can('canteen.view', site_id) or app.can('canteen.manage', site_id));

-- ---------------------------------------------------------------------------
-- 2. Meals per 24 hours
-- ---------------------------------------------------------------------------

alter table public.profiles
  add column if not exists meals_per_day smallint
    check (meals_per_day is null or meals_per_day between 1 and 10);

alter table public.departments
  add column if not exists meals_per_day smallint
    check (meals_per_day is null or meals_per_day between 1 and 10);

comment on column public.profiles.meals_per_day is
  'Meals this person may take in any 24 hours. Null takes the department''s, and failing that one.';
comment on column public.departments.meals_per_day is
  'Meals each person in this department may take in any 24 hours — agreed with a contract firm. Null is one.';

create or replace function app.enforce_meal_interval()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_limit integer;
  v_taken integer;
begin
  /*
   * Serialise concurrent scans for this one person before counting — see
   * 20260905090000 for why the lock is what makes this atomic. Do not remove
   * it as a simplification.
   */
  perform pg_advisory_xact_lock(hashtextextended(new.profile_id::text, 0));

  select coalesce(p.meals_per_day, d.meals_per_day, 1)
    into v_limit
    from public.profiles p
    left join public.departments d on d.id = p.department_id
   where p.id = new.profile_id;

  select count(*)
    into v_taken
    from public.meal_claims c
   where c.profile_id = new.profile_id
     and c.claimed_at >  new.claimed_at - interval '24 hours'
     and c.claimed_at <  new.claimed_at + interval '24 hours';

  if v_taken >= coalesce(v_limit, 1) then
    raise exception 'This person has already had % meal(s) in the last 24 hours.', coalesce(v_limit, 1)
      using errcode = 'unique_violation';
  end if;

  return new;
end;
$$;

comment on function app.enforce_meal_interval() is
  'At most meals_per_day meals (the person''s, else their department''s, else one) in any rolling 24 hours, made atomic by a per-profile advisory lock. Raises 23505 so ingestion reads it as a duplicate.';

/*
 * Setting a limit belongs to whoever runs the canteen, who cannot otherwise
 * write to profiles or departments. One narrow function rather than a wider
 * update policy on either table.
 */
create or replace function public.set_meal_limit(p_scope text, p_id uuid, p_limit integer)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if not app.can('canteen.manage') then
    raise exception 'Only the canteen''s managers can set meal limits.' using errcode = '42501';
  end if;
  if p_limit is not null and (p_limit < 1 or p_limit > 10) then
    raise exception 'A meal limit is between 1 and 10.' using errcode = '22023';
  end if;

  if p_scope = 'department' then
    update public.departments set meals_per_day = p_limit where id = p_id;
  elsif p_scope = 'person' then
    update public.profiles set meals_per_day = p_limit where id = p_id;
  else
    raise exception 'Unknown scope %', p_scope using errcode = '22023';
  end if;
end;
$$;

revoke all on function public.set_meal_limit(text, uuid, integer) from public;
grant execute on function public.set_meal_limit(text, uuid, integer) to authenticated;

-- ---------------------------------------------------------------------------
-- 3. Pay types from the WORKERS LIST
-- ---------------------------------------------------------------------------

with sheet (employee_code, full_name, requires_attendance, flexible_hours, duty_hours, note) as (
  values
  ('RD-2013', 'IMAM MASJID', false::boolean, null::boolean, null::numeric, 'Fixed Salary no Attendece Required'),
  ('RD-2014', 'MAQBOOL', false::boolean, null::boolean, null::numeric, 'Fixed Salary no Attendece Required'),
  ('RD-2024', 'ASIF', false::boolean, null::boolean, null::numeric, 'Fixed Salary no Attendece Required'),
  ('RD-2081', 'USMAN FAROOQ', false::boolean, null::boolean, null::numeric, 'Fixed Salary no Attendece Required'),
  ('RD-2045', 'SHAHKIL', null::boolean, true::boolean, null::numeric, '8 Hours Duty and no limit duty'),
  ('RD-2046', 'SHEHZAD AHMED', null::boolean, true::boolean, null::numeric, '8 Hours Duty and no limit duty'),
  ('RD-3140', 'SALAMAT', null::boolean, true::boolean, null::numeric, '8 Hours Duty and no limit duty'),
  ('RD-2063', 'M MANSOOR ALAM', null::boolean, true::boolean, null::numeric, '8 Hours Duty and no limit duty'),
  ('RD-2179', 'IMTIAZ', null::boolean, null::boolean, 8::numeric, '8 Hours Duty + Over time'),
  ('RD-2239', 'SAIF ULLAH', null::boolean, null::boolean, 8::numeric, '8 Hours Duty + Over time'),
  ('RD-2186', 'TAYYAB', null::boolean, null::boolean, 12::numeric, '12 Hour duty + holiday over time(Sunday ect.)')
)
update public.profiles p
   set requires_attendance = coalesce(s.requires_attendance, p.requires_attendance),
       flexible_hours      = coalesce(s.flexible_hours, p.flexible_hours),
       duty_hours          = coalesce(s.duty_hours, p.duty_hours)
  from sheet s
 where p.employee_code = s.employee_code
   and upper(trim(p.full_name)) = upper(trim(s.full_name))
   and (
        (s.requires_attendance is not null and p.requires_attendance is distinct from s.requires_attendance)
     or (s.flexible_hours is not null and p.flexible_hours is distinct from s.flexible_hours)
     or (s.duty_hours is not null and p.duty_hours is distinct from s.duty_hours)
   );
