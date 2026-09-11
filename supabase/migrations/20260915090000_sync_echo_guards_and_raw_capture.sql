-- ============================================================================
-- The three terminals looped, and this is what stops it happening again —
-- and what lets them be merged without overwriting anything.
--
-- On the first day the MB460s were live, the queue went from a few dozen
-- instructions a minute to over eight hundred. The kitchen sent its whole
-- roster, the upload was handled one database call at a time, it outlived the
-- relay's thirty-second timeout, and the terminal resent the batch every
-- thirty-five seconds. Every resend relayed every unknown worker again. The
-- terminals were switched to pull mode — which stops all fan-out — and the
-- backlog was cleared by hand.
--
-- Fixed here:
--
--   1. Processing the same upload twice changes nothing. A template identical
--      to the stored one fans out nowhere; the queue refuses an instruction a
--      terminal already has waiting or acted on within the hour.
--   2. Terminals only ever receive what they are missing. Each terminal's
--      roster is kept as an inventory, and a user or a finger it already holds
--      is never sent to it again, whichever version it holds. This is what the
--      factory asked for — copy across what each box lacks, never replace what
--      it has — and it is also what makes an echo harmless.
--   3. The three rosters can be merged on demand, in a stated order of
--      precedence, by `reconcile_rosters`.
--   4. A supervisor stays a supervisor and a card stays on its owner: pushes
--      carry the privilege and card the terminals reported, not Pri=0 and an
--      empty Card.
--   5. What the terminals actually send is kept, so firmware behaviour can be
--      read back instead of guessed.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- What a terminal sent, verbatim
--
-- Excerpted to 16 KB. A full roster upload is half a megabyte of base64 and the
-- purpose here is to see its shape, not to archive it.
--
-- No read policy. These bodies contain fingerprint templates; see the comment
-- on person_biometrics for why nothing in a browser ever selects them.
-- ---------------------------------------------------------------------------

create table public.device_uploads (
  id             bigserial primary key,
  device_id      uuid references public.devices (id) on delete set null,
  serial_number  text,
  endpoint       text not null,
  table_name     text,
  status_code    integer,
  line_count     integer,
  body_excerpt   text,
  created_at     timestamptz not null default now()
);

comment on table public.device_uploads is
  'Raw excerpts of what terminals post to /iclock/cdata and /iclock/devicecmd. Kept for diagnosis of firmware behaviour; contains templates, so no authenticated read policy.';

create index on public.device_uploads (device_id, created_at desc);
create index on public.device_uploads (created_at desc);

alter table public.device_uploads enable row level security;

-- ---------------------------------------------------------------------------
-- What each terminal holds
--
-- One row per terminal per user record, and one per terminal per finger. Filled
-- from two directions: a terminal's own roster uploads, and every instruction a
-- terminal confirms it applied. Emptied for a PIN when that PIN is deleted.
--
-- `command_body` is the record in the form another terminal would be sent it,
-- so a merge can copy it across without rebuilding anything.
--
-- No read policy: template bodies again.
-- ---------------------------------------------------------------------------

create table public.device_inventory (
  device_id     uuid not null references public.devices (id) on delete cascade,
  pin           text not null,
  record_type   text not null check (record_type in ('user', 'template')),
  -- 0 for a user record; the terminal's Type for a template (1 fingerprint, 2 face, 9 palm).
  bio_type      smallint not null default 0,
  -- -1 for a user record; which finger for a template.
  finger_index  smallint not null default -1,
  command_body  text not null,
  reported_at   timestamptz not null default now(),
  primary key (device_id, pin, record_type, bio_type, finger_index)
);

comment on table public.device_inventory is
  'The users and fingers each terminal holds, as last reported or confirmed. A terminal is never sent a slot it already has.';

create index on public.device_inventory (pin);

alter table public.device_inventory enable row level security;

/*
 * Which slot an instruction is about: whose PIN, and whether it is the user
 * record or a particular finger.
 *
 * Read out of the instruction text rather than stored alongside it, because
 * every path that queues work — triggers, relays, the merge, the resync button
 * — writes only a body, and a rule enforced on the body cannot be bypassed by a
 * caller that forgot to pass a column.
 *
 * Mirrors the parser in src/lib/devices/zkteco/userinfo.ts: FINGERTMP is always
 * a fingerprint at FID; BIODATA takes Type (default 1) and No, falling back to
 * Index.
 */
create or replace function app.command_slot(
  p_body text,
  out pin text,
  out record_type text,
  out bio_type smallint,
  out finger_index smallint
)
language plpgsql
immutable
as $$
begin
  pin := substring(p_body from '(?i)(?:^|[\t ])pin=([0-9]+)');

  if p_body ~* '^DATA (UPDATE|DELETE) USERINFO' then
    record_type  := 'user';
    bio_type     := 0;
    finger_index := -1;
  elsif p_body ~* '^DATA UPDATE FINGERTMP' then
    record_type  := 'template';
    bio_type     := 1;
    finger_index := coalesce(substring(p_body from '(?i)(?:^|\t)fid=([0-9]+)'), '0')::smallint;
  elsif p_body ~* '^DATA UPDATE BIODATA' then
    record_type  := 'template';
    bio_type     := coalesce(substring(p_body from '(?i)(?:^|\t)type=([0-9]+)'), '1')::smallint;
    finger_index := coalesce(
      substring(p_body from '(?i)(?:^|\t)no=([0-9]+)'),
      substring(p_body from '(?i)(?:^|\t)index=([0-9]+)'),
      '0'
    )::smallint;
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- The queue remembers what it has said, and to whom
-- ---------------------------------------------------------------------------

alter table public.device_commands
  -- How many times a row has been handed over without a result coming back.
  add column attempts   integer not null default 0,
  -- What the terminal said about it, exactly as it said it.
  add column result_raw text,
  -- Lookups by body were a sequential scan over rows that each carry a
  -- kilobyte-and-a-half template. A hash makes "have we already said this"
  -- an index probe.
  add column body_hash  text generated always as (md5(body)) stored;

create index device_commands_device_hash
  on public.device_commands (device_id, body_hash, created_at desc);

/*
 * Queues one instruction for one terminal, unless it would be redundant.
 *
 * Refused, returning the existing row's id:
 *   - an identical instruction waiting, in flight, or acted on within the hour.
 *     `failed` rows never block; a refused instruction should be free to retry.
 *
 * Refused, returning null because nothing was queued:
 *   - a fingerprint for a finger the terminal already holds, in any version.
 *   - a relayed user record (no profile) for a PIN the terminal already holds.
 *
 * A user record pushed for a RadoFlow person is still sent over an existing
 * one: that is the office changing a name, a privilege or a card, and the
 * office is the authority on those. Deletions are always sent.
 */
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
  v_id   bigint;
  v_slot record;
begin
  select id into v_id
    from public.device_commands
   where device_id = p_device
     and body_hash = md5(p_body)
     and (
       status in ('pending', 'sent')
       or (status = 'done' and completed_at > now() - interval '1 hour')
     )
   order by id desc
   limit 1;

  if found then
    return v_id;
  end if;

  select * into v_slot from app.command_slot(p_body);

  if v_slot.pin is not null
     and (
       (v_slot.record_type = 'template')
       or (v_slot.record_type = 'user' and p_kind = 'user.update' and p_profile is null)
     )
     and exists (
       select 1
         from public.device_inventory i
        where i.device_id    = p_device
          and i.pin          = v_slot.pin
          and i.record_type  = v_slot.record_type
          and i.bio_type     = v_slot.bio_type
          and i.finger_index = v_slot.finger_index
     ) then
    return null;
  end if;

  insert into public.device_commands (device_id, kind, body, profile_id)
  values (p_device, p_kind, p_body, p_profile)
  returning id into v_id;

  return v_id;
end;
$$;

/*
 * A terminal that confirms an instruction now holds what it was sent, and one
 * that deleted a PIN no longer holds anything under it.
 *
 * A failed deletion also clears the slot. The usual reason a delete fails is
 * that the PIN was not there, and keeping a stale row would let a later merge
 * copy a deleted person back onto the other terminals.
 */
create or replace function app.record_delivery_in_inventory()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_slot record;
begin
  if new.status is not distinct from old.status then
    return new;
  end if;

  select * into v_slot from app.command_slot(new.body);
  if v_slot.pin is null or v_slot.record_type is null then
    return new;
  end if;

  if new.kind = 'user.delete' and new.status in ('done', 'failed') then
    delete from public.device_inventory
     where device_id = new.device_id
       and pin = v_slot.pin;
  elsif new.kind in ('user.update', 'biometric.update') and new.status = 'done' then
    insert into public.device_inventory
      (device_id, pin, record_type, bio_type, finger_index, command_body)
    values
      (new.device_id, v_slot.pin, v_slot.record_type, v_slot.bio_type, v_slot.finger_index, new.body)
    on conflict (device_id, pin, record_type, bio_type, finger_index)
      do update set command_body = excluded.command_body, reported_at = now();
  end if;

  return new;
end;
$$;

create trigger device_commands_update_inventory
  after update of status on public.device_commands
  for each row execute function app.record_delivery_in_inventory();

/*
 * A deletion performed on a terminal: clear it from the terminal it happened
 * on as well as from the others, so a merge never copies that person back.
 * Otherwise unchanged from 20260913090000.
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
  delete from public.device_inventory
   where device_id = p_except
     and pin = p_pin;

  perform app.fan_out_removal(p_pin, p_except);

  select id into v_profile from public.profiles where device_pin = p_pin;
  if v_profile is null then
    return;
  end if;

  delete from public.device_enrollments where profile_id = v_profile;
  delete from public.person_biometrics  where profile_id = v_profile;
end;
$$;

-- ---------------------------------------------------------------------------
-- An echo of a fingerprint is not a new fingerprint
--
-- Compared on the template bytes alone, not the whole line. A terminal writing
-- back what it was sent is free to renumber `Size` or flip `Valid`, and a
-- comparison that included those would treat the echo as new.
-- ---------------------------------------------------------------------------

create or replace function app.template_bytes(p_payload text)
returns text
language sql
immutable
as $$
  select substring(p_payload from '(?i)(?:^|\t)tmp=([^\t]*)');
$$;

comment on function app.template_bytes(text) is
  'The base64 template out of an FP or BIODATA field list, whichever case the firmware wrote the key in.';

/*
 * Keeps where a template was first captured when an upload repeats it.
 *
 * Named to sort after `person_biometrics_touch`: triggers of the same timing
 * fire alphabetically, and the touch trigger would otherwise stamp a fresh
 * `updated_at` on a row that did not change.
 */
create or replace function app.keep_unchanged_template()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if app.template_bytes(new.payload) is not distinct from app.template_bytes(old.payload)
     and new.dialect = old.dialect then
    new.payload          := old.payload;
    new.source_device_id := old.source_device_id;
    new.updated_at       := old.updated_at;
  end if;
  return new;
end;
$$;

create trigger person_biometrics_unchanged_keeps_source
  before update on public.person_biometrics
  for each row execute function app.keep_unchanged_template();

create or replace function app.fan_out_biometric()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if tg_op = 'DELETE' then
    if exists (select 1 from public.person_biometrics where profile_id = old.profile_id) then
      perform app.fan_out_person(old.profile_id, old.source_device_id);
    end if;
    return old;
  end if;

  -- A terminal reporting a template RadoFlow already holds has told us nothing.
  if tg_op = 'UPDATE'
     and app.template_bytes(new.payload) is not distinct from app.template_bytes(old.payload)
     and new.dialect = old.dialect then
    return new;
  end if;

  perform app.fan_out_person(new.profile_id, new.source_device_id);
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- A supervisor stays a supervisor, and a card stays on its owner
--
-- Every user record RadoFlow sent said `Pri=0` and `Card=`. On a ZKTeco
-- terminal that is not "leave these alone", it is "set these": pushing a
-- supervisor demotes them to an ordinary user who can no longer open the menu,
-- and pushing anyone with an RFID card wipes the card. A terminal left with no
-- administrator at all opens its menu to whoever presses the button.
-- ---------------------------------------------------------------------------

alter table public.profiles
  add column device_privilege smallint not null default 0
    check (device_privilege between 0 and 14),
  add column device_card text;

comment on column public.profiles.device_privilege is
  'Terminal privilege as the terminals last reported it: 0 ordinary user, 14 administrator. Sent back on every push so RadoFlow never demotes a supervisor.';
comment on column public.profiles.device_card is
  'RFID card number as the terminals last reported it. Sent back on every push so a sync never wipes a card.';

create or replace function app.userinfo_body(p_profile uuid)
returns text
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select 'DATA UPDATE USERINFO PIN=' || p.device_pin
      || chr(9) || 'Name='   || left(regexp_replace(coalesce(p.full_name, ''), '[\t\r\n]', ' ', 'g'), 24)
      || chr(9) || 'Pri='    || p.device_privilege
      || chr(9) || 'Passwd='
      || chr(9) || 'Card='   || regexp_replace(coalesce(p.device_card, ''), '[\t\r\n]', '', 'g')
      || chr(9) || 'Grp=1'
      || chr(9) || 'TZ=0000000000000000'
      || chr(9) || 'Verify=-1'
    from public.profiles p
   where p.id = p_profile
     and p.device_pin is not null;
$$;

-- ---------------------------------------------------------------------------
-- Many instructions, one round trip
-- ---------------------------------------------------------------------------

create or replace function public.queue_device_commands(p_commands jsonb)
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_start bigint;
  v_row   jsonb;
  v_id    bigint;
  v_seen  bigint[] := '{}';
begin
  select coalesce(max(id), 0) into v_start from public.device_commands;

  for v_row in select value from jsonb_array_elements(coalesce(p_commands, '[]'::jsonb)) loop
    v_id := app.queue_device_command(
      (v_row->>'device_id')::uuid,
      v_row->>'kind',
      v_row->>'body',
      nullif(v_row->>'profile_id', '')::uuid
    );
    if v_id > v_start and not (v_id = any (v_seen)) then
      v_seen := v_seen || v_id;
    end if;
  end loop;

  return coalesce(array_length(v_seen, 1), 0);
end;
$$;

revoke execute on function public.queue_device_commands(jsonb) from public, anon, authenticated;
grant execute on function public.queue_device_commands(jsonb) to service_role;

-- ---------------------------------------------------------------------------
-- Handing out work, and taking back work nobody answered for
--
-- An unanswered row is offered again after five minutes, and abandoned after
-- its third delivery so a command the firmware silently ignores cannot
-- circulate for ever. `for update skip locked` makes two overlapping polls from
-- the same terminal take different rows instead of the same twelve.
-- ---------------------------------------------------------------------------

create or replace function public.claim_device_commands(p_device uuid, p_limit integer default 12)
returns table (command_id bigint, command_body text)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  update public.device_commands
     set status       = 'failed',
         completed_at = now(),
         last_error   = 'No result reported after ' || attempts || ' deliveries'
   where device_id = p_device
     and status = 'sent'
     and sent_at < now() - interval '5 minutes'
     and attempts >= 3;

  update public.device_commands
     set status = 'pending'
   where device_id = p_device
     and status = 'sent'
     and sent_at < now() - interval '5 minutes';

  return query
  with next_rows as (
    select c.id
      from public.device_commands c
     where c.device_id = p_device
       and c.status = 'pending'
     order by c.id
     limit greatest(p_limit, 1)
     for update skip locked
  )
  update public.device_commands c
     set status   = 'sent',
         sent_at  = now(),
         attempts = c.attempts + 1
    from next_rows
   where c.id = next_rows.id
  returning c.id, c.body;
end;
$$;

revoke execute on function public.claim_device_commands(uuid, integer) from public, anon, authenticated;
grant execute on function public.claim_device_commands(uuid, integer) to service_role;

-- ---------------------------------------------------------------------------
-- Merging the rosters
--
-- For each terminal in `p_order`, every user record and every finger that some
-- other terminal holds and this one lacks is queued for it. Where more than
-- one terminal holds the missing slot, the one earliest in `p_order` supplies
-- it — so ['check-in', 'check-out', 'kitchen'] means "the check-in gate's
-- version first, then the check-out gate's, then the kitchen's".
--
-- Nothing a terminal already holds is touched. User records are queued before
-- fingers, because a terminal discards a template for a PIN it has never seen.
-- Anyone RadoFlow has suspended or terminated is not copied anywhere.
--
-- Safe to run again: a second run finds the same gaps already queued.
-- ---------------------------------------------------------------------------

create or replace function public.reconcile_rosters(p_order uuid[])
returns table (target_device uuid, users_queued integer, templates_queued integer)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_target uuid;
  v_row    record;
begin
  foreach v_target in array p_order loop
    users_queued := 0;
    templates_queued := 0;

    for v_row in
      select *
        from (
          select distinct on (i.pin, i.record_type, i.bio_type, i.finger_index)
                 i.pin, i.record_type, i.bio_type, i.finger_index, i.command_body
            from public.device_inventory i
           where i.device_id <> v_target
             and i.device_id = any (p_order)
             and not exists (
               select 1
                 from public.device_inventory t
                where t.device_id    = v_target
                  and t.pin          = i.pin
                  and t.record_type  = i.record_type
                  and t.bio_type     = i.bio_type
                  and t.finger_index = i.finger_index
             )
             and not exists (
               select 1 from public.profiles p
                where p.device_pin = i.pin
                  and p.status <> 'active'
             )
           order by i.pin, i.record_type, i.bio_type, i.finger_index,
                    array_position(p_order, i.device_id)
        ) picked
       order by (picked.record_type = 'template'), picked.pin::bigint,
                picked.bio_type, picked.finger_index
    loop
      if app.queue_device_command(
           v_target,
           case when v_row.record_type = 'user' then 'user.update' else 'biometric.update' end,
           v_row.command_body,
           null
         ) is not null then
        if v_row.record_type = 'user' then
          users_queued := users_queued + 1;
        else
          templates_queued := templates_queued + 1;
        end if;
      end if;
    end loop;

    target_device := v_target;
    return next;
  end loop;
end;
$$;

comment on function public.reconcile_rosters(uuid[]) is
  'Queues, for each terminal, every user and finger another terminal holds and it lacks, taking the version from the terminal earliest in p_order. Never overwrites a slot a terminal already holds.';

revoke execute on function public.reconcile_rosters(uuid[]) from public, anon, authenticated;
grant execute on function public.reconcile_rosters(uuid[]) to service_role;

-- ---------------------------------------------------------------------------
-- The resync button assumes an empty terminal
--
-- "Send every worker to this terminal" exists for a box that was replaced or
-- wiped. Its inventory still describes the old one, and the queue would read
-- that as "already holds every finger" and send names with no fingerprints.
-- So the inventory is cleared first. Otherwise unchanged from 20260913090000.
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

  delete from public.device_inventory where device_id = p_device;

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
