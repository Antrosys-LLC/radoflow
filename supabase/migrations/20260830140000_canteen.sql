-- ============================================================================
-- Canteen: one meal per person per serving, enforced by fingerprint.
--
-- The factory feeds ~400 people from one counter on paper tokens. Tokens get
-- swapped, borrowed and reused, so a worker can eat twice while someone else
-- goes without, and the food provider has no way to tell — there is nothing
-- on a token that says whose it is. A fingerprint cannot be handed to a
-- friend, so the same ZKTeco hardware already on the gate is pointed at the
-- counter instead.
--
-- The "no second helping" guarantee is the unique index on meal_claims, not
-- application code. Two scanners firing at the same instant, a replayed
-- device buffer, a retried request — all collapse to one row.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- What a terminal is for
--
-- A canteen scan must never become an attendance punch: walking past the
-- lunch counter is not a clock-in, and counting it as one would pay people
-- for eating. The ingestion path branches on this column.
-- ---------------------------------------------------------------------------

create type public.device_purpose as enum ('attendance', 'canteen');

alter table public.devices
  add column purpose public.device_purpose not null default 'attendance';

comment on column public.devices.purpose is
  'What this terminal records. Canteen scans become meal claims, never attendance punches.';

-- ---------------------------------------------------------------------------
-- Serving periods
--
-- Per site, because the two factories run different shifts. A window may run
-- past midnight (a night shift eating at 22:00–02:00); the after-midnight
-- half is credited to the day the window opened, so one shift's meal stays
-- one row instead of splitting across two dates.
-- ---------------------------------------------------------------------------

create table public.meal_windows (
  id          uuid primary key default gen_random_uuid(),
  site_id     uuid not null references public.sites (id) on delete cascade,
  code        text not null,
  name        text not null,
  starts_at   time not null,
  ends_at     time not null,
  is_active   boolean not null default true,
  sort_order  integer not null default 100,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique (site_id, code),
  -- Equal start and end would be a window that is never open, which is
  -- always a mistake rather than a way to disable one — is_active does that.
  check (starts_at <> ends_at)
);

create index on public.meal_windows (site_id, is_active);

-- ---------------------------------------------------------------------------
-- Servings actually handed over
--
-- One row per person per window per serving date. The unique index is the
-- whole feature.
-- ---------------------------------------------------------------------------

create table public.meal_claims (
  id              uuid primary key default gen_random_uuid(),
  profile_id      uuid not null references public.profiles (id) on delete cascade,
  site_id         uuid references public.sites (id) on delete set null,
  meal_window_id  uuid not null references public.meal_windows (id) on delete restrict,
  -- The date the serving counts against, which for a window crossing midnight
  -- is not always the calendar date of claimed_at.
  served_on       date not null,
  claimed_at      timestamptz not null default now(),
  device_id       uuid references public.devices (id) on delete set null,
  device_user_id  text,
  source          public.punch_source not null default 'device',
  -- Set when the counter supervisor serves someone by hand — a cut finger, a
  -- terminal that will not read. Recorded so it can be reviewed, not hidden.
  recorded_by     uuid references public.profiles (id) on delete set null,
  note            text,
  unique (profile_id, meal_window_id, served_on)
);

create index on public.meal_claims (served_on);
create index on public.meal_claims (site_id, served_on);
create index on public.meal_claims (profile_id);

comment on table public.meal_claims is
  'One accepted serving. The unique index is what makes a second helping impossible — not application code.';

-- ---------------------------------------------------------------------------
-- Every scan, including the refused ones
--
-- Kept apart from meal_claims because a refusal is not a claim, and folding
-- both into one table would need a partial unique index — which cannot be
-- targeted by ON CONFLICT, the same trap documented on punches_dedupe.
--
-- This is what makes the fraud visible: "twelve people tried for seconds
-- today, mostly on floor two" is a report the owner could never get from
-- paper tokens.
-- ---------------------------------------------------------------------------

create type public.meal_scan_outcome as enum (
  'served', 'duplicate', 'unknown_person', 'outside_window'
);

create table public.meal_scan_log (
  id              bigserial primary key,
  device_id       uuid references public.devices (id) on delete set null,
  device_user_id  text,
  profile_id      uuid references public.profiles (id) on delete set null,
  site_id         uuid references public.sites (id) on delete set null,
  meal_window_id  uuid references public.meal_windows (id) on delete set null,
  outcome         public.meal_scan_outcome not null,
  served_on       date,
  scanned_at      timestamptz not null default now(),
  created_at      timestamptz not null default now()
);

create index on public.meal_scan_log (scanned_at desc);
create index on public.meal_scan_log (site_id, outcome, scanned_at desc);
create index on public.meal_scan_log (profile_id);

-- ---------------------------------------------------------------------------
-- Access
-- ---------------------------------------------------------------------------

insert into public.permissions (key, module, action, label, description) values
  ('canteen.serve', 'canteen', 'manage', 'Run the canteen counter',
   'Open the counter screen and serve meals by fingerprint.'),
  ('canteen.view',  'canteen', 'view',   'View canteen records',
   'See who was served, and every refused scan.'),
  ('canteen.manage','canteen', 'manage', 'Manage meal windows',
   'Set serving times and mark a terminal as a canteen scanner.');

alter table public.meal_windows   enable row level security;
alter table public.meal_claims    enable row level security;
alter table public.meal_scan_log  enable row level security;

-- Serving times are not secret; knowing when lunch is helps everyone.
create policy meal_windows_read on public.meal_windows
  for select to authenticated using (true);
create policy meal_windows_write on public.meal_windows
  for all to authenticated
  using (app.can('canteen.manage', site_id)) with check (app.can('canteen.manage', site_id));

-- A worker may check whether they have eaten; the counter and management see
-- everyone. Deliberately not tied to attendance permissions: the canteen
-- supervisor has no business reading the attendance register.
create policy meal_claims_read on public.meal_claims
  for select to authenticated
  using (
    profile_id = auth.uid()
    or app.can('canteen.view', site_id)
    or app.can('canteen.serve', site_id)
  );
create policy meal_claims_write on public.meal_claims
  for all to authenticated
  using (app.can('canteen.serve', site_id)) with check (app.can('canteen.serve', site_id));

create policy meal_scan_log_read on public.meal_scan_log
  for select to authenticated
  using (app.can('canteen.view', site_id) or app.can('canteen.serve', site_id));

create trigger meal_windows_touch
  before update on public.meal_windows
  for each row execute function app.touch_updated_at();
