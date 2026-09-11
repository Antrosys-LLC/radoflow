-- ============================================================================
-- Faces, not only fingerprints.
--
-- The MB460 enrols faces, and at the check-in gate most of the people who have
-- one clock in with it: its roster upload carried 415 users, 396 fingers and
-- over nine hundred face lines. RadoFlow's parser knew `USER`, `FP` and
-- `BIODATA` and skipped everything else without a word, so every face was
-- dropped. A worker enrolled by face at the gate would have reached the other
-- two terminals as a name with nothing to verify them by.
--
-- A face arrives as up to twelve parts, one line each:
--
--   FACE PIN=2  FID=0..11  SIZE=1648  VALID=1  TMP=<base64>
--
-- and is sent back with `DATA UPDATE FACE` and the same fields. Each part is
-- stored and synced exactly like a finger: Type 2, with FID as the index. The
-- additive rule applies per part, so a terminal never has a part it holds
-- replaced.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- Stored templates may be faces, with part numbers past nine
--
-- The old limits are dropped by what they check rather than by name, so this
-- does not depend on the names Postgres chose when the columns were created.
-- ---------------------------------------------------------------------------

do $$
declare
  c record;
begin
  for c in
    select conname
      from pg_constraint
     where conrelid = 'public.person_biometrics'::regclass
       and contype = 'c'
       and (pg_get_constraintdef(oid) ilike '%dialect%'
            or pg_get_constraintdef(oid) ilike '%finger_index%')
  loop
    execute format('alter table public.person_biometrics drop constraint %I', c.conname);
  end loop;
end;
$$;

alter table public.person_biometrics
  add constraint person_biometrics_dialect_check
    check (dialect in ('fp', 'biodata', 'face')),
  -- Fingers are 0-9; face parts run 0-11. A little headroom for firmware that
  -- numbers further, rather than a constraint that fails an upload at the gate.
  add constraint person_biometrics_finger_index_check
    check (finger_index between 0 and 15);

comment on column public.person_biometrics.dialect is
  '''fp'' = legacy FP line, ''biodata'' = BIODATA line, ''face'' = FACE part line. Replayed with FINGERTMP, BIODATA or FACE respectively.';

-- ---------------------------------------------------------------------------
-- The slot a FACE instruction is about
--
-- Unchanged from 20260915090000 apart from the FACE branch.
-- ---------------------------------------------------------------------------

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
  elsif p_body ~* '^DATA UPDATE FACE' then
    record_type  := 'template';
    bio_type     := 2;
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
-- A stored face is pushed as a face
--
-- Unchanged from 20260914090000 apart from the FACE verb.
-- ---------------------------------------------------------------------------

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

  perform app.queue_device_command(p_device, 'user.update', v_body, p_profile);

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
