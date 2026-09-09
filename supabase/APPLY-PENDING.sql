-- ============================================================================
-- PENDING MIGRATIONS — paste this whole file into the Supabase SQL editor.
--
--   Supabase dashboard -> SQL Editor -> New query -> paste -> Run
--
-- Why this file exists: eight migrations in supabase/migrations/ have never
-- been applied to the live database. That is what makes the language toggle
-- fail with
--
--   Could not find the 'language' column of 'profiles' in the schema cache
--
-- and it is also why the check-in/check-out gate, the amount-actually-paid
-- field and the Claude spend screen have nothing to write to.
--
-- It is the exact content of these eight files, in order, made re-runnable:
--
--   20260904090400_attendance_approval.sql
--   20260906090000_profile_language.sql
--   20260908090000_calendar_manage_for_managers.sql
--   20260908100000_checkout_devices_paid_amounts_and_settings.sql
--   20260909090000_change_requests.sql
--   20260910090000_per_minute_lateness_and_assistant_access.sql
--   20260911090000_gate_entries.sql
--   20260912090000_gate_supervisor_role.sql
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

-- ---------------------------------------------------------------------------
-- 5. Changes that need somebody else to say yes
--
-- A request holds the change rather than applying it, so the row it targets
-- keeps its old value until a CEO approves — nothing wrong reaches a payslip
-- while it waits. Antrosys never queues: they are who fixes this workflow when
-- it goes wrong.
-- ---------------------------------------------------------------------------

do $$
begin
  if not exists (select 1 from pg_type where typname = 'change_kind') then
    create type public.change_kind as enum (
      'attendance_correction',
      'calendar_day',
      'work_week',
      'pay_change',
      'contract_amount'
    );
  end if;
end $$;

create table if not exists public.change_requests (
  id            uuid primary key default gen_random_uuid(),
  kind          public.change_kind not null,
  entity_table  text not null,
  entity_id     text,
  payload       jsonb not null,
  site_id       uuid references public.sites (id) on delete cascade,
  title         text not null,
  summary       text,
  requested_by  uuid not null references public.profiles (id) on delete cascade,
  assigned_to   uuid references public.profiles (id) on delete set null,
  status        public.request_status not null default 'pending',
  decided_by    uuid references public.profiles (id) on delete set null,
  decided_at    timestamptz,
  decision_note text,
  apply_error   text,
  created_at    timestamptz not null default now()
);

create index if not exists change_requests_status_idx
  on public.change_requests (status, assigned_to);
create index if not exists change_requests_requester_idx
  on public.change_requests (requested_by, created_at desc);
create index if not exists change_requests_kind_idx
  on public.change_requests (kind, status);

alter table public.change_requests enable row level security;

drop policy if exists change_requests_read on public.change_requests;
create policy change_requests_read on public.change_requests
  for select to authenticated
  using (
    requested_by = auth.uid()
    or assigned_to = auth.uid()
    or app.can('payroll.approve', site_id)
    or app.can('attendance.approve', site_id)
  );

drop policy if exists change_requests_insert on public.change_requests;
create policy change_requests_insert on public.change_requests
  for insert to authenticated
  with check (requested_by = auth.uid());

drop policy if exists change_requests_decide on public.change_requests;
create policy change_requests_decide on public.change_requests
  for update to authenticated
  using (app.can('payroll.approve', site_id) or app.can('attendance.approve', site_id))
  with check (app.can('payroll.approve', site_id) or app.can('attendance.approve', site_id));

-- Antrosys is billed as a contract firm at a stated monthly amount. It was
-- sitting at zero, which the payroll run reads as "charge nothing".
update public.departments
   set contract_amount = 35000
 where name = 'Antrosys'
   and default_worker_type = 'contractor';

-- ============================================================================
-- Lateness by the minute, and the assistant behind a narrower door.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. Fifteen minutes of grace, then a minute of pay for every minute late
--
-- The tiered ladder is gone from the pay-rates screen: it asked the office to
-- describe lateness as bands of percentages of a day, which is not how anybody
-- here thinks about it and not what was wanted. The rule is one sentence —
-- arrive more than fifteen minutes after your shift starts and each minute
-- past the fifteen costs a minute of pay.
--
-- Both halves already exist and neither is new logic. `shifts.grace_minutes`
-- is what `minutesLateAgainstShift` measures from, and a `basis = 'minute'`
-- row is what `calculateLatePenalties` charges by. What was missing is that
-- the live database has no penalty row at all, so lateness has been costing
-- nothing.
-- ---------------------------------------------------------------------------

update public.shifts
   set grace_minutes = 15
 where grace_minutes <> 15;

/*
 * One open-ended band per site, charged by the minute.
 *
 * `from_minutes = 0` because the grace has already been subtracted by the time
 * a tier is chosen — `minutes_late` is minutes *past* the grace, so a band
 * starting at zero is "any lateness that survived the grace period".
 *
 * `penalty_percent = 100` is read as "one hundred percent of one minute's
 * wage"; the column is meaningless for this basis and 100 is the only value
 * that does not quietly discount the deduction.
 */
insert into public.late_penalty_rules
  (site_id, shift_id, label, from_minutes, to_minutes, penalty_percent, basis, is_active)
select s.id, null, 'Late arrival — per minute', 0, null, 100, 'minute', true
  from public.sites s
 where not exists (
   select 1
     from public.late_penalty_rules r
    where r.site_id = s.id
      and r.basis = 'minute'
      and r.is_active
 );

-- Percentage bands, if any were ever created, are switched off rather than
-- deleted: they are history that a past payroll run was priced against, and
-- `findTier` picks the narrowest *active* match, so an inactive row cannot
-- compete with the per-minute one.
update public.late_penalty_rules
   set is_active = false
 where basis <> 'minute'
   and is_active;

-- ---------------------------------------------------------------------------
-- 2. The assistant is for the people who carry the cost of it
--
-- Every question costs real money against a monthly ceiling, and the two roles
-- that answer for that spend are the two that keep access. Operations and
-- Manager held `assistant.ask` because the assistant began as a reporting
-- convenience; it is now on every record in the app, and four hundred people
-- with an Ask button is a bill nobody agreed to.
--
-- The permission row itself stays in the catalogue, and so does the ability to
-- grant it again from the access screen — this revokes a grant, it does not
-- remove a capability.
-- ---------------------------------------------------------------------------

delete from public.role_permissions rp
 using public.roles r, public.permissions p
 where rp.role_id = r.id
   and rp.permission_id = p.id
   and p.key = 'assistant.ask'
   and r.key not in ('ceo', 'admin-antrosys');

-- Any per-person grant of it, too. An override outlives the role grant it was
-- written alongside, and would otherwise be the one door left open.
delete from public.user_permission_overrides o
 using public.permissions p
 where o.permission_id = p.id
   and p.key = 'assistant.ask'
   and o.effect = 'grant'
   and o.user_id not in (
     select ur.user_id
       from public.user_roles ur
       join public.roles r on r.id = ur.role_id
      where r.key in ('ceo', 'admin-antrosys')
   );

-- ---------------------------------------------------------------------------
-- 3. The Antrosys account sits with Antrosys
--
-- It was showing under "Unassigned" on the pay screen — a real department is
-- what stops one account appearing as an orphan beside four hundred people who
-- have one.
-- ---------------------------------------------------------------------------

update public.profiles p
   set department_id = d.id
  from public.departments d
 where d.name = 'Antrosys'
   and d.default_worker_type = 'contractor'
   and p.department_id is null
   and exists (
     select 1
       from public.user_roles ur
       join public.roles r on r.id = ur.role_id
      where ur.user_id = p.id
        and r.key in ('ceo', 'admin-antrosys')
   );

-- ============================================================================
-- The gate register.
--
-- What comes through the gate is currently written in a paper book that lives
-- at the gate: a visitor, a supplier's truck, a roll of cloth going out. The
-- book answers "who was here on Tuesday" only if somebody walks to the gate
-- and turns the pages, and it answers "did that material ever come back"
-- almost never.
--
-- The supervisor at the gate writes an entry as it happens and can correct it
-- for an hour afterwards — long enough to fix a misheard name or a plate read
-- wrong at dusk, short enough that the register cannot be rewritten later to
-- suit a story. After that it is fixed unless a director changes it, which is
-- the property that makes the register worth keeping at all.
-- ============================================================================

do $$
begin
  if not exists (select 1 from pg_type where typname = 'gate_kind') then
    create type public.gate_kind as enum ('visitor', 'vehicle', 'material', 'staff');
  end if;
  if not exists (select 1 from pg_type where typname = 'gate_direction') then
    create type public.gate_direction as enum ('in', 'out');
  end if;
end $$;

create table if not exists public.gate_entries (
  id            uuid primary key default gen_random_uuid(),
  site_id       uuid references public.sites (id) on delete cascade,

  kind          public.gate_kind not null,
  direction     public.gate_direction not null,

  /*
   * Who or what came through. One field rather than a column per kind: a name,
   * a plate and a description are the same question asked about different
   * things, and four nullable columns would leave three of them empty on every
   * row while a reader hunted for the one that was filled.
   */
  subject       text not null,
  /** Their company, or where the goods are going. */
  party         text,
  /** Who they are here to see, or what the load is for. */
  purpose       text,
  /** A plate, a CNIC, a gate pass number — whatever was checked. */
  reference     text,
  quantity      text,

  /*
   * When it happened, not when it was typed. A supervisor writing up three
   * arrivals at once must be able to say what time each of them actually was,
   * or the register describes their typing rather than the gate.
   */
  happened_at   timestamptz not null default now(),
  remarks       text,

  recorded_by   uuid not null references public.profiles (id) on delete set null,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  edited_by     uuid references public.profiles (id) on delete set null
);

create index if not exists gate_entries_happened_at_desc_idx
  on public.gate_entries (happened_at desc);
create index if not exists gate_entries_site_id_happened_at_desc_idx
  on public.gate_entries (site_id, happened_at desc);
create index if not exists gate_entries_recorded_by_created_at_desc_idx
  on public.gate_entries (recorded_by, created_at desc);

comment on table public.gate_entries is
  'The gate register. Written by the supervisor on duty, correctable by them for one hour, and thereafter only by a director.';

-- ---------------------------------------------------------------------------
-- Access
-- ---------------------------------------------------------------------------

insert into public.permissions (key, module, action, label, description) values
  ('gate.log',    'gate', 'manage', 'Write the gate register',
   'Add entries at the gate, and correct your own for an hour.'),
  ('gate.view',   'gate', 'view',   'Read the gate register',
   'See every entry, and download the register.'),
  ('gate.manage', 'gate', 'manage', 'Correct any gate entry',
   'Edit or remove an entry whoever wrote it and however long ago.')
on conflict (key) do nothing;

/*
 * Operations and Manager run the floor and the gate between them. The two
 * superuser roles hold everything implicitly, which is what gives a director
 * the unrestricted edit the one-hour rule below carves out.
 */
insert into public.role_permissions (role_id, permission_id)
select r.id, p.id
  from public.roles r
  join public.permissions p on p.key in ('gate.log', 'gate.view')
 where r.key in ('operations', 'manager')
on conflict do nothing;

-- Accounts reads the register without writing it: a delivery note and a
-- payment usually want checking against each other.
insert into public.role_permissions (role_id, permission_id)
select r.id, p.id
  from public.roles r
  join public.permissions p on p.key = 'gate.view'
 where r.key = 'accounts'
on conflict do nothing;

alter table public.gate_entries enable row level security;

-- Anybody who may read the register reads all of it. A gate log that showed
-- each supervisor only their own shift would answer none of the questions it
-- exists for.
drop policy if exists gate_entries_read on public.gate_entries;
create policy gate_entries_read on public.gate_entries
  for select to authenticated
  using (app.can('gate.view', site_id) or app.can('gate.log', site_id));

drop policy if exists gate_entries_insert on public.gate_entries;
create policy gate_entries_insert on public.gate_entries
  for insert to authenticated
  with check (app.can('gate.log', site_id) and recorded_by = auth.uid());

/*
 * The hour.
 *
 * Enforced here rather than only in the action, because this is the rule that
 * makes the register evidence rather than a draft. `gate.manage` — held by the
 * superuser roles — is the deliberate exception: somebody has to be able to
 * fix a genuine error found the next morning, and that somebody is a director
 * whose name lands in `edited_by`.
 */
drop policy if exists gate_entries_update on public.gate_entries;
create policy gate_entries_update on public.gate_entries
  for update to authenticated
  using (
    app.can('gate.manage', site_id)
    or (
      app.can('gate.log', site_id)
      and recorded_by = auth.uid()
      and created_at > now() - interval '1 hour'
    )
  )
  with check (
    app.can('gate.manage', site_id)
    or (
      app.can('gate.log', site_id)
      and recorded_by = auth.uid()
      and created_at > now() - interval '1 hour'
    )
  );

-- Removing an entry is a director's act only. A supervisor who wrote the wrong
-- thing corrects it; deleting it would leave the register with a gap and no
-- record that there ever was one.
drop policy if exists gate_entries_delete on public.gate_entries;
create policy gate_entries_delete on public.gate_entries
  for delete to authenticated
  using (app.can('gate.manage', site_id));

drop trigger if exists gate_entries_touch on public.gate_entries;
create trigger gate_entries_touch
  before update on public.gate_entries
  for each row execute function app.touch_updated_at();

-- ============================================================================
-- A role for the person who actually stands at the gate.
--
-- The register shipped with `gate.log` attached to Operations and Manager,
-- because those were the roles that existed. Neither describes the job: a gate
-- supervisor is not a floor manager, does not read attendance for a
-- department, and should not be given a role that carries all of that in order
-- to write down a truck.
--
-- So: their own role, holding the gate and nothing else beyond what any
-- employee has. Operations and Manager keep `gate.view` — they oversee the
-- gate and answer for what came through it — but stop holding `gate.log`,
-- which is now the gate supervisor's own.
-- ============================================================================

insert into public.roles (key, name, description, is_system, is_superuser, rank)
values (
  'gate-supervisor',
  'Gate Supervisor',
  'Writes the gate register, and corrects their own entries for an hour. Nothing else.',
  true,
  false,
  -- Below Canteen (45) and above Employee (50): the same shape of job, one
  -- station with one register, and `rank` only decides which role names a
  -- person when they hold several.
  46
)
on conflict (key) do update
   set name        = excluded.name,
       description = excluded.description,
       is_system   = excluded.is_system,
       rank        = excluded.rank;

/*
 * What the job needs, and no more.
 *
 * `gate.log` and `gate.view` are the register. `dashboard.employee` and
 * `leave.request` are what makes the app usable for somebody who works here —
 * without them a gate supervisor signs in to a single screen and cannot even
 * ask for a day off. Every other role on this system carries that pair for the
 * same reason.
 */
insert into public.role_permissions (role_id, permission_id)
select r.id, p.id
  from public.roles r
  join public.permissions p
    on p.key in ('gate.log', 'gate.view', 'dashboard.employee', 'leave.request')
 where r.key = 'gate-supervisor'
on conflict do nothing;

-- Overseeing the gate is reading it. Writing it is standing at it.
delete from public.role_permissions rp
 using public.roles r, public.permissions p
 where rp.role_id = r.id
   and rp.permission_id = p.id
   and p.key = 'gate.log'
   and r.key in ('operations', 'manager');

-- The landing page for a role with one screen is that screen; nothing in the
-- app needs telling, because `landingPathFor` already walks the permissions in
-- order and the gate is the only one they hold that resolves to a page.

commit;

-- PostgREST caches the schema. Without this the app keeps reporting
-- "Could not find the 'language' column" for up to a minute after the columns
-- exist, which reads exactly like the migration having failed.
notify pgrst, 'reload schema';
