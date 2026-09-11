-- ============================================================================
-- One roster across every terminal.
--
-- Three MB460s are going on the wall: one inside the main gate that only ever
-- means "arrived", one on the way out that only ever means "left", and one at
-- the kitchen counter that feeds a person once a day. They are three separate
-- computers with three separate copies of the staff list, and until now
-- RadoFlow only ever read from them.
--
-- That asymmetry is the whole problem. A supervisor enrols a new dyer at the
-- gate because that is the terminal he is standing next to; the man then
-- cannot get lunch and cannot clock out, because the other two boxes have
-- never heard of him. Somebody is fired and deleted at the gate, and eats in
-- the canteen for another month.
--
-- ADMS has no "push a user to a device" call. What it has is a mailbox: the
-- terminal asks /iclock/getrequest every few seconds whether anything is
-- waiting, runs whatever it is handed, and posts the outcome back to
-- /iclock/devicecmd. So the fan-out is a queue, and this migration is mostly
-- that queue plus the two facts it needs to fan out: which enrolment number a
-- person carries, and what their finger actually looks like.
--
-- The direction and canteen rules the floor asked for already exist —
-- `devices.direction` (20260908100000) and the rolling 24-hour meal trigger
-- (20260905090000). This migration registers the three terminals against them
-- rather than inventing a second mechanism.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- The mailbox
--
-- One row per instruction for one terminal. Rows are never deleted on
-- completion: "did that worker's fingerprint ever reach the kitchen" is the
-- question this table exists to answer, and a queue that empties itself can
-- only answer it while something is still broken.
-- ---------------------------------------------------------------------------

create type public.device_command_status as enum (
  'pending',  -- queued, not yet collected
  'sent',     -- handed to the terminal, awaiting its result
  'done',     -- terminal reported success
  'failed'    -- terminal reported an error, or it was abandoned
);

create table public.device_commands (
  id            bigserial primary key,
  device_id     uuid not null references public.devices (id) on delete cascade,

  /*
   * The exact ADMS command body, without the `C:<id>:` prefix — that carries
   * this row's own id and is added when the row is handed over.
   *
   * Stored built rather than as parameters to build from later. A fingerprint
   * template is replayed to the other terminals byte for byte in the dialect
   * the enrolling terminal spoke, and re-serialising it from parts at delivery
   * time is exactly where that fidelity would be lost.
   */
  body          text not null,

  /*
   * What kind of instruction this is, for the device page and for collapsing
   * superseded work. Free text rather than an enum: ADMS grows verbs with
   * firmware, and a new one should queue and run, not fail a check constraint
   * on a factory floor at seven in the morning.
   */
  kind          text not null,

  /** Who this is about, when it is about somebody. Null for REBOOT and friends. */
  profile_id    uuid references public.profiles (id) on delete cascade,

  status        public.device_command_status not null default 'pending',
  sent_at       timestamptz,
  completed_at  timestamptz,
  /** The terminal's own `Return=` code. 0 is success; anything else is not. */
  return_code   integer,
  last_error    text,

  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

comment on table public.device_commands is
  'Outbound ADMS instruction queue, one row per terminal per instruction. The terminal collects rows on its /iclock/getrequest poll and reports the outcome to /iclock/devicecmd. Completed rows are kept as the record of what reached which box.';

-- The delivery query: oldest pending row for one device. Partial, because
-- every other status is history and history is never polled.
create index device_commands_pending
  on public.device_commands (device_id, id)
  where status = 'pending';

create index on public.device_commands (profile_id);
create index on public.device_commands (status, created_at desc);

create trigger device_commands_touch
  before update on public.device_commands
  for each row execute function app.touch_updated_at();

alter table public.device_commands enable row level security;

-- Visible to anyone who may look at devices; queued only by the service role
-- (ingestion and the fan-out triggers), never straight from a browser.
create policy device_commands_read on public.device_commands
  for select to authenticated using (app.can('devices.view'));

-- ---------------------------------------------------------------------------
-- One enrolment number per person, everywhere
--
-- `device_enrollments` maps (device, device_user_id) → person, which allowed
-- the same man to be 41 at the gate and 106 in the kitchen. That was tolerable
-- while the terminals were read-only and each mapping was maintained by hand.
-- It is not tolerable now: a template captured at the gate is enrolled against
-- a number, and replaying it to the kitchen under a different number would
-- attach one man's finger to another man's record.
--
-- So the number becomes a fact about the person, not about the person on a
-- particular box.
-- ---------------------------------------------------------------------------

alter table public.profiles
  add column device_pin text;

comment on column public.profiles.device_pin is
  'The enrolment number this person carries on every terminal. Digits only — a ZKTeco terminal stores the user id as a number and silently truncates anything else, which is how RD-2070 became 2070 and dropped its punches (see scripts/fix-terminal-ids.ts).';

-- Digits only, and not empty. The terminal cannot hold anything else, so a
-- value it cannot hold is a bug to catch here rather than a punch to lose in
-- six weeks' time.
alter table public.profiles
  add constraint profiles_device_pin_numeric
  check (device_pin is null or device_pin ~ '^[0-9]{1,9}$');

create unique index profiles_device_pin_key
  on public.profiles (device_pin)
  where device_pin is not null;

/*
 * Backfill from the enrolment rows that already exist, then from the employee
 * code, which is where they came from originally.
 *
 * `min(device_user_id)` rather than any single device's view: where a person
 * genuinely does carry two numbers today, one of them has to win, and the
 * lower is the older enrolment more often than not. The losing number keeps
 * working until its terminal is re-synced, because the enrolment row is left
 * in place — this backfill decides the canonical number, it does not delete
 * anybody's access.
 */
update public.profiles p
   set device_pin = e.pin
  from (
    select profile_id, min(device_user_id) as pin
      from public.device_enrollments
     where device_user_id ~ '^[0-9]{1,9}$'
     group by profile_id
  ) e
 where e.profile_id = p.id
   and p.device_pin is null;

update public.profiles p
   set device_pin = digits.value
  from (
    select id, regexp_replace(employee_code, '\D', '', 'g') as value
      from public.profiles
  ) digits
 where digits.id = p.id
   and p.device_pin is null
   and digits.value ~ '^[0-9]{1,9}$'
   -- A collision here means two employee codes reduce to the same digits.
   -- Leave both null rather than guess; the devices screen reports them.
   and not exists (
     select 1 from public.profiles other
      where other.device_pin = digits.value
   );

-- ---------------------------------------------------------------------------
-- What a finger looks like
--
-- A terminal will not accept "user 41 exists"; it needs the template, or
-- number 41 walks up to the kitchen scanner and is refused. Templates are
-- therefore held centrally, and every terminal is a replica of this table
-- rather than an independent original.
--
-- Two dialects are in the wild and the same site can speak both: older
-- firmware sends `FP PIN=..` with a raw template, newer sends `BIODATA Pin=..`
-- which also covers faces and palms. Rather than normalise the two into one
-- shape and re-serialise on the way out — which is precisely where a template
-- gets corrupted — the line is kept as the enrolling terminal wrote it, and
-- `dialect` says which one to replay.
-- ---------------------------------------------------------------------------

create table public.person_biometrics (
  id              uuid primary key default gen_random_uuid(),
  profile_id      uuid not null references public.profiles (id) on delete cascade,

  /** 1 = fingerprint, 2 = face, 9 = palm — the terminal's own Type numbering. */
  bio_type        smallint not null default 1,
  /** Which finger, 0-9. A person may enrol several. */
  finger_index    smallint not null default 0 check (finger_index between 0 and 9),

  /** 'fp' = legacy `FP PIN=..` line, 'biodata' = `BIODATA Pin=..` line. */
  dialect         text not null check (dialect in ('fp', 'biodata')),
  /*
   * The template's own field list, exactly as the terminal sent it, minus the
   * leading verb. Replayed verbatim with only the PIN rewritten, so a firmware
   * field this code has never heard of survives the round trip instead of
   * being dropped by a serialiser that predates it.
   */
  payload         text not null,
  template_size   integer,
  is_duress       boolean not null default false,

  /** The terminal this was captured on. Kept for "where did this come from". */
  source_device_id uuid references public.devices (id) on delete set null,

  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),

  -- One template per finger per person. A re-enrolment replaces rather than
  -- accumulates, or a man who re-scans a cut finger ends up with two versions
  -- and the terminals disagree about which is his.
  unique (profile_id, bio_type, finger_index)
);

comment on table public.person_biometrics is
  'The master copy of every enrolled template. Terminals hold replicas; this is the original, so a box that is replaced can be repopulated without re-scanning four hundred fingers.';

create index on public.person_biometrics (profile_id);

create trigger person_biometrics_touch
  before update on public.person_biometrics
  for each row execute function app.touch_updated_at();

alter table public.person_biometrics enable row level security;

/*
 * No read policy for `authenticated`, deliberately.
 *
 * A fingerprint template is not a password: it cannot be rotated after it
 * leaks, and the person is stuck with the consequences for life. Nothing in
 * the browser needs the bytes — the devices screen shows a count, which it
 * gets from a view below — so the table is reachable only by the service role
 * that syncs it. RLS with no policy denies everyone else by default; this
 * comment is here so the absence reads as a decision rather than an omission.
 */

-- What the UI is actually allowed to know: how many fingers a person has
-- enrolled, and when they last did. No template bytes.
create view public.person_biometric_summary
with (security_invoker = true) as
  select profile_id,
         count(*)::integer   as template_count,
         max(updated_at)     as last_enrolled_at
    from public.person_biometrics
   group by profile_id;

comment on view public.person_biometric_summary is
  'Enrolment counts for the UI. Exists so no screen ever has cause to select from person_biometrics itself.';

-- ---------------------------------------------------------------------------
-- The fan-out
--
-- Queue the work in the database rather than in the route that received the
-- enrolment. There are three ways a person can appear or disappear — a push
-- from a terminal, the on-site agent's pull, and an office edit in RadoFlow —
-- and a trigger covers all three by construction. Application code would have
-- to remember to call it in each, and the failure mode of forgetting is a
-- worker who cannot eat, discovered a week later.
--
-- `p_except` is the terminal the change came from. It already has the user;
-- sending it back its own enrolment is wasted work at best, and at worst a
-- loop where each terminal's echo re-triggers the others.
-- ---------------------------------------------------------------------------

create or replace function app.queue_device_command(
  p_device    uuid,
  p_kind      text,
  p_body      text,
  p_profile   uuid default null
)
returns bigint
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_id bigint;
begin
  /*
   * An identical instruction already waiting is not queued twice.
   *
   * Terminals re-send their enrolment buffer after a reboot, and each echo
   * would otherwise queue the same template to the other two boxes again. The
   * device would run them all and reach the same state, so this is about the
   * queue staying readable — a hundred duplicate rows hide the one that
   * failed.
   */
  select id into v_id
    from public.device_commands
   where device_id = p_device
     and body = p_body
     and status = 'pending'
   limit 1;

  if found then
    return v_id;
  end if;

  insert into public.device_commands (device_id, kind, body, profile_id)
  values (p_device, p_kind, p_body, p_profile)
  returning id into v_id;

  return v_id;
end;
$$;

comment on function app.queue_device_command(uuid, text, text, uuid) is
  'Adds one instruction to one terminal''s mailbox, unless an identical one is already pending.';

/*
 * The user record as ADMS wants it.
 *
 * Name is truncated to 24 bytes because that is the field width on the device;
 * a longer one is not rejected, it is silently cut, and a list of workers all
 * called "MUHAMMAD ASLAM (DYEING" is worse than a short name chosen here.
 *
 * Tabs separate the fields, so a tab inside a name would forge a field
 * boundary and shift every value after it. Stripped rather than escaped —
 * ADMS has no escape syntax to use.
 */
create or replace function app.userinfo_body(p_profile uuid)
returns text
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select 'DATA UPDATE USERINFO PIN=' || p.device_pin
      || chr(9) || 'Name='   || left(regexp_replace(coalesce(p.full_name, ''), '[\t\r\n]', ' ', 'g'), 24)
      || chr(9) || 'Pri=0'
      || chr(9) || 'Passwd='
      || chr(9) || 'Card='
      || chr(9) || 'Grp=1'
      || chr(9) || 'TZ=0000000000000000'
      -- -1 = accept any verification method the terminal supports, so a
      -- fingerprint that will not read can fall back to a card or a password
      -- without a trip to this table.
      || chr(9) || 'Verify=-1'
    from public.profiles p
   where p.id = p_profile
     and p.device_pin is not null;
$$;

/*
 * Every terminal that should hold this person, except the one named.
 *
 * All three boxes get everybody, including the kitchen: the canteen terminal
 * has to recognise a finger before it can decide whether that person has
 * already eaten today, so "only attendance terminals need the roster" is
 * exactly backwards.
 *
 * Restricted to push-mode terminals. A pull-mode box is reached by the on-site
 * agent opening a socket to it, not by a mailbox it never polls, and queueing
 * for one would fill the table with rows nothing will ever collect.
 */
create or replace function app.sync_targets(p_except uuid default null)
returns setof uuid
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select id
    from public.devices
   where is_active
     and mode = 'push'
     and (p_except is null or id <> p_except);
$$;

/**
 * Pushes one person's user record and every template they own to one terminal.
 *
 * The order matters: a template for a PIN the terminal has never seen is
 * discarded, so USERINFO always goes first. They are separate rows rather than
 * one because ADMS runs one instruction per line and reports each separately —
 * this way "the user arrived but his thumb did not" is a state the device page
 * can actually show.
 */
create or replace function app.push_person_to_device(p_profile uuid, p_device uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_pin  text;
  v_body text;
  v_bio  record;
begin
  select device_pin into v_pin from public.profiles where id = p_profile;
  if v_pin is null then
    return;  -- nobody to enrol until the office gives them a number
  end if;

  v_body := app.userinfo_body(p_profile);
  if v_body is null then
    return;
  end if;

  perform app.queue_device_command(p_device, 'user.update', v_body, p_profile);

  for v_bio in
    select dialect, payload from public.person_biometrics where profile_id = p_profile
  loop
    perform app.queue_device_command(
      p_device,
      'biometric.update',
      case v_bio.dialect
        when 'fp' then 'DATA UPDATE FINGERTMP ' || v_bio.payload
        else           'DATA UPDATE BIODATA '   || v_bio.payload
      end,
      p_profile
    );
  end loop;
end;
$$;

/** The same person, to every terminal but the one they were enrolled on. */
create or replace function app.fan_out_person(p_profile uuid, p_except uuid default null)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_device uuid;
begin
  for v_device in select app.sync_targets(p_except) loop
    perform app.push_person_to_device(p_profile, v_device);
  end loop;
end;
$$;

/**
 * Removes one person from every terminal but the one they were deleted on.
 *
 * Takes the PIN rather than the profile id, because by the time a deletion is
 * fanned out the profile row may already be gone — and a worker who was
 * deleted everywhere except the kitchen is the exact failure this exists to
 * prevent.
 */
create or replace function app.fan_out_removal(p_pin text, p_except uuid default null)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_device uuid;
begin
  if p_pin is null then return; end if;

  for v_device in select app.sync_targets(p_except) loop
    perform app.queue_device_command(
      v_device, 'user.delete', 'DATA DELETE USERINFO PIN=' || p_pin, null
    );
  end loop;
end;
$$;

-- ---------------------------------------------------------------------------
-- Where a new person's number comes from
--
-- The backfill above only sees the people who existed when it ran. Everybody
-- hired afterwards needs a number too, and leaving it to be typed in means it
-- is eventually not typed in — a worker with no `device_pin` is skipped by
-- every fan-out here, silently, and turns up as somebody who cannot open the
-- gate on their second day.
--
-- So it is derived, by the same rule scripts/fix-terminal-ids.ts established
-- after the last time this went wrong: the digits of the employee code, which
-- is what the terminal was always going to store anyway. RD-2070 becomes 2070.
-- ---------------------------------------------------------------------------

create or replace function app.assign_device_pin()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_candidate text;
begin
  -- An explicitly chosen number always wins. This fills a gap; it does not
  -- overrule the office.
  if new.device_pin is not null then
    return new;
  end if;

  v_candidate := regexp_replace(coalesce(new.employee_code, ''), '\D', '', 'g');

  if v_candidate !~ '^[0-9]{1,9}$' then
    return new;  -- no digits to work with; the office assigns one by hand
  end if;

  /*
   * A collision leaves the number null rather than taking it.
   *
   * Two employee codes reducing to the same digits is rare and always a data
   * problem, but the wrong way to resolve it is to hand the second person the
   * first person's enrolment: the terminals key everything on that number, so
   * the newcomer would inherit the other's fingerprints, their punches and
   * their pay. A worker who cannot scan is a morning's inconvenience. A worker
   * scanning as somebody else is a payroll no one can unpick.
   */
  if exists (select 1 from public.profiles where device_pin = v_candidate and id <> new.id) then
    return new;
  end if;

  new.device_pin := v_candidate;
  return new;
end;
$$;

create trigger profiles_assign_device_pin
  before insert or update of employee_code, device_pin on public.profiles
  for each row execute function app.assign_device_pin();

-- ---------------------------------------------------------------------------
-- The triggers that make it automatic
-- ---------------------------------------------------------------------------

/*
 * A template captured anywhere reaches everywhere.
 *
 * `source_device_id` is excluded from the fan-out because that box already has
 * it — it is the one that did the scanning. Without that exclusion the write
 * would queue a command back to the originating terminal, which would apply it
 * and re-upload it, which would fire this trigger again.
 */
create or replace function app.fan_out_biometric()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if tg_op = 'DELETE' then
    /*
     * ADMS deletes templates by user, not by finger, so "one of this person's
     * fingers is gone" can only be expressed as "here is what he has now".
     *
     * Unless he has nothing left. That is not a finger being re-enrolled, it
     * is the person being unenrolled — and re-pushing a user record with no
     * template would put him back on all three terminals moments after a
     * supervisor deleted him, which is the opposite of what was asked for.
     * The removal command has already been queued by whoever cleared the rows.
     */
    if exists (select 1 from public.person_biometrics where profile_id = old.profile_id) then
      perform app.fan_out_person(old.profile_id, old.source_device_id);
    end if;
    return old;
  end if;

  perform app.fan_out_person(new.profile_id, new.source_device_id);
  return new;
end;
$$;

create trigger person_biometrics_fan_out
  after insert or update or delete on public.person_biometrics
  for each row execute function app.fan_out_biometric();

/*
 * A name change or a new enrolment number reaches every terminal.
 *
 * Only these two columns. `profiles` is written on every login and every role
 * change, and fanning out on all of them would put four hundred no-op commands
 * in the queue each morning.
 */
create or replace function app.fan_out_profile_identity()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if tg_op = 'UPDATE'
     and old.device_pin is distinct from new.device_pin
     and old.device_pin is not null then
    -- The old number is now nobody. Left on the terminals it would keep
    -- opening the gate under a name that has moved.
    perform app.fan_out_removal(old.device_pin, null);
  end if;

  if new.device_pin is not null then
    perform app.fan_out_person(new.id, null);
  end if;

  return new;
end;
$$;

create trigger profiles_fan_out_identity
  after insert or update of device_pin, full_name, employee_code on public.profiles
  for each row execute function app.fan_out_profile_identity();

/*
 * Somebody removed from RadoFlow is removed from the hardware.
 *
 * BEFORE DELETE, not AFTER: `device_pin` has to still be readable to build the
 * command, and the profile's own row is what carries it.
 */
create or replace function app.fan_out_profile_removal()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  perform app.fan_out_removal(old.device_pin, null);
  return old;
end;
$$;

create trigger profiles_fan_out_removal
  before delete on public.profiles
  for each row execute function app.fan_out_profile_removal();

-- ---------------------------------------------------------------------------
-- Repopulating a terminal from scratch
--
-- A box is replaced, or one drifts far enough that reconciling it row by row
-- is slower than starting again. This queues the entire roster for one
-- terminal. Idempotent, because the terminal applies each user as an upsert.
-- ---------------------------------------------------------------------------

create or replace function app.resync_device(p_device uuid)
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_profile uuid;
  v_count   integer := 0;
begin
  if not app.can('devices.manage') then
    raise exception 'Not allowed to sync devices.' using errcode = 'insufficient_privilege';
  end if;

  /*
   * Suspended and terminated people are left off deliberately. This is the
   * button for repopulating a terminal from nothing, and rebuilding it with
   * everybody who ever worked here would hand gate access back to the people
   * most recently taken off it.
   */
  for v_profile in
    select id from public.profiles
     where device_pin is not null and status = 'active'
  loop
    perform app.push_person_to_device(v_profile, p_device);
    v_count := v_count + 1;
  end loop;

  return v_count;
end;
$$;

comment on function app.resync_device(uuid) is
  'Queues the whole active roster for one terminal. Used when a box is replaced or has drifted.';

grant execute on function app.resync_device(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- The three terminals going on the wall
--
-- Registered here rather than typed into a form, so the serial numbers — which
-- are the only thing identifying a terminal on the wire, and the one field a
-- typo makes silently useless — are in version control and land the same way
-- in every environment.
--
-- Attached to the first site by creation order. A second factory means moving
-- them on the devices screen, which is a two-click job; guessing here would
-- not be.
--
-- On a fresh local database there are no sites yet — `supabase/seed.sql`
-- creates them after every migration has run — so the cross join yields
-- nothing and this is a no-op. That is why the seed carries the same three
-- terminals: this statement is for the environments that already have a site,
-- which is every deployed one.
-- ---------------------------------------------------------------------------

insert into public.devices
  (site_id, name, model, serial_number, mode, purpose, direction,
   ip_address, port, timezone, is_active)
select s.id, d.name, 'ZKTeco MB460', d.serial, 'push', d.purpose::public.device_purpose,
       d.direction::public.device_direction, d.ip::inet, 4370, 'Asia/Karachi', true
  from (select id from public.sites order by created_at limit 1) s
 cross join (values
    -- Inside the main gate. Every read here is an arrival, whatever the
    -- terminal's own state byte says — the MB460 has no in/out keys and
    -- stamps every record 0, so which door it is bolted beside is the only
    -- reliable fact about what a punch means.
    ('Main Gate — Check In',  'QWC5254900090', 'attendance', 'in',  '192.168.1.201'),
    ('Main Gate — Check Out', 'QWC5261300506', 'attendance', 'out', '192.168.1.202'),
    -- The kitchen counter. `purpose = canteen` is what keeps a lunch queue
    -- out of payroll: canteen scans become meal claims and never punches, and
    -- the one-per-24-hours rule is the trigger added in 20260905090000.
    ('Kitchen — Meals',       'QWC5261300445', 'canteen',    'auto', '192.168.1.203')
  ) as d(name, serial, purpose, direction, ip)
on conflict (serial_number) do update
  set name      = excluded.name,
      model     = excluded.model,
      mode      = excluded.mode,
      purpose   = excluded.purpose,
      direction = excluded.direction,
      ip_address = excluded.ip_address,
      is_active = true;

-- ---------------------------------------------------------------------------
-- Public wrappers
--
-- PostgREST resolves `rpc/<name>` against the exposed schema only, so an
-- `app.` function is unreachable from the Supabase client however it is
-- called. These are the two the ingestion path needs, plus the resync the
-- devices screen calls.
--
-- Execute is revoked from `anon` and `authenticated` on the first two: they
-- write to a queue that opens a gate, and the only caller that should reach
-- them is the service role holding the ingestion key.
-- ---------------------------------------------------------------------------

create or replace function public.queue_device_command(
  p_device  uuid,
  p_kind    text,
  p_body    text,
  p_profile uuid default null
)
returns bigint
language sql
security definer
set search_path = public, pg_temp
as $$
  select app.queue_device_command(p_device, p_kind, p_body, p_profile);
$$;

revoke execute on function public.queue_device_command(uuid, text, text, uuid) from public, anon, authenticated;
-- Revoking from PUBLIC takes the default grant away from every role, service
-- role included, so the one caller that must reach this is granted back by
-- name. Without this the ingestion path's rpc() call fails permission-denied,
-- and because a queue write is fire-and-forget that failure is invisible: the
-- terminals simply never converge.
grant execute on function public.queue_device_command(uuid, text, text, uuid) to service_role;

/**
 * A person deleted on a terminal, cleared from the others.
 *
 * Their templates go with them: an unenrolled finger is unenrolled everywhere,
 * and leaving the master copy in place would let the next `resync_device` put
 * them back on all three boxes. The profile itself is untouched — their
 * attendance and any unpaid payroll line are records of work that happened,
 * and a supervisor pressing DELETE on a wall-mounted box is not a decision
 * about employment.
 */
create or replace function public.fan_out_removal_from_device(
  p_pin    text,
  p_except uuid
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_profile uuid;
begin
  perform app.fan_out_removal(p_pin, p_except);

  select id into v_profile from public.profiles where device_pin = p_pin;
  if v_profile is null then
    return;  -- hardware-only enrolment; nothing central to clear
  end if;

  -- Order matters. Enrolments go first so that when the last template row is
  -- deleted, the trigger's "does anything remain" test is the only thing left
  -- to decide, and it decides not to re-push.
  delete from public.device_enrollments where profile_id = v_profile;
  delete from public.person_biometrics  where profile_id = v_profile;
end;
$$;

revoke execute on function public.fan_out_removal_from_device(text, uuid) from public, anon, authenticated;
grant execute on function public.fan_out_removal_from_device(text, uuid) to service_role;

/** The devices screen's "sync all users to this terminal" button. */
create or replace function public.resync_device(p_device uuid)
returns integer
language sql
security definer
set search_path = public, pg_temp
as $$
  select app.resync_device(p_device);
$$;

grant execute on function public.resync_device(uuid) to authenticated;
