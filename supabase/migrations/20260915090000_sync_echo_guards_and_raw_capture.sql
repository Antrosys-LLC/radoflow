-- ============================================================================
-- The three terminals looped, and this is what stops it happening again.
--
-- On the first day the MB460s were live, the queue went from a few dozen
-- instructions a minute to over eight hundred. A terminal that applies a user
-- or a fingerprint it was sent reports that record straight back, as if it had
-- just been enrolled there. The upload was stored, the store fanned out, the
-- fan-out was applied, and the apply was reported back. The same unknown
-- worker's record was queued twenty times in fifteen minutes. The terminals
-- were switched to pull mode — which stops all fan-out — and the backlog was
-- cleared by hand.
--
-- Three things are fixed here:
--
--   1. An upload that carries a template RadoFlow already holds, byte for byte,
--      changes nothing and fans out nowhere. That single rule is what breaks
--      the loop: the echo of a fingerprint is, by definition, the fingerprint.
--   2. The queue refuses an instruction a terminal has already been given and
--      acted on recently, not only one still waiting. Unknown workers have no
--      stored template to compare against, so this is their loop-breaker.
--   3. What the terminals actually send is kept. The kitchen's command results
--      were never recognised, and the "deleted user" audit code that removed a
--      working employee from the check-in gate was assumed from documentation
--      for other models. Neither can be diagnosed from a log line that has
--      scrolled away on a Railway instance.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- What a terminal sent, verbatim
--
-- Excerpted to 16 KB. A full roster upload is a megabyte of base64 and the
-- purpose here is to see its shape, not to archive it — the templates that
-- matter are already in person_biometrics.
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
 * Refuses a duplicate that is waiting, in flight, or was acted on within the
 * last hour.
 *
 * The hour is for echoes, which arrive within a poll or two of delivery. It is
 * short enough that a deliberate re-send — a replaced terminal being
 * repopulated the next morning — goes through, and anything that genuinely
 * needs to repeat sooner can be requeued from the devices screen.
 *
 * `failed` rows never block. A refused instruction is exactly one that should
 * be allowed to try again.
 */
/*
 * Records a terminal has itself told us it holds.
 *
 * Only needed for workers RadoFlow does not know, whose records are relayed
 * verbatim rather than fanned out from a stored template. Without it, a
 * stranger uploaded by the kitchen was relayed to both gates, one gate
 * reported the record back after applying it, and that report was relayed on
 * to the kitchen — the terminal it came from. In testing that was 790
 * instructions for the kitchen to rewrite records it already had.
 *
 * One row per terminal per record, refreshed on each report, so this stays
 * the size of the roster rather than growing with traffic.
 */
create table public.device_reported_records (
  device_id    uuid not null references public.devices (id) on delete cascade,
  body_hash    text not null,
  reported_at  timestamptz not null default now(),
  primary key (device_id, body_hash)
);

comment on table public.device_reported_records is
  'Which terminal reported which relayed record, so a record is never queued back to the terminal it came from. Keyed by md5 of the instruction body.';

alter table public.device_reported_records enable row level security;

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

  /*
   * The terminal reported this exact record within the hour, so it is where
   * the record came from. Returns null because nothing was queued.
   */
  if exists (
    select 1
      from public.device_reported_records r
     where r.device_id = p_device
       and r.body_hash = md5(p_body)
       and r.reported_at > now() - interval '1 hour'
  ) then
    return null;
  end if;

  insert into public.device_commands (device_id, kind, body, profile_id)
  values (p_device, p_kind, p_body, p_profile)
  returning id into v_id;

  return v_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- An echo of a fingerprint is not a new fingerprint
--
-- Compared on the template bytes alone, not the whole line. A terminal writing
-- back what it was sent is free to renumber `Size` or flip `Valid`, and a
-- comparison that included those would treat the echo as new and carry on
-- looping.
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

  /*
   * The loop-breaker. A terminal reporting a template RadoFlow already holds
   * has told us nothing, and sending it on would make every other terminal do
   * the same.
   */
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
--
-- So the values a terminal reports are kept, and sent back unchanged.
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
--
-- A roster upload used to queue each relayed record with its own HTTP call to
-- the database. Four hundred workers took long enough that the relay gave up
-- at thirty seconds, the terminal read the timeout as a failed upload, and it
-- sent the whole roster again thirty seconds later — forever. This takes the
-- whole batch at once and returns how many rows were genuinely new.
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
-- Rows used to be stamped `sent` and left there if the terminal never reported
-- a result — twelve on each terminal were stuck that way within the first hour.
-- Now an unanswered row is offered again after five minutes, and abandoned
-- after its third delivery so a command the firmware silently ignores cannot
-- circulate for ever.
--
-- `for update skip locked` makes two overlapping polls from the same terminal
-- take different rows instead of the same twelve.
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
