-- ============================================================================
-- PENDING MIGRATIONS — paste this whole file into the Supabase SQL editor.
--
--   Supabase dashboard -> SQL Editor -> New query -> paste -> Run
--
-- Why this file exists: four migrations in supabase/migrations/ have never
-- been applied to the live database. That is what makes the language toggle
-- fail with
--
--   Could not find the 'language' column of 'profiles' in the schema cache
--
-- and it is also why the check-in/check-out gate, the amount-actually-paid
-- field and the Claude spend screen have nothing to write to.
--
-- It is the exact content of these four files, in order, made re-runnable:
--
--   20260904090400_attendance_approval.sql
--   20260906090000_profile_language.sql
--   20260908090000_calendar_manage_for_managers.sql
--   20260908100000_checkout_devices_paid_amounts_and_settings.sql
--
-- The first of those is why the Attendance Log currently fails outright with
-- "column attendance_days.approved_by does not exist" — found by walking the
-- app with a temporary account rather than by reading the code.
--
-- Every statement is guarded, so running it twice is harmless and running it
-- on a database that already has some of this is harmless too. Once it has
-- run, `supabase db push` stays the way to apply future migrations — this is
-- a catch-up, not a replacement for that.
-- ============================================================================

begin;

-- ---------------------------------------------------------------------------
-- 1. Signing off a stretch of attendance
--
-- `locked` already stops a correction being overwritten by the next terminal
-- sync. What was missing is who accepted it and when — which is exactly the
-- question asked when a payslip is disputed. Without these two columns the
-- Attendance Log does not render at all.
-- ---------------------------------------------------------------------------

alter table public.attendance_days
  add column if not exists approved_by uuid references public.profiles (id) on delete set null,
  add column if not exists approved_at timestamptz;

comment on column public.attendance_days.approved_by is
  'The manager who signed this day off. Set together with locked, which is what actually stops recomputation replacing it.';

create index if not exists attendance_days_approved_at_idx
  on public.attendance_days (approved_at) where approved_at is not null;

-- A manager may write the days of the people who report to them. app.manages()
-- already exists for exactly this; the `.all` variant carries anyone
-- company-wide.
drop policy if exists attendance_approve on public.attendance_days;
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

-- ---------------------------------------------------------------------------
-- 2. Each person reads the app in their own language
--
-- On profiles rather than in a cookie alone: the preference should follow the
-- person to whatever phone or terminal they sign in on.
-- ---------------------------------------------------------------------------

alter table public.profiles
  add column if not exists language text not null default 'en';

do $$
begin
  if not exists (
    select 1 from pg_constraint
     where conrelid = 'public.profiles'::regclass
       and conname = 'profiles_language_check'
  ) then
    alter table public.profiles
      add constraint profiles_language_check
      check (language in ('en', 'ur', 'roman-ur'));
  end if;
end $$;

comment on column public.profiles.language is
  'Interface language. Codes match the Ask assistant''s. Defaults to English.';

-- The session loader reads the whole profile in one call. Replaced in full
-- because `create or replace` rewrites the body — only `language` is new.
create or replace function public.session_bootstrap()
returns jsonb
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select jsonb_build_object(
    'profile', (
      select to_jsonb(p)
        from (
          select id, employee_code, full_name, email, photo_url, designation,
                 site_id, department_id, pay_class, requires_attendance,
                 language, roles_changed_at
            from public.profiles
           where id = auth.uid()
        ) p
    ),
    'roles', coalesce(
      (select jsonb_agg(to_jsonb(r) order by r.rank) from public.my_roles() r),
      '[]'::jsonb
    ),
    'permissions', coalesce(
      (select jsonb_agg(k) from public.my_permissions() k),
      '[]'::jsonb
    )
  )
  where auth.uid() is not null;
$$;

-- ---------------------------------------------------------------------------
-- 3. A department manager may change the working calendar
--
-- "We are working this Sunday" is decided on the floor, usually the day
-- before, by whoever runs the shift.
-- ---------------------------------------------------------------------------

insert into public.role_permissions (role_id, permission_id)
select r.id, p.id
  from public.roles r
  join public.permissions p on p.key = 'calendar.manage'
 where r.key = 'manager'
on conflict do nothing;

-- ---------------------------------------------------------------------------
-- 4. Check-out gates, what was actually paid, settings, and Claude usage
-- ---------------------------------------------------------------------------

do $$
begin
  if not exists (select 1 from pg_type where typname = 'device_direction') then
    create type public.device_direction as enum ('auto', 'in', 'out');
  end if;
end $$;

alter table public.devices
  add column if not exists direction public.device_direction not null default 'auto';

comment on column public.devices.direction is
  'What a punch from this terminal means. auto = infer from the order of the day''s punches; in = always a check-in; out = always a check-out.';

alter table public.payroll_items
  add column if not exists paid_amount numeric(14, 2),
  add column if not exists paid_note   text;

do $$
begin
  if not exists (
    select 1 from pg_constraint
     where conrelid = 'public.payroll_items'::regclass
       and conname = 'payroll_items_paid_amount_check'
  ) then
    alter table public.payroll_items
      add constraint payroll_items_paid_amount_check
      check (paid_amount is null or paid_amount >= 0);
  end if;

  -- Generated, so `paid_amount` and the difference can never drift apart.
  if not exists (
    select 1 from information_schema.columns
     where table_schema = 'public'
       and table_name = 'payroll_items'
       and column_name = 'paid_difference'
  ) then
    alter table public.payroll_items
      add column paid_difference numeric(14, 2)
        generated always as (case when paid_amount is null then null else paid_amount - net end)
        stored;
  end if;
end $$;

comment on column public.payroll_items.paid_amount is
  'What was actually handed over, when it differs from net. Null until paid.';
comment on column public.payroll_items.paid_difference is
  'paid_amount - net. Positive means overpaid, negative means short.';

-- Company-wide settings the office changes: the rupee rate moves weekly, and
-- a redeploy is not an acceptable way to change one.
create table if not exists public.app_settings (
  key         text primary key,
  value       jsonb not null,
  updated_by  uuid references public.profiles (id) on delete set null,
  updated_at  timestamptz not null default now()
);

alter table public.app_settings enable row level security;

drop policy if exists app_settings_read on public.app_settings;
create policy app_settings_read on public.app_settings
  for select to authenticated using (true);

drop policy if exists app_settings_write on public.app_settings;
create policy app_settings_write on public.app_settings
  for all to authenticated
  using (app.can('settings.manage')) with check (app.can('settings.manage'));

drop trigger if exists app_settings_touch on public.app_settings;
create trigger app_settings_touch
  before update on public.app_settings
  for each row execute function app.touch_updated_at();

insert into public.app_settings (key, value) values
  ('usd_to_pkr',  '285'::jsonb),
  ('tax_percent', '0'::jsonb)
on conflict (key) do nothing;

-- Every Claude call this app makes, so a bill can be checked rather than
-- believed, and the cost attributed to a person and a screen.
create table if not exists public.assistant_usage (
  id              bigserial primary key,
  profile_id      uuid references public.profiles (id) on delete set null,
  surface         text,
  model           text not null,
  input_tokens    integer not null default 0,
  output_tokens   integer not null default 0,
  cache_read      integer not null default 0,
  cache_write     integer not null default 0,
  cost_usd        numeric(12, 6) not null default 0,
  asked_at        timestamptz not null default now()
);

create index if not exists assistant_usage_asked_at_idx
  on public.assistant_usage (asked_at desc);
create index if not exists assistant_usage_profile_idx
  on public.assistant_usage (profile_id, asked_at desc);

alter table public.assistant_usage enable row level security;

drop policy if exists assistant_usage_read on public.assistant_usage;
create policy assistant_usage_read on public.assistant_usage
  for select to authenticated using (app.can('settings.manage'));

drop policy if exists assistant_usage_insert on public.assistant_usage;
create policy assistant_usage_insert on public.assistant_usage
  for insert to authenticated with check (profile_id = auth.uid());

commit;

-- PostgREST caches the schema. Without this the app keeps reporting
-- "Could not find the 'language' column" for up to a minute after the columns
-- exist, which reads exactly like the migration having failed.
notify pgrst, 'reload schema';
