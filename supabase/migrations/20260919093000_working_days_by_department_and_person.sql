-- ============================================================================
-- Working days for one department, or one person.
--
-- The calendar could only answer for the whole factory: "Sunday the 14th is a
-- working day". The factory does not always work that way. Dyeing runs a
-- Sunday that folding does not; one man is given the Monday off in exchange
-- for the Sunday he came in. Both were impossible to record except as a whole-
-- factory day that was wrong for everybody else.
--
-- An override is one day for one department or one person. The most specific
-- answer wins:
--
--     person  >  department  >  factory day (calendar_days)  >  weekly pattern
--
-- `effective_day_type()` is that rule, in one place, and `refresh_day_types()`
-- re-prices the attendance already recorded for a date after any of the four
-- changes. Without it a Sunday opened on Monday would still read as a day off
-- for the punches that came in on Sunday, and payroll would price it that way.
-- ============================================================================

create table if not exists public.calendar_day_overrides (
  id             uuid primary key default gen_random_uuid(),
  site_id        uuid not null references public.sites (id) on delete cascade,
  scope          text not null check (scope in ('department', 'person')),
  department_id  uuid references public.departments (id) on delete cascade,
  profile_id     uuid references public.profiles (id) on delete cascade,
  -- One column the unique key can name, whichever of the two it is.
  scope_id       uuid generated always as (coalesce(department_id, profile_id)) stored,
  day            date not null,
  day_type       public.day_type not null,
  reason         text,
  created_by     uuid references public.profiles (id) on delete set null,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  check (
    (scope = 'department' and department_id is not null and profile_id is null)
    or (scope = 'person' and profile_id is not null and department_id is null)
  ),
  unique (scope, scope_id, day)
);

create index if not exists calendar_day_overrides_site_day
  on public.calendar_day_overrides (site_id, day);

comment on table public.calendar_day_overrides is
  'A working-calendar answer for one department or one person on one date. Beats the factory day and the weekly pattern.';

drop trigger if exists calendar_day_overrides_touch on public.calendar_day_overrides;
create trigger calendar_day_overrides_touch
  before update on public.calendar_day_overrides
  for each row execute function app.touch_updated_at();

alter table public.calendar_day_overrides enable row level security;

drop policy if exists calendar_day_overrides_read on public.calendar_day_overrides;
create policy calendar_day_overrides_read on public.calendar_day_overrides
  for select to authenticated
  using (
    profile_id = auth.uid()
    or app.can('calendar.manage', site_id)
    or app.can('attendance.view', site_id)
    or app.can('attendance.view.all', site_id)
  );

drop policy if exists calendar_day_overrides_write on public.calendar_day_overrides;
create policy calendar_day_overrides_write on public.calendar_day_overrides
  for all to authenticated
  using (app.can('calendar.manage', site_id))
  with check (app.can('calendar.manage', site_id));

/**
 * What kind of day `p_day` is for one person, most specific answer first.
 */
create or replace function public.effective_day_type(p_profile uuid, p_day date)
returns public.day_type
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  with person as (
    select id, site_id, department_id from public.profiles where id = p_profile
  )
  select coalesce(
    (select o.day_type
       from public.calendar_day_overrides o, person p
      where o.scope = 'person' and o.profile_id = p.id and o.day = p_day),
    (select o.day_type
       from public.calendar_day_overrides o, person p
      where o.scope = 'department' and o.department_id = p.department_id and o.day = p_day),
    (select cd.day_type
       from public.calendar_days cd, person p
      where cd.site_id = p.site_id and cd.day = p_day),
    (select case when ww.is_working = false then 'off'::public.day_type end
       from public.work_week ww, person p
      where ww.site_id = p.site_id and ww.weekday = extract(dow from p_day)::int),
    'workday'::public.day_type
  );
$$;

/**
 * Re-prices one date's recorded attendance at one factory after the calendar
 * changed. Rows a supervisor corrected by hand, or that are signed off, are
 * left as they were. A day with no punches follows its new type — absent on a
 * working day, off or holiday otherwise — and a day somebody worked keeps its
 * status and only changes how its hours are priced.
 */
create or replace function public.refresh_day_types(p_site uuid, p_day date)
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_count integer;
begin
  if auth.uid() is not null and not app.can('calendar.manage', p_site) then
    raise exception 'Not allowed to change the working calendar'
      using errcode = '42501';
  end if;

  with target as (
    select a.id, public.effective_day_type(a.profile_id, a.work_date) as day_type
      from public.attendance_days a
     where a.site_id = p_site
       and a.work_date = p_day
       and not coalesce(a.is_manual, false)
       and not coalesce(a.locked, false)
  )
  update public.attendance_days a
     set day_type = t.day_type,
         status = case
           when a.first_in is null
                and coalesce(a.regular_hours, 0) = 0
                and a.status in ('absent', 'off', 'holiday')
             then case t.day_type
                    when 'off' then 'off'::public.attendance_status
                    when 'holiday' then 'holiday'::public.attendance_status
                    else 'absent'::public.attendance_status
                  end
           else a.status
         end
    from target t
   where a.id = t.id
     and a.day_type is distinct from t.day_type;

  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

grant execute on function public.effective_day_type(uuid, date) to authenticated, service_role;
grant execute on function public.refresh_day_types(uuid, date) to authenticated, service_role;

-- A request to approve can now carry a department or person override too.
alter type public.change_kind add value if not exists 'calendar_override';
