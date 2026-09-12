-- ============================================================================
-- A fingerprint or a face travelling between terminals takes nothing else
-- with it.
--
-- When a terminal captures a template for a person RadoFlow knows, the
-- template fans out to the other terminals through `app.push_person_to_device`.
-- That function sends the person's user record first — a terminal discards a
-- template for a PIN it has never seen — and it sends RadoFlow's version of the
-- record: RadoFlow's name, RadoFlow's card, carrying the profile id.
--
-- The profile id is what lets an office edit through the rule that a terminal
-- is never sent a user record it already holds. On the template path it let
-- through something nobody asked for. On 12 September, while the two gates
-- exchanged their faces, a face for PIN 1 fanned out from the check-out gate
-- and took with it a user record that would have put card 9984165 on the
-- check-in gate's copy of PIN 1 — a record the owner had asked to be left as
-- each gate holds it. It was withdrawn by hand. The same path would quietly
-- rename any of the nineteen workers whose names are still awaiting the
-- office, on whichever gate they happen to enrol a finger next.
--
-- So the push now says why it is happening:
--
--   - The office changed the person (a name, a number, reinstatement) or a
--     terminal is being repopulated: RadoFlow is the authority, and the user
--     record is sent whether or not the terminal holds one. Unchanged.
--   - A terminal captured a template: the user record is sent only to a
--     terminal that does not hold that PIN at all, which is the one case the
--     template genuinely needs it. A terminal that already has the person
--     keeps its name and card exactly as they are.
--
-- Templates themselves were already additive and are untouched.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- Pushing one person to one terminal
--
-- Dropped rather than replaced: adding a defaulted argument alongside the
-- two-argument version would leave two candidates for every existing call and
-- Postgres would refuse all of them as ambiguous. Every caller uses the first
-- two arguments only, so every caller keeps its old meaning.
--
-- Otherwise unchanged from 20260916090000.
-- ---------------------------------------------------------------------------

drop function if exists app.push_person_to_device(uuid, uuid);

create function app.push_person_to_device(
  p_profile         uuid,
  p_device          uuid,
  p_assert_identity boolean default true
)
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
  select device_pin into v_pin
    from public.profiles
   where id = p_profile
     and status = 'active';

  -- No number yet, or no longer active. Either way there is nothing to enrol.
  if v_pin is null then
    return;
  end if;

  v_body := app.userinfo_body(p_profile);
  if v_body is null then
    return;
  end if;

  if p_assert_identity
     or not exists (
       select 1
         from public.device_inventory i
        where i.device_id   = p_device
          and i.pin         = v_pin
          and i.record_type = 'user'
     ) then
    perform app.queue_device_command(p_device, 'user.update', v_body, p_profile);
  end if;

  -- Fingers and faces alike, after the user record: a terminal discards a
  -- template for a PIN it has never seen.
  for v_bio in
    select dialect, payload
      from public.person_biometrics
     where profile_id = p_profile
     order by bio_type, finger_index
  loop
    perform app.queue_device_command(
      p_device,
      'biometric.update',
      case v_bio.dialect
        when 'fp'   then 'DATA UPDATE FINGERTMP ' || v_bio.payload
        when 'face' then 'DATA UPDATE FACE '      || v_bio.payload
        else             'DATA UPDATE BIODATA '   || v_bio.payload
      end,
      p_profile
    );
  end loop;
end;
$$;

comment on function app.push_person_to_device(uuid, uuid, boolean) is
  'Queues one active person for one terminal. With p_assert_identity (the default, for office edits and resyncs) RadoFlow''s user record is sent regardless; without it (a template fanning out) the user record goes only to a terminal that does not hold the PIN.';

-- ---------------------------------------------------------------------------
-- The same person, to every terminal but the one they were enrolled on
--
-- Dropped for the same reason. Unchanged from 20260913090000 apart from
-- passing the reason through.
-- ---------------------------------------------------------------------------

drop function if exists app.fan_out_person(uuid, uuid);

create function app.fan_out_person(
  p_profile         uuid,
  p_except          uuid    default null,
  p_assert_identity boolean default true
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_device uuid;
begin
  for v_device in select app.sync_targets(p_except) loop
    perform app.push_person_to_device(p_profile, v_device, p_assert_identity);
  end loop;
end;
$$;

-- ---------------------------------------------------------------------------
-- A template captured on a terminal is the one caller that does not assert
--
-- Unchanged from 20260915090000 apart from the third argument.
-- ---------------------------------------------------------------------------

create or replace function app.fan_out_biometric()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if tg_op = 'DELETE' then
    if exists (select 1 from public.person_biometrics where profile_id = old.profile_id) then
      perform app.fan_out_person(old.profile_id, old.source_device_id, false);
    end if;
    return old;
  end if;

  -- A terminal reporting a template RadoFlow already holds has told us nothing.
  if tg_op = 'UPDATE'
     and app.template_bytes(new.payload) is not distinct from app.template_bytes(old.payload)
     and new.dialect = old.dialect then
    return new;
  end if;

  perform app.fan_out_person(new.profile_id, new.source_device_id, false);
  return new;
end;
$$;
