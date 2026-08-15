-- ============================================================================
-- RadoFlow attendance: working calendar, biometric devices, punches,
-- computed attendance days, and leave.
--
-- Calendar rule: each site has a default weekly pattern (work_week). Any single
-- date can override it (calendar_days) — so an unforeseen shutdown makes a
-- Tuesday off, and a Saturday can be switched on as a paid working day, both
-- with an optional pay multiplier that beats the site default.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- Working calendar
-- ---------------------------------------------------------------------------

create table public.work_week (
  site_id     uuid not null references public.sites (id) on delete cascade,
  -- 0 = Sunday .. 6 = Saturday, matching JS getDay().
  weekday     smallint not null check (weekday between 0 and 6),
  is_working  boolean not null default true,
  primary key (site_id, weekday)
);

comment on table public.work_week is 'Default weekly working pattern per site. Overridden per date by calendar_days.';

create type public.day_type as enum (
  'workday',          -- normal working day
  'off',              -- non-working (weekend or declared off)
  'holiday',          -- public / declared holiday
  'weekend_working',  -- a normally-off day switched on, paid at weekend rate
  'special_working'   -- a declared-off day switched back on
);

create table public.calendar_days (
  id                uuid primary key default gen_random_uuid(),
  site_id           uuid not null references public.sites (id) on delete cascade,
  day               date not null,
  day_type          public.day_type not null,
  reason            text,
  -- Overrides the site pay rule for this date only. Null = use the rule.
  rate_multiplier   numeric(5, 2) check (rate_multiplier is null or rate_multiplier >= 0),
  created_by        uuid references public.profiles (id) on delete set null,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  unique (site_id, day)
);

create index on public.calendar_days (site_id, day);

-- Resolves the effective day type for a site and date: explicit override first,
-- otherwise the weekly pattern.
create or replace function app.resolve_day_type(p_site uuid, p_day date)
returns public.day_type
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select coalesce(
    (select cd.day_type from public.calendar_days cd
      where cd.site_id = p_site and cd.day = p_day),
    (select case when ww.is_working then 'workday'::public.day_type else 'off'::public.day_type end
       from public.work_week ww
      where ww.site_id = p_site and ww.weekday = extract(dow from p_day)::smallint),
    'workday'::public.day_type
  );
$$;

-- ---------------------------------------------------------------------------
-- Biometric devices (ZKTeco K50)
--
-- Both talk paths are modelled: 'push' is the device's ADMS/iclock mode where
-- it posts to our endpoint, 'pull' is the server opening a TCP session to the
-- device on port 4370. A site can mix both.
-- ---------------------------------------------------------------------------

create type public.device_mode as enum ('push', 'pull');
create type public.device_status as enum ('online', 'offline', 'unknown', 'disabled');

create table public.devices (
  id              uuid primary key default gen_random_uuid(),
  site_id         uuid not null references public.sites (id) on delete cascade,
  name            text not null,
  model           text not null default 'ZKTeco K50',
  serial_number   text unique,
  mode            public.device_mode not null default 'push',

  -- Used in 'pull' mode; also how the device is reached for user sync.
  ip_address      inet,
  port            integer not null default 4370 check (port between 1 and 65535),
  -- Device comm key ("COMM KEY" in the K50 menu). Never exposed to the browser.
  comm_key        text,
  timezone        text not null default 'Asia/Karachi',

  status          public.device_status not null default 'unknown',
  last_seen_at    timestamptz,
  last_error      text,
  is_active       boolean not null default true,

  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create index on public.devices (site_id);

-- The K50 stores its own small integer enroll IDs; this maps them to people.
create table public.device_enrollments (
  id              uuid primary key default gen_random_uuid(),
  device_id       uuid not null references public.devices (id) on delete cascade,
  device_user_id  text not null,
  profile_id      uuid not null references public.profiles (id) on delete cascade,
  enrolled_at     timestamptz not null default now(),
  unique (device_id, device_user_id)
);

create index on public.device_enrollments (profile_id);

-- ---------------------------------------------------------------------------
-- Raw punches
--
-- Kept immutable and append-only: attendance_days is derived from these, so a
-- rate or rounding change can always be recomputed from the source of truth.
-- ---------------------------------------------------------------------------

create type public.punch_direction as enum ('in', 'out', 'unknown');
create type public.punch_source as enum ('device', 'manual', 'import');

create table public.punches (
  id              bigserial primary key,
  device_id       uuid references public.devices (id) on delete set null,
  device_user_id  text,
  profile_id      uuid references public.profiles (id) on delete set null,
  punched_at      timestamptz not null,
  -- The site's local calendar date the punch belongs to.
  work_date       date not null,
  direction       public.punch_direction not null default 'unknown',
  verify_mode     text,
  source          public.punch_source not null default 'device',
  raw             jsonb,
  recorded_by     uuid references public.profiles (id) on delete set null,
  created_at      timestamptz not null default now()
);

-- Devices re-send their buffer after a network drop; this makes ingestion
-- idempotent so replays cannot double-count hours.
--
-- Deliberately NOT a partial index. An earlier `WHERE device_id is not null`
-- looked tighter but broke ON CONFLICT, which cannot target a partial index
-- unless the statement repeats the predicate — something PostgREST cannot
-- express. It is also redundant: unique indexes treat NULLs as distinct, so
-- manually entered punches (device_id null) never collide with each other.
create unique index punches_dedupe
  on public.punches (device_id, device_user_id, punched_at);

create index on public.punches (profile_id, work_date);
create index on public.punches (work_date);
create index on public.punches (punched_at desc);

-- ---------------------------------------------------------------------------
-- Computed attendance, one row per person per day
-- ---------------------------------------------------------------------------

create type public.attendance_status as enum (
  'present', 'absent', 'leave', 'holiday', 'off', 'partial', 'pending'
);

create table public.attendance_days (
  id              uuid primary key default gen_random_uuid(),
  profile_id      uuid not null references public.profiles (id) on delete cascade,
  site_id         uuid references public.sites (id) on delete set null,
  work_date       date not null,

  first_in        timestamptz,
  last_out        timestamptz,

  regular_hours   numeric(6, 2) not null default 0 check (regular_hours >= 0),
  ot_hours        numeric(6, 2) not null default 0 check (ot_hours >= 0),
  weekend_hours   numeric(6, 2) not null default 0 check (weekend_hours >= 0),
  holiday_hours   numeric(6, 2) not null default 0 check (holiday_hours >= 0),

  day_type        public.day_type not null default 'workday',
  status          public.attendance_status not null default 'pending',
  -- Set when a supervisor edits the derived numbers; recomputation then skips it.
  is_manual       boolean not null default false,
  locked          boolean not null default false,
  note            text,

  computed_at     timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  unique (profile_id, work_date)
);

create index on public.attendance_days (work_date);
create index on public.attendance_days (site_id, work_date);
create index on public.attendance_days (status);

-- ---------------------------------------------------------------------------
-- Leave
-- ---------------------------------------------------------------------------

create table public.leave_types (
  id            uuid primary key default gen_random_uuid(),
  site_id       uuid references public.sites (id) on delete cascade,
  code          text not null,
  name          text not null,
  is_paid       boolean not null default true,
  annual_quota  numeric(5, 1) not null default 0,
  is_active     boolean not null default true,
  created_at    timestamptz not null default now(),
  unique (site_id, code)
);

create type public.request_status as enum ('pending', 'approved', 'rejected', 'cancelled');

create table public.leave_requests (
  id            uuid primary key default gen_random_uuid(),
  profile_id    uuid not null references public.profiles (id) on delete cascade,
  leave_type_id uuid not null references public.leave_types (id) on delete restrict,
  from_date     date not null,
  to_date       date not null,
  days          numeric(5, 1) not null check (days > 0),
  reason        text,
  status        public.request_status not null default 'pending',
  decided_by    uuid references public.profiles (id) on delete set null,
  decided_at    timestamptz,
  decision_note text,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  check (to_date >= from_date)
);

create index on public.leave_requests (profile_id);
create index on public.leave_requests (status);

-- ---------------------------------------------------------------------------
-- Generic approval queue — "approvals needing sign-off" on the C-level panels.
-- ---------------------------------------------------------------------------

create table public.approvals (
  id            uuid primary key default gen_random_uuid(),
  entity_type   text not null,
  entity_id     text not null,
  site_id       uuid references public.sites (id) on delete cascade,
  title         text not null,
  summary       text,
  amount        numeric(14, 2),
  requested_by  uuid references public.profiles (id) on delete set null,
  -- Permission key the approver must hold, e.g. 'payroll.approve'.
  required_permission text not null,
  status        public.request_status not null default 'pending',
  decided_by    uuid references public.profiles (id) on delete set null,
  decided_at    timestamptz,
  decision_note text,
  created_at    timestamptz not null default now()
);

create index on public.approvals (status, site_id);

create trigger calendar_days_touch   before update on public.calendar_days   for each row execute function app.touch_updated_at();
create trigger devices_touch         before update on public.devices         for each row execute function app.touch_updated_at();
create trigger attendance_days_touch before update on public.attendance_days for each row execute function app.touch_updated_at();
create trigger leave_requests_touch  before update on public.leave_requests  for each row execute function app.touch_updated_at();
