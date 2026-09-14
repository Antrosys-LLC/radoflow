-- ============================================================================
-- PENDING MIGRATIONS (19 Sep 2026 batch) — paste this whole file into the
-- Supabase SQL editor:  Dashboard -> SQL Editor -> New query -> paste -> Run
--
-- The exact content of these seven files, in order:
--
--   20260919090000_c_level_and_owners.sql
--   20260919091000_two_shifts_and_rosters_that_follow_the_floor.sql
--   20260919092000_withdraw_and_undo_decisions.sql
--   20260919093000_working_days_by_department_and_person.sql
--   20260919094000_canteen_meal_price.sql
--   20260919095000_salary_ledger_and_loans.sql
--   20260919096000_salaries_from_workers_list.sql
--
-- Run it after APPLY-PENDING.sql if that has not been applied yet. The last
-- file matches salaries from the WORKERS LIST by unique ID and name; review it
-- before running if the sheet has changed since.
--
-- Not wrapped in BEGIN/COMMIT: each statement stands on its own, so nothing
-- here depends on a transaction to hold temporary state.
-- ============================================================================


-- >>> 20260919090000_c_level_and_owners.sql
-- ============================================================================
-- C-Level, and the two owners inside it.
--
-- "CEO" was one unrestricted role, and anybody holding it could do everything
-- — including hand the same power to somebody else. The business is owned by
-- two people, Arham Sethi and Ghaffar Sethi, and that is who should decide who
-- gets access to anything. Everybody else at director level is C-Level: every
-- capability the factory has, and no approval queue in front of any of it, but
-- not the key that decides who else gets in.
--
--   owner          C-Level · Owner. Unrestricted. Gives and takes away access
--                  from anyone, other C-Levels included.
--   ceo            C-Level. Every capability except `access.manage`. Keeps its
--                  key so nothing that reads the key has to change; only the
--                  name the screens show is different.
--   admin-antrosys unchanged — unrestricted, because Antrosys maintains the
--                  system and cannot be made to wait on it.
--
-- Nobody but an owner or Antrosys may give, change or take away any of those
-- three roles. That is held in a trigger on user_roles rather than in the
-- screen, because a role granted by any route — the users page, a bulk action,
-- a future import — is the same escalation.
-- ============================================================================

insert into public.roles (key, name, description, is_system, is_superuser, rank)
values (
  'owner',
  'C-Level · Owner',
  'Owns the business. Unrestricted, and decides who gets access to anything — other C-Levels included.',
  true,
  true,
  5
)
on conflict (key) do update
   set name         = excluded.name,
       description  = excluded.description,
       is_system    = true,
       is_superuser = true,
       rank         = excluded.rank;

update public.roles
   set name         = 'C-Level',
       description  = 'Runs the company. Every capability except giving access to others, and no approval needed for anything.',
       is_superuser = false,
       rank         = 20
 where key = 'ceo';

-- Every capability there is, bar the one that hands out capabilities.
insert into public.role_permissions (role_id, permission_id)
select r.id, p.id
  from public.roles r
  cross join public.permissions p
 where r.key = 'ceo'
   and p.key <> 'access.manage'
on conflict do nothing;

delete from public.role_permissions rp
 using public.roles r, public.permissions p
 where rp.role_id = r.id
   and rp.permission_id = p.id
   and r.key = 'ceo'
   and p.key = 'access.manage';

-- ---------------------------------------------------------------------------
-- The two owners
--
-- Matched on the name as the office typed it. Whoever is found loses whatever
-- role they held and holds `owner` alone; a name that matches nobody changes
-- nothing, and Antrosys can make the assignment from the users screen.
-- ---------------------------------------------------------------------------

-- The same condition twice rather than a temporary table: this file is also
-- pasted into the SQL editor, where every statement commits on its own and a
-- table created ON COMMIT DROP is gone before the next line runs.
delete from public.user_roles ur
 using public.profiles p
 where ur.user_id = p.id
   and (p.full_name ilike '%arham%sethi%' or p.full_name ilike '%ghaffar%sethi%');

insert into public.user_roles (user_id, role_id)
select p.id, r.id
  from public.profiles p
  cross join public.roles r
 where r.key = 'owner'
   and (p.full_name ilike '%arham%sethi%' or p.full_name ilike '%ghaffar%sethi%');

-- ---------------------------------------------------------------------------
-- Who may hand out leadership
-- ---------------------------------------------------------------------------

/** An owner, or Antrosys: the two who may decide about leadership roles. */
create or replace function app.is_owner(p_user uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1
      from public.user_roles ur
      join public.roles r on r.id = ur.role_id
     where ur.user_id = p_user
       and r.key in ('owner', 'admin-antrosys')
  );
$$;

/** Holds a leadership role: owner, C-Level or Antrosys. */
create or replace function app.is_leadership(p_user uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1
      from public.user_roles ur
      join public.roles r on r.id = ur.role_id
     where ur.user_id = p_user
       and r.key in ('owner', 'ceo', 'admin-antrosys')
  );
$$;

create or replace function app.guard_leadership_roles()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_key text;
  v_user uuid;
begin
  -- Migrations, seeds and service-key work have no session user.
  if auth.uid() is null or app.is_owner(auth.uid()) then
    return coalesce(new, old);
  end if;

  select key into v_key from public.roles where id = coalesce(new.role_id, old.role_id);
  v_user := coalesce(new.user_id, old.user_id);

  if v_key in ('owner', 'ceo', 'admin-antrosys')
     or (tg_op <> 'INSERT' and app.is_leadership(v_user)) then
    raise exception 'Only an owner may give or take away C-Level access'
      using errcode = '42501';
  end if;

  return coalesce(new, old);
end;
$$;

drop trigger if exists user_roles_guard_leadership on public.user_roles;
create trigger user_roles_guard_leadership
  before insert or update or delete on public.user_roles
  for each row execute function app.guard_leadership_roles();

/*
 * A C-Level account no longer holds `access.manage`, which is what
 * app.may_administer() used to recognise a privileged account by. Without
 * this, anybody holding `people.manage` could suspend a director.
 */
create or replace function app.may_administer(p_target uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select
    auth.uid() is null
    or p_target = auth.uid()
    or app.is_owner(auth.uid())
    or (
      app.can('access.manage')
      and not app.is_leadership(p_target)
    )
    or (
      not app.has_permission(p_target, 'access.manage')
      and not app.is_leadership(p_target)
    );
$$;

-- The assistant stays with the people who answer for its cost.
insert into public.role_permissions (role_id, permission_id)
select r.id, p.id
  from public.roles r
  cross join public.permissions p
 where r.key = 'owner'
   and p.key = 'assistant.ask'
on conflict do nothing;

-- >>> 20260919091000_two_shifts_and_rosters_that_follow_the_floor.sql
-- ============================================================================
-- Two eight-hour shifts, each with its overtime behind it — and a roster that
-- follows the floor.
--
-- The factory runs a day shift from 08:00 to 16:00 and a night shift from
-- 20:00 to 04:00. The four hours after each are overtime: the day shift's run
-- to 20:00, the night shift's to 08:00. The shifts were stored as two twelve-
-- hour blocks, which put the end of the working day at the end of overtime —
-- so the board could never say a person was on overtime, only still at work.
--
-- `overtime_until` is where overtime stops. It changes nothing the payroll
-- engine pays: the salary still covers `duty_hours`, and anything past that is
-- overtime up to `pay_rules.ot_daily_cap_hours`. It is the shift's own
-- statement of the window, for the board and for the roster.
--
-- People move between the two. Somebody on nights for a fortnight who starts
-- turning up at eight in the morning is on days now, and a roster that still
-- says nights marks him late by twelve hours every morning until somebody in
-- the office notices. So a person's shift follows their check-ins: after
-- `shifts.auto_switch_after_days` attended days in a row that all started on
-- the other shift, they are moved to it. `shift_follows_attendance` switches
-- that off for one person — a supervisor rostered on nights who covers the
-- odd day must not be flipped by it.
-- ============================================================================

alter table public.shifts
  add column if not exists overtime_until time;

comment on column public.shifts.overtime_until is
  'Where this shift''s overtime window ends. From ends_at to here is overtime; the daily overtime cap still applies.';

insert into public.shifts (site_id, code, name, starts_at, ends_at, overtime_until, grace_minutes, sort_order)
select s.id, v.code, v.name, v.starts_at::time, v.ends_at::time, v.ot_until::time, 15, v.sort_order
  from public.sites s
  cross join (values
    ('DAY',   'Day · 8am to 4pm, overtime to 8pm',   '08:00', '16:00', '20:00', 10),
    ('NIGHT', 'Night · 8pm to 4am, overtime to 8am', '20:00', '04:00', '08:00', 20)
  ) as v(code, name, starts_at, ends_at, ot_until, sort_order)
on conflict (site_id, code) do update
   set name           = excluded.name,
       starts_at      = excluded.starts_at,
       ends_at        = excluded.ends_at,
       overtime_until = excluded.overtime_until,
       is_active      = true;

alter table public.profiles
  add column if not exists shift_follows_attendance boolean not null default true,
  add column if not exists shift_changed_at timestamptz;

comment on column public.profiles.shift_follows_attendance is
  'Move this person between the day and night shift when their check-ins say they have moved. Off pins the shift the office chose.';
comment on column public.profiles.shift_changed_at is
  'When the shift was last changed because of attendance, so the office can see the roster moved on its own.';

-- Three days is long enough that one covered shift does not flip anybody, and
-- short enough that a real move is on the board by the end of the week.
insert into public.app_settings (key, value)
values ('shifts.auto_switch_after_days', '3'::jsonb)
on conflict (key) do nothing;

-- >>> 20260919092000_withdraw_and_undo_decisions.sql
-- ============================================================================
-- Withdrawing a request, and taking a decision back within the hour.
--
-- Two things were missing from the approvals screen.
--
-- Withdrawing never worked for most of the people who could press it. The
-- only UPDATE policy on change_requests was the approvers' own, so a manager
-- withdrawing their request updated nothing and was told it "is not yours, or
-- is already decided". The requester gets their own policy here — narrow on
-- purpose, see the guard below.
--
-- A decision could not be taken back. An approval pressed on the wrong row
-- stood, and the only way out was to ask for the opposite change and approve
-- that too. Now the person who decided has an hour: an approval is reversed by
-- writing back what the row held before it (`previous_values`, captured at the
-- moment of approving), a rejection simply returns to the queue, and a
-- withdrawn request can be restored by whoever withdrew it. After an hour the
-- decision is part of the record — payroll may already have read it.
-- ============================================================================

alter table public.change_requests
  add column if not exists previous_values jsonb,
  add column if not exists created_row boolean not null default false,
  add column if not exists undone_at timestamptz,
  add column if not exists undone_by uuid references public.profiles (id) on delete set null;

comment on column public.change_requests.previous_values is
  'What the target row held for the changed columns just before approval. Written back if the approval is undone.';
comment on column public.change_requests.created_row is
  'The approval created the row rather than changing one, so undoing it deletes the row.';

drop policy if exists change_requests_withdraw on public.change_requests;
create policy change_requests_withdraw on public.change_requests
  for update to authenticated
  using (requested_by = auth.uid())
  with check (requested_by = auth.uid() and status in ('pending', 'cancelled'));

/**
 * What a requester who is not an approver may do to their own request.
 *
 * Exactly two things: withdraw it while it waits, and restore it within an
 * hour of withdrawing. Everything the approver reads — the payload, the title,
 * the summary — is frozen, or a request could be approved on one description
 * and apply another.
 */
create or replace function app.guard_change_request_requester()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if auth.uid() is null
     or app.can('payroll.approve', old.site_id)
     or app.can('attendance.approve', old.site_id) then
    return new;
  end if;

  if new.payload         is distinct from old.payload
     or new.entity_table is distinct from old.entity_table
     or new.entity_id    is distinct from old.entity_id
     or new.title        is distinct from old.title
     or new.summary      is distinct from old.summary
     or new.kind         is distinct from old.kind
     or new.site_id      is distinct from old.site_id
     or new.requested_by is distinct from old.requested_by
     or new.assigned_to  is distinct from old.assigned_to
     or new.decided_by   is distinct from old.decided_by
     or new.previous_values is distinct from old.previous_values
     or new.created_row  is distinct from old.created_row then
    raise exception 'Only an approver can change what a request says'
      using errcode = '42501';
  end if;

  if not (
       (old.status = 'pending' and new.status = 'cancelled')
    or (old.status = 'cancelled' and new.status = 'pending'
        and old.decided_at > now() - interval '1 hour')
  ) then
    raise exception 'A request can be withdrawn while it waits, and restored within an hour'
      using errcode = '42501';
  end if;

  return new;
end;
$$;

drop trigger if exists change_requests_guard_requester on public.change_requests;
create trigger change_requests_guard_requester
  before update on public.change_requests
  for each row execute function app.guard_change_request_requester();

-- >>> 20260919093000_working_days_by_department_and_person.sql
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

-- >>> 20260919094000_canteen_meal_price.sql
-- ============================================================================
-- What a meal costs, and what the canteen has served in rupees.
--
-- The register already says who ate and when. The office also needs what that
-- came to: one price per meal, set on the canteen settings screen, and a total
-- for any stretch of days.
--
-- The price is stamped onto each serving as it is recorded. A register priced
-- at today's rate would restate last month's canteen bill every time the price
-- moved; a serving priced when it was handed over never changes. Servings from
-- before a price was set carry none, and the history screen prices those at the
-- current rate and says so.
-- ============================================================================

alter table public.meal_claims
  add column if not exists price_pkr numeric(10, 2)
    check (price_pkr is null or price_pkr >= 0);

comment on column public.meal_claims.price_pkr is
  'Rupees for this serving, from canteen.meal_price_pkr at the moment it was served. Null when no price was set yet.';

insert into public.app_settings (key, value)
values ('canteen.meal_price_pkr', 'null'::jsonb)
on conflict (key) do nothing;

create or replace function app.stamp_meal_price()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if new.price_pkr is null then
    select case when jsonb_typeof(s.value) = 'number' then (s.value #>> '{}')::numeric end
      into new.price_pkr
      from public.app_settings s
     where s.key = 'canteen.meal_price_pkr';
  end if;
  return new;
end;
$$;

drop trigger if exists meal_claims_stamp_price on public.meal_claims;
create trigger meal_claims_stamp_price
  before insert on public.meal_claims
  for each row execute function app.stamp_meal_price();

-- Setting the price belongs to whoever runs the canteen, not to whoever holds
-- every other company setting.
drop policy if exists app_settings_canteen_price on public.app_settings;
create policy app_settings_canteen_price on public.app_settings
  for all to authenticated
  using (key = 'canteen.meal_price_pkr' and app.can('canteen.manage'))
  with check (key = 'canteen.meal_price_pkr' and app.can('canteen.manage'));

-- >>> 20260919095000_salary_ledger_and_loans.sql
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

-- >>> 20260919096000_salaries_from_workers_list.sql
-- ============================================================================
-- Salaries, matched to the office's WORKERS LIST (August 2026).
--
-- Generated from the workbook — 392 people with a salary filled in,
-- Rs 16,684,522 a month between them. Each row names the
-- employee code AND the name, and a profile is only changed when both match:
-- the codes RD-2000 to RD-2398 were issued in sheet order, and a
-- code that has since been given to somebody else must not have a stranger's
-- salary written onto it. A row that matches nobody changes nothing.
--
-- S RATE is the monthly salary — the figure the daily rate is derived from
-- (salary / days in the month), not what anybody takes home. The designation is
-- refreshed from the sheet at the same time, except where the sheet leaves it
-- blank.
--
-- Re-running is harmless: rows already at the sheet's figure are skipped.
-- ============================================================================

with sheet (employee_code, full_name, monthly_salary, designation) as (
  values
  ('RD-2000', 'ISMAIL KHAN', 46585, 'S Sup.'),
  ('RD-2001', 'MUSHTAQ', 44000, 'Gate Sup.'),
  ('RD-2002', 'EHSAN ULLAH', 40000, 'Gate Sup.'),
  ('RD-2003', 'MUHAMMAD KHALIL', 40000, 'G S 54'),
  ('RD-2004', 'FAREED BUX', 30000, 'S/G'),
  ('RD-2005', 'SHAHID HUSSAIN', 54450, 'Admin'),
  ('RD-2006', 'IQBAL ANWAR', 36000, 'BARKI'),
  ('RD-2007', 'MALIK ZAMAN', 39060, 'Stor keper'),
  ('RD-2008', 'AHMED KHAN', 53260, 'Lab.Asst.'),
  ('RD-2009', 'M NADEEM', 33000, 'Driver'),
  ('RD-2010', 'KHURAM', 32200, 'Coal Mun.'),
  ('RD-2011', 'MAJID SHAH', 37200, 'Cook'),
  ('RD-2012', 'SHEHRAZ', 33000, 'Office Boy'),
  ('RD-2013', 'IMAM MASJID', 24200, 'MASJID'),
  ('RD-2014', 'MAQBOOL', 16000, 'S/MAN'),
  ('RD-2015', 'TARIQ SAEED', 110000, 'Manager'),
  ('RD-2016', 'TARIQ JAMIL', 97829, 'Accountant'),
  ('RD-2017', 'M AZAM', 102850, 'Purchser'),
  ('RD-2018', 'KASHIF JAVAID', 110000, 'Manager'),
  ('RD-2019', 'RANA TAJAMAL', 45250, 'Accountant'),
  ('RD-2020', 'IRFAN AKHTER', 59230, 'Accountant'),
  ('RD-2021', 'AHMED RAZA', 57640, 'Accountant'),
  ('RD-2022', 'WAQAS', 50000, 'Accountant'),
  ('RD-2023', 'TOQEER', 28000, 'Asist.'),
  ('RD-2024', 'ASIF', 25000, 'SOFT WEAR'),
  ('RD-2025', 'SAJID ALI', 73200, 'Incharge'),
  ('RD-2026', 'NISAR', 61360, 'Asist.'),
  ('RD-2027', 'RIAZ', 38650, 'S/Man'),
  ('RD-2028', 'SAJJAD', 38650, 'S/Man'),
  ('RD-2029', 'FAISAL', 29700, 'Mark Man'),
  ('RD-2030', 'IJAZ', 25000, 'P/Man'),
  ('RD-2031', 'RASHID', 25000, 'P/Man'),
  ('RD-2032', 'FAROOQ', 35430, 'Gazanaman'),
  ('RD-2033', 'KAMIL', 50000, 'Munshi'),
  ('RD-2034', 'NAVEED', 35000, 'Asist.'),
  ('RD-2035', 'TAHIR', 31180, 'Loader'),
  ('RD-2036', 'SHAFAT ULLAH', 43560, 'Munshi'),
  ('RD-2037', 'ISHTIAQ', 31180, 'Loader'),
  ('RD-2038', 'JAMIL', 33300, 'Loader'),
  ('RD-2039', 'ISHAQ', 31180, 'Loader'),
  ('RD-2040', 'ALLAH WASYA', 33480, 'Asist.'),
  ('RD-2041', 'ABID SULTAN', 75000, 'Munshi'),
  ('RD-2042', 'VISHAL', 35000, 'Asist.'),
  ('RD-2043', 'UMAIR', 35000, 'Asist.'),
  ('RD-2044', 'NASEER HUSSAIN', 28000, 'Loader'),
  ('RD-2045', 'SHAHKIL', 100000, 'Incharge'),
  ('RD-2046', 'SHEHZAD AHMED', 81830, 'G Opt.'),
  ('RD-2047', 'NAVEED AHMED', 43000, 'Asist.'),
  ('RD-2048', 'TAYYAB', 41740, 'Electrition'),
  ('RD-2049', 'SADAAM', 41140, 'Electrition'),
  ('RD-2050', 'HASSAN', 37020, 'Electrition'),
  ('RD-2051', 'ABUBAKAR', 36850, 'Electrition'),
  ('RD-2052', 'SHAHBAZ', 41740, 'Motor Vinder'),
  ('RD-2053', 'ARSLAN', 30000, 'Helper'),
  ('RD-2054', 'SALAMAT', 100000, 'Incharge'),
  ('RD-2055', 'SAJID', 44720, 'Welder'),
  ('RD-2056', 'IRFAN', 42780, 'Fitter'),
  ('RD-2057', 'KASHIF', 42780, 'Fitter'),
  ('RD-2058', 'KARAMAT ALI', 42780, 'Fitter'),
  ('RD-2059', 'MUZAMIL', 42780, 'Fitter'),
  ('RD-2060', 'H SHAN ALI', 44720, 'Fitter'),
  ('RD-2061', 'SHEHBAZ HAIDER', 42780, 'Fitter'),
  ('RD-2062', 'AZAM', 43560, 'Turner'),
  ('RD-2063', 'M MANSOOR ALAM', 291500, 'Incharge'),
  ('RD-2064', 'MOHSIN HAMEED', 104500, 'Asist.'),
  ('RD-2065', 'SHAHBIR HUSSAIN', 80000, 'Production'),
  ('RD-2066', 'AHAD', 65000, 'Production'),
  ('RD-2067', 'GHULAM FAREED', 90000, 'Tracer'),
  ('RD-2068', 'HUSSAN ALI', 80000, 'Tracer'),
  ('RD-2069', 'FAHAD SAMEER', 70000, 'Tracer'),
  ('RD-2070', 'SUBHAN', 80000, 'Tracer'),
  ('RD-2071', 'UMER NADEEM', 40000, 'Tracer'),
  ('RD-2072', 'IRAJ', 75000, 'Designer'),
  ('RD-2073', 'MARIUM SHOUKAT', 80000, 'Designer'),
  ('RD-2074', 'IRSA', 95000, 'Designer'),
  ('RD-2075', 'ASAD', 90000, 'Designer'),
  ('RD-2076', 'VAJIHA', 65000, 'Designer'),
  ('RD-2077', 'ADEEL MAJEED', 80000, 'Designer'),
  ('RD-2078', 'UMER MANSAB', 45000, 'Designer'),
  ('RD-2079', 'ASIM ALI', 70000, 'Designer'),
  ('RD-2080', 'NOOR ZAINAB', 65000, 'Designer'),
  ('RD-2081', 'USMAN FAROOQ', 27500, 'IT'),
  ('RD-2082', 'JAVAID', 205700, 'B/M'),
  ('RD-2083', 'M RAFIQUE', 66000, 'SUPERVISOR'),
  ('RD-2084', 'AHMET ZUBAIR', 66000, 'SUPERVISOR'),
  ('RD-2085', 'NASEER AHMED', 42350, 'K/MAN'),
  ('RD-2086', 'SOHAIL SADIQ', 42350, 'K/MAN'),
  ('RD-2087', 'SULIMAN', 32670, 'M MAN'),
  ('RD-2088', 'BABAR ALI', 32670, 'M MAN'),
  ('RD-2089', 'IMRAN', 32670, 'M MAN'),
  ('RD-2090', 'SALMAN ALI', 32670, 'M MAN'),
  ('RD-2091', 'M ZAHOOR', 30250, 'LOADER'),
  ('RD-2092', 'ZEESHAN', 30250, 'LOADER'),
  ('RD-2093', 'ALI MURAD', 30250, 'LOADER'),
  ('RD-2094', 'ABDULLAH', 30250, 'LOADER'),
  ('RD-2095', 'SANA ULLAH', 30250, 'LOADER'),
  ('RD-2096', 'M DAWOOD', 30250, 'LOADER'),
  ('RD-2097', 'ABDUL SAMAD', 30250, 'LOADER'),
  ('RD-2098', 'M IQBAL', 25000, 'HELPER'),
  ('RD-2099', 'WAJID HUSSAIN', 25000, 'HELPER'),
  ('RD-2100', 'REHMAT ULLAH', 25000, 'HELPER'),
  ('RD-2101', 'SHAH ZAIB', 25000, 'HELPER'),
  ('RD-2102', 'SAIF ULLAH', 25000, 'HELPER'),
  ('RD-2103', 'MUZAFAR ALI', 42000, 'OPT.'),
  ('RD-2104', 'RASHID', 42000, 'OPT.'),
  ('RD-2105', 'M ISMAIL', 25000, 'HELPER'),
  ('RD-2106', 'IKRAM', 25000, 'HELPER'),
  ('RD-2107', 'ALLAH DITTA', 25000, 'HELPER'),
  ('RD-2108', 'NASIR', 25000, 'HELPER'),
  ('RD-2109', 'AMEEN BASHIR', 25000, 'HELPER'),
  ('RD-2110', 'BILAL NAZEER', 31270, 'OPERATOR'),
  ('RD-2111', 'ABDUR REHMAN', 31270, 'OPERATOR'),
  ('RD-2112', 'JAMSHAID', 31270, 'OPERATOR'),
  ('RD-2113', 'NADEEM', 38500, 'S/MAN'),
  ('RD-2114', 'AMJAD', 25000, 'HELPER'),
  ('RD-2115', 'SHAHKIL', 25000, 'HELPER'),
  ('RD-2116', 'ASHRAF', 25000, 'HELPER'),
  ('RD-2117', 'ZAHOOR', 25000, 'HELPER'),
  ('RD-2118', 'SOHAIL', 25000, 'HELPER'),
  ('RD-2119', 'JAMIL', 25000, 'HELPER'),
  ('RD-2120', 'ZAIN', 25000, 'HELPER'),
  ('RD-2121', 'MUJAHID', 25000, 'HELPER'),
  ('RD-2122', 'KAIR ULLAH', 25000, 'HELPER'),
  ('RD-2123', 'QAMAR ZAMAN', 25000, 'HELPER'),
  ('RD-2124', 'WASEEM SAJJAD', 25000, 'HELPER'),
  ('RD-2125', 'ABDULLAH', 25000, 'HELPER'),
  ('RD-2126', 'M QAISER', 110000, 'H OPT'),
  ('RD-2127', 'ALI SHAHN', 55000, 'OPT.'),
  ('RD-2128', 'SOJAN', 46160, 'OPT.'),
  ('RD-2129', 'HUAZIFA', 41970, 'OPT.'),
  ('RD-2130', 'AMIR', 25620, 'F MAN'),
  ('RD-2131', 'HUZAIFA', 25000, 'HELPER'),
  ('RD-2132', 'MUZAMIL', 25000, 'HELPER'),
  ('RD-2133', 'SHOAIB', 25000, 'HELPER'),
  ('RD-2134', 'ABDUL SABOOR', 25000, 'HELPER'),
  ('RD-2135', 'ABDUL BASEER', 25000, 'HELPER'),
  ('RD-2136', 'WAZEER', 25000, 'HELPER'),
  ('RD-2137', 'SANA ULLAH', 25000, 'HELPER'),
  ('RD-2138', 'RAMZAN', 25000, 'HELPER'),
  ('RD-2140', 'TAQIQ MEHMOOD', 106480, 'H OPT'),
  ('RD-2141', 'RIZWAN', 58560, 'OPT'),
  ('RD-2142', 'SARFRAZ', 53240, 'OPT'),
  ('RD-2143', 'MUSHTAQ AHMED', 43920, 'ASIST'),
  ('RD-2144', 'ASAD FIRDOOS', 39930, 'ASIST'),
  ('RD-2145', 'GHULAM MURTAZA', 35140, 'CHECKER'),
  ('RD-2146', 'SHAHKIL AHMED', 35140, 'CHECKER'),
  ('RD-2147', 'ALI AKBAR', 25500, 'PUMP MAN'),
  ('RD-2148', 'AMIR', 25500, 'PUMP MAN'),
  ('RD-2149', 'ALI RAZA', 25000, 'HELPER'),
  ('RD-2150', 'KHURAM', 25000, 'HELPER'),
  ('RD-2151', 'SHOAIB', 25000, 'HELPER'),
  ('RD-2152', 'IMRAN', 107900, 'DESIGNER'),
  ('RD-2153', 'GHULAM RASOOL', 42350, 'EXPOSER'),
  ('RD-2154', 'MUZAMIL', 38000, 'EXPOSER'),
  ('RD-2155', 'ALLAH RAKHA', 29700, 'ASIST'),
  ('RD-2156', 'HUSNAIN', 29700, 'ASIST'),
  ('RD-2157', 'BILAL', 25000, 'HELPER'),
  ('RD-2158', 'MEHBOOB ALAM', 126500, 'MASTER'),
  ('RD-2159', 'ABDUL JABBAR', 66550, 'APM'),
  ('RD-2160', 'IZHAR UL HAQ', 66550, 'APM'),
  ('RD-2161', 'RIAZ', 44770, 'C MAN'),
  ('RD-2162', 'JAN ALAM', 44770, 'C MAN'),
  ('RD-2163', 'TAHIR', 30250, 'ACM'),
  ('RD-2164', 'JAN ALI', 30250, 'MANDI MAN'),
  ('RD-2165', 'M ASAD', 25000, 'HELPER'),
  ('RD-2166', 'ABDUL GHAFFAR', 242000, 'F MASTER'),
  ('RD-2167', 'ABID', 84700, 'SUPERVISOR'),
  ('RD-2168', 'LIAQAT', 67650, 'H OPT.'),
  ('RD-2169', 'ABDUL MAJEED', 55900, 'H OPT.'),
  ('RD-2170', 'NAVEED', 33000, 'OPT.'),
  ('RD-2171', 'GHULAM ALI', 30690, 'H MAN'),
  ('RD-2172', 'AHAD', 30700, 'H MAN'),
  ('RD-2173', 'MANSAB', 30690, 'F MAN'),
  ('RD-2174', 'SALEEM', 30690, 'F MAN'),
  ('RD-2175', 'AMIR', 30690, 'S/M'),
  ('RD-2176', 'KASHIF', 30690, 'S/M'),
  ('RD-2177', 'ADNAN', 25000, 'HELPER'),
  ('RD-2178', 'JALIL AHMED', 25000, 'HELPER'),
  ('RD-2179', 'IMTIAZ', 25000, 'HELPER'),
  ('RD-2180', 'IRFAN', 25000, 'HELPER'),
  ('RD-2181', 'SAJID', 38500, 'MANDI MAN'),
  ('RD-2182', 'JAVAID BASHIR', 35000, 'MANDI MAN'),
  ('RD-2183', 'ABID', 25000, 'HELPER'),
  ('RD-2184', 'SABAR REHMAN', 25000, 'HELPER'),
  ('RD-2185', 'HASSAN RAZA', 37200, 'OPERATOR'),
  ('RD-2186', 'TAYYAB', 37200, 'OPERATOR'),
  ('RD-2187', 'GHULAM HUSSAIN', 30690, 'H MAN'),
  ('RD-2188', 'SAFEEL', 30690, 'H MAN'),
  ('RD-2189', 'UMEED ALI', 30690, 'F MAN'),
  ('RD-2190', 'SADAM', 30690, 'F MAN'),
  ('RD-2191', 'ZAHID', 30690, 'F MAN'),
  ('RD-2192', 'ARIF', 30690, 'F MAN'),
  ('RD-2193', 'IKHTYAR', 30690, 'S MAN'),
  ('RD-2194', 'HANEEF', 25000, 'HELPER'),
  ('RD-2195', 'JAVAID', 25000, 'HELPER'),
  ('RD-2196', 'FIYAZ', 25000, 'HELPER'),
  ('RD-2197', 'ARBAZ', 25000, 'HELPER'),
  ('RD-2198', 'FIYAZ', 25000, 'HELPER'),
  ('RD-2199', 'ALI GULL', 30280, 'MANDI MAN'),
  ('RD-2200', 'ADIL MAQBOOL', 25000, 'H MANDI'),
  ('RD-2201', 'CHAMAN', 25000, 'H MANDI'),
  ('RD-2202', 'SHAHBIR', 40590, 'OPERATOR'),
  ('RD-2203', 'BARKAT', 36900, 'OPERATOR'),
  ('RD-2204', 'ADIL', 33480, 'H MAN'),
  ('RD-2205', 'ABDUL NABI', 30400, 'H MAN'),
  ('RD-2206', 'MUZAMIL', 30400, 'F MAN'),
  ('RD-2207', 'JAVAID', 30400, 'F MAN'),
  ('RD-2208', 'UMER FAROOQ', 30400, 'F MAN'),
  ('RD-2209', 'MUZAFAR', 33000, 'S MAN'),
  ('RD-2210', 'MAQSOOD', 33000, 'S MAN'),
  ('RD-2211', 'SALAMAT', 27000, 'HELPER'),
  ('RD-2212', 'BASHIR AHMED', 27000, 'HELPER'),
  ('RD-2213', 'ABDUR RAHMEEM', 27000, 'HELPER'),
  ('RD-2214', 'ISHAQ', 27000, 'HELPER'),
  ('RD-2215', 'QAMAR ULLAH', 27000, 'HELPER'),
  ('RD-2216', 'HIZBULLHA', 27000, 'HELPER'),
  ('RD-2217', 'MUNIR AHMED', 27000, 'HELPER'),
  ('RD-2218', 'GULL AMEEN', 27000, 'HELPER'),
  ('RD-2219', 'ZAHID', 39860, 'MANDI MAN'),
  ('RD-2220', 'ISHFAQ', 39860, 'MANDI MAN'),
  ('RD-2221', 'MOHSIN', 78650, 'H OPT.'),
  ('RD-2222', 'AHSEN', 42350, 'OPERATOR'),
  ('RD-2223', 'AHMED BAX', 37200, 'OPERATOR'),
  ('RD-2224', 'SAEED NASEER', 37200, 'OPERATOR'),
  ('RD-2225', 'HUSNAIN', 37200, 'OPERATOR'),
  ('RD-2226', 'IBRAR', 26125, 'ASIST.'),
  ('RD-2227', 'MALIK MEHMOOD', 26125, 'ASIST.'),
  ('RD-2228', 'UBAID UR REHMAN', 26125, 'S/MAM'),
  ('RD-2229', 'YOUNAS', 25000, 'HELPER'),
  ('RD-2230', 'NAVEED', 25000, 'HELPER'),
  ('RD-2231', 'TAYAB', 25000, 'HELPER'),
  ('RD-2232', 'RAMZAN', 25000, 'HELPER'),
  ('RD-2233', 'AMIR', 25000, 'HELPER'),
  ('RD-2234', 'SADAM', 25000, 'HELPER'),
  ('RD-2235', 'IYAZ ALI', 25000, 'HELPER'),
  ('RD-2236', 'HAMMAD', 25000, 'HELPER'),
  ('RD-2237', 'FIDA HUSSAIN', 25000, 'HELPER'),
  ('RD-2238', 'ABID HUSSAIN', 52810, 'H OPT.'),
  ('RD-2239', 'SAIF ULLAH', 46760, 'OPERATOR'),
  ('RD-2240', 'USMAN', 42460, 'OPERATOR'),
  ('RD-2241', 'MOHSIN ALI', 38600, 'OPERATOR'),
  ('RD-2242', 'BILAL', 26800, 'F MAN'),
  ('RD-2243', 'SUNNY WAQAR', 26800, 'F MAN'),
  ('RD-2244', 'SHAKEEB', 26800, 'F MAN'),
  ('RD-2245', 'GHULAM MUSTAFA', 26800, 'F MAN'),
  ('RD-2246', 'YOUSAF', 26800, 'S MAN'),
  ('RD-2247', 'AMEEN', 29480, 'S MAN'),
  ('RD-2248', 'AMEEN BASHIR', 26800, 'S MAN'),
  ('RD-2249', 'FAIZAN SALAMAT', 25000, 'HELPER'),
  ('RD-2250', 'HAMID KHAN', 25000, 'HELPER'),
  ('RD-2251', 'DANISH', 25000, 'HELPER'),
  ('RD-2252', 'REHAN', 25000, 'HELPER'),
  ('RD-2253', 'ZAKIR', 25000, 'HELPER'),
  ('RD-2254', 'ASIF', 25000, 'HELPER'),
  ('RD-2255', 'AHMED', 25000, 'HELPER'),
  ('RD-2256', 'TARIQ', 46750, 'OPERATOR'),
  ('RD-2257', 'ZAHEER', 42500, 'OPERATOR'),
  ('RD-2258', 'ALI', 31460, 'ASIST'),
  ('RD-2259', 'AKBAR', 31460, 'ASIST'),
  ('RD-2260', 'NAEEM', 25000, 'HELPER'),
  ('RD-2261', 'ABDUR RAZAQ', 25000, 'HELPER'),
  ('RD-2262', 'KAFEEL KHAN', 25000, 'HELPER'),
  ('RD-2263', 'KHALID REHMAN', 25000, 'HELPER'),
  ('RD-2264', 'ASIM KHAN', 25000, 'HELPER'),
  ('RD-2265', 'ABDULLAH', 25000, 'HELPER'),
  ('RD-2266', 'MEHMOOD', 108900, 'H OPT.'),
  ('RD-2267', 'GHULAM HUSSAIN', 50600, 'OPERATOR'),
  ('RD-2268', 'AJAB KHAN', 50730, 'OPERATOR'),
  ('RD-2269', 'UMER AZAZ', 50600, 'OPERATOR'),
  ('RD-2270', 'ABU SUFFIAN', 30750, 'ASIST'),
  ('RD-2271', 'SABAR REHMAN', 30750, 'ASIST'),
  ('RD-2272', 'MAJID KHAN', 30750, 'ASIST'),
  ('RD-2273', 'RAZA ULLAH', 25150, 'S MAN'),
  ('RD-2274', 'NAEEM KHAN', 25150, 'S MAN'),
  ('RD-2275', 'GULL HAYAT', 25150, 'S MAN'),
  ('RD-2276', 'ZAIN UL ABEEDEEN', 25000, 'HELPER'),
  ('RD-2277', 'MUQADAS', 25000, 'HELPER'),
  ('RD-2278', 'ASIM KHAN', 25000, 'HELPER'),
  ('RD-2279', 'GULZAR', 25000, 'HELPER'),
  ('RD-2280', 'IRFAN', 25000, 'HELPER'),
  ('RD-2281', 'SAMI ULLAH', 25000, 'HELPER'),
  ('RD-2282', 'MUBASHIR', 25000, 'HELPER'),
  ('RD-2283', 'ISMAIL', 25000, 'HELPER'),
  ('RD-2284', 'WAQAS', 25000, 'HELPER'),
  ('RD-2285', 'SHAKIR', 25000, 'HELPER'),
  ('RD-2286', 'YOUSAF', 25000, 'HELPER'),
  ('RD-2287', 'NUMAN SHAH', 146410, 'MASTER'),
  ('RD-2288', 'QASIM', 56375, 'SUPERVISOR'),
  ('RD-2289', 'FAISAL', 56375, 'SUPERVISOR'),
  ('RD-2290', 'AHMAD SHAH', 40260, 'COLOR MAN'),
  ('RD-2291', 'ADNAN', 40260, 'COLOR MAN'),
  ('RD-2292', 'SHAHBIR AHMED', 29600, 'S/MAN'),
  ('RD-2293', 'ZOHAIB', 34400, 'OPERATOR'),
  ('RD-2294', 'IMTIAZ', 34400, 'OPERATOR'),
  ('RD-2295', 'AMIR RAZA', 31280, 'OPERATOR'),
  ('RD-2296', 'NIYAZ', 34320, 'OPERATOR'),
  ('RD-2297', 'MATLOOB', 34400, 'OPERATOR'),
  ('RD-2298', 'SHEHBAZ SHAH', 34400, 'OPERATOR'),
  ('RD-2299', 'SAMI ULLAH', 34400, 'OPERATOR'),
  ('RD-2300', 'AQEEL', 31200, 'OPERATOR'),
  ('RD-2301', 'FASHEE MADNI', 31200, 'OPERATOR'),
  ('RD-2302', 'ADBDUL RAZAQ', 31200, 'OPERATOR'),
  ('RD-2303', 'WAQAS', 31200, 'OPERATOR'),
  ('RD-2304', 'MUNAWAR', 31270, 'OPERATOR'),
  ('RD-2305', 'SULIMAN', 34408, 'OPERATOR'),
  ('RD-2306', 'SYED SHOAIB', 31270, 'OPERATOR'),
  ('RD-2307', 'QAISER', 25000, 'HELPER'),
  ('RD-2308', 'RAMZAN', 25000, 'HELPER'),
  ('RD-2309', 'MAJEED', 25000, 'HELPER'),
  ('RD-2310', 'YAQOOB', 25000, 'HELPER'),
  ('RD-2311', 'ISHAQ', 25000, 'HELPER'),
  ('RD-2312', 'UMER HAYAT', 25000, 'HELPER'),
  ('RD-2313', 'UMAIR HAYAT', 25000, 'HELPER'),
  ('RD-2314', 'SAEED AHMED', 25000, 'HELPER'),
  ('RD-2315', 'JAVAID', 25000, 'HELPER'),
  ('RD-2316', 'SHOAIB', 25000, 'HELPER'),
  ('RD-2317', 'SHEHROOZ KHAN', 60500, 'HOUSE RENT'),
  ('RD-2318', 'SHEHROOZ KHAN', 300000, 'INCHARGE'),
  ('RD-2319', 'JUNAID', 130000, 'ASIST.'),
  ('RD-2320', 'ALI RAZA', 90000, 'SHIF INCHARG'),
  ('RD-2321', 'SAEED MEHMOOD', 90000, 'SHIF INCHARG'),
  ('RD-2322', 'WASEEM SADIQ', 90000, 'SHIF INCHARG'),
  ('RD-2323', 'ALEEM ISHFAQ', 90000, 'SHIF INCHARG'),
  ('RD-2324', 'NAUMAN', 145200, 'ENG.'),
  ('RD-2325', 'M SHAHID', 90000, 'DESIGNER'),
  ('RD-2326', 'HASEEB', 90000, 'DESIGNER'),
  ('RD-2327', 'IFRAHIM', 110000, 'DESIGNER'),
  ('RD-2328', 'NAEEM LIAQAT', 60500, 'OPERATOR'),
  ('RD-2329', 'EHSAN', 60500, 'OPERATOR'),
  ('RD-2330', 'M WASEEM YASINE', 60500, 'OPERATOR'),
  ('RD-2331', 'HUNNAIN ANWER', 66000, 'OPERATOR'),
  ('RD-2332', 'M HUSSAIN', 55000, 'OPERATOR'),
  ('RD-2333', 'AHMED', 60500, 'OPERATOR'),
  ('RD-2334', 'MANZAR ABBAS', 55000, 'OPERATOR'),
  ('RD-2335', 'TAYYAB', 55000, 'OPERATOR'),
  ('RD-2336', 'SAIF ULLAH', 55000, 'OPERATOR'),
  ('RD-2337', 'AWAIS RAZA', 55000, 'OPERATOR'),
  ('RD-2338', 'HUMZA AKRAM', 55000, 'OPERATOR'),
  ('RD-2339', 'DANISH', 55000, 'OPERATOR'),
  ('RD-2340', 'AQIB', 60000, 'OPERATOR'),
  ('RD-2341', 'M ZUZBAIR', 60000, 'OPERATOR'),
  ('RD-2342', 'SAJID ALI', 60000, 'OPERATOR'),
  ('RD-2343', 'AMIR SAEED', 60000, 'OPERATOR'),
  ('RD-2344', 'AQIB', 44550, 'ASIST OPT.'),
  ('RD-2345', 'ATIF ARSHAD', 44550, 'ASIST OPT.'),
  ('RD-2346', 'REHAN', 44550, 'ASIST OPT.'),
  ('RD-2347', 'M ABU BAKAR', 40500, 'ASIST OPT.'),
  ('RD-2348', 'IMTIAZ', 40500, 'ASIST OPT.'),
  ('RD-2349', 'SHEHROZ YASINE', 40500, 'ASIST OPT.'),
  ('RD-2350', 'MATLOOB ALI', 40500, 'ASIST OPT.'),
  ('RD-2351', 'SAIF ULLAH', 40500, 'ASIST OPT.'),
  ('RD-2352', 'MUSHTAQ', 40500, 'ASIST OPT.'),
  ('RD-2353', 'SHEHBAZ', 40500, 'ASIST OPT.'),
  ('RD-2354', 'RANA PHOOL', 40500, 'ASIST OPT.'),
  ('RD-2355', 'ALI ASLAM', 40500, 'ASIST OPT.'),
  ('RD-2356', 'HUSNAIN', 40500, 'ASIST OPT.'),
  ('RD-2357', 'HASEEB ULLAH', 40500, 'ASIST OPT.'),
  ('RD-2358', 'IMTIAZ AHMED', 40500, 'ASIST OPT.'),
  ('RD-2359', 'AMJAD', 27000, 'CHECKER'),
  ('RD-2360', 'AZEEM', 27000, 'CHECKER'),
  ('RD-2361', 'ABUSUFIAN', 27000, 'CHECKER'),
  ('RD-2362', 'GHULAM MUSTAFA', 27000, 'CHECKER'),
  ('RD-2363', 'UMER TARIQ', 27000, 'CHECKER'),
  ('RD-2364', 'MOHSIN ALI', 27000, 'CHECKER'),
  ('RD-2365', 'ALI HUSSAN', 27000, 'CHECKER'),
  ('RD-2366', 'HASEEB UR REHMAN', 27000, 'CHECKER'),
  ('RD-2367', 'SHAIQ', 27000, 'CHECKER'),
  ('RD-2368', 'KALEEM ULLAH', 26620, 'SWEEPER'),
  ('RD-2369', 'UZAIR AHMED', 25000, 'HELPER'),
  ('RD-2370', 'ZUBAIR RIAZ', 25000, 'HELPER'),
  ('RD-2371', 'USMAN', 25000, 'HELPER'),
  ('RD-2372', 'ARSLAN', 25000, 'HELPER'),
  ('RD-2373', 'ARYAN ALI', 25000, 'HELPER'),
  ('RD-2374', 'RAFAQAT', 25000, 'HELPER'),
  ('RD-2375', 'HUSSAN ALI', 25000, 'HELPER'),
  ('RD-2376', 'AHSEN', 25000, 'HELPER'),
  ('RD-2377', 'SAD KHAN', 25000, 'HELPER'),
  ('RD-2378', 'RANA HUSSAIN', 25000, 'HELPER'),
  ('RD-2379', 'HUMZA', 25000, 'HELPER'),
  ('RD-2380', 'ZAMEER', 25000, 'HELPER'),
  ('RD-2381', 'EHTSHAM', 25000, 'HELPER'),
  ('RD-2382', 'HUSSAN ABDULLAH', 25000, 'HELPER'),
  ('RD-2383', 'ASAD PERWAIZ', 25000, 'HELPER'),
  ('RD-2384', 'M NAVEED', 25000, 'HELPER'),
  ('RD-2385', 'AZHAR HAYYAT', 25000, 'HELPER'),
  ('RD-2386', 'M JAVEED', 25000, 'HELPER'),
  ('RD-2387', 'ZAHID', 90705, 'PPC.'),
  ('RD-2388', 'DANIYAL', 37000, 'ASIST. PPC'),
  ('RD-2395', 'SAJIN', 27500, 'INCHARG'),
  ('RD-2396', 'ASIF', 27500, 'HELPER'),
  ('RD-2397', 'SARWAR', 27500, 'HELPER'),
  ('RD-2398', 'ALI RAZA', 27500, 'HELPER')
)
update public.profiles p
   set monthly_salary = s.monthly_salary,
       designation    = coalesce(s.designation, p.designation)
  from sheet s
 where p.employee_code = s.employee_code
   and upper(regexp_replace(trim(p.full_name), 's+', ' ', 'g')) = upper(s.full_name)
   and (
     p.monthly_salary is distinct from s.monthly_salary
     or (s.designation is not null and p.designation is distinct from s.designation)
   );
