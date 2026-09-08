-- ============================================================================
-- Four things the floor asked for, in one migration because they are one
-- release: a terminal that records check-outs, what was actually handed over
-- against what was calculated, a place to keep company-wide settings, and the
-- record of every Claude call the app makes.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- A terminal knows whether it is the way in or the way out
--
-- Until now every device recorded "unknown" and the direction was inferred
-- afterwards from the order of a person's punches — which works only while
-- everybody punches an even number of times. A gate terminal by the door and a
-- second one on the way out is how the factory actually runs, and a terminal
-- that states its own direction needs no inference at all.
--
-- `auto` keeps the existing behaviour, and is the default so no installed
-- terminal changes what it does when this migration lands.
-- ---------------------------------------------------------------------------

create type public.device_direction as enum ('auto', 'in', 'out');

alter table public.devices
  add column direction public.device_direction not null default 'auto';

comment on column public.devices.direction is
  'What a punch from this terminal means. auto = infer from the order of the day''s punches (the original behaviour); in = always a check-in; out = always a check-out.';

-- ---------------------------------------------------------------------------
-- What was actually paid
--
-- A cash payroll does not always hand over the calculated figure to the rupee:
-- a note is not available, an advance is settled at the window, a supervisor
-- rounds up. Until now that difference lived in somebody's head, and the next
-- month's argument had nothing to check against.
--
-- `paid_amount` is what left the cash box. The difference is derived rather
-- than stored so the two can never drift apart, and it is null until somebody
-- is actually paid — zero would mean "paid exactly right", which is a
-- different statement from "not paid yet".
-- ---------------------------------------------------------------------------

alter table public.payroll_items
  add column paid_amount numeric(14, 2) check (paid_amount is null or paid_amount >= 0),
  add column paid_note   text;

alter table public.payroll_items
  add column paid_difference numeric(14, 2)
    generated always as (case when paid_amount is null then null else paid_amount - net end)
    stored;

comment on column public.payroll_items.paid_amount is
  'What was actually handed over, when it differs from net. Null until paid.';
comment on column public.payroll_items.paid_difference is
  'paid_amount - net. Positive means overpaid, negative means short.';

-- ---------------------------------------------------------------------------
-- Company-wide settings
--
-- One row per key, value as jsonb. A table rather than environment variables
-- because these are business figures the office changes — the rupee rate moves
-- weekly — and a redeploy is not an acceptable way to change one.
--
-- Readable by anyone signed in (the rupee rate is not a secret and several
-- screens price things with it); writable only with settings.manage.
-- ---------------------------------------------------------------------------

create table public.app_settings (
  key         text primary key,
  value       jsonb not null,
  updated_by  uuid references public.profiles (id) on delete set null,
  updated_at  timestamptz not null default now()
);

comment on table public.app_settings is
  'Company-wide settings the office changes. One row per key.';

alter table public.app_settings enable row level security;

create policy app_settings_read on public.app_settings
  for select to authenticated using (true);
create policy app_settings_write on public.app_settings
  for all to authenticated
  using (app.can('settings.manage')) with check (app.can('settings.manage'));

create trigger app_settings_touch
  before update on public.app_settings
  for each row execute function app.touch_updated_at();

-- The two figures behind every rupee price this app puts on a dollar cost.
-- Seeded with a rate that is deliberately conservative and a zero tax, so a
-- figure shown before anyone visits the settings screen is understated rather
-- than invented.
insert into public.app_settings (key, value) values
  ('usd_to_pkr',  '285'::jsonb),
  ('tax_percent', '0'::jsonb)
on conflict (key) do nothing;

-- ---------------------------------------------------------------------------
-- Every Claude call this app makes
--
-- The Anthropic console reports account spend with a delay and knows nothing
-- about who asked or what they asked about. This is the app's own record: one
-- row per call, with the tokens it used, so the running cost can be attributed
-- to a person and a screen, and so a bill can be checked rather than believed.
--
-- Readable only with settings.manage — it carries the text of what people
-- asked, which is nobody else's business.
-- ---------------------------------------------------------------------------

create table public.assistant_usage (
  id              bigserial primary key,
  profile_id      uuid references public.profiles (id) on delete set null,
  -- Which screen the question was asked from, e.g. "payroll", "person".
  surface         text,
  model           text not null,
  input_tokens    integer not null default 0,
  output_tokens   integer not null default 0,
  cache_read      integer not null default 0,
  cache_write     integer not null default 0,
  cost_usd        numeric(12, 6) not null default 0,
  asked_at        timestamptz not null default now()
);

create index on public.assistant_usage (asked_at desc);
create index on public.assistant_usage (profile_id, asked_at desc);

alter table public.assistant_usage enable row level security;

create policy assistant_usage_read on public.assistant_usage
  for select to authenticated using (app.can('settings.manage'));
-- Written by the route on the caller's behalf, so anyone who may ask may log.
create policy assistant_usage_insert on public.assistant_usage
  for insert to authenticated with check (profile_id = auth.uid());
