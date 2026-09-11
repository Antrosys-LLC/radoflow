-- ============================================================================
-- Suspending or terminating somebody takes their gate access with it.
--
-- 20260913090000 made the three terminals agree with each other: enrol or
-- delete on any one and the other two follow. It did not connect a person's
-- employment status to the hardware, which left a gap wide enough to matter —
-- somebody marked terminated in the office kept a working fingerprint on all
-- three boxes until a supervisor happened to walk up to one and delete them by
-- hand. The office had every reason to believe that was already done.
--
-- The gap was also self-inconsistent. `app.resync_device` already refused to
-- enrol non-active staff, so rebuilding a terminal quietly dropped them while
-- a terminal that was merely running kept letting them in. Two answers to the
-- same question depending on whether a box had been replaced recently.
--
-- Suspension and termination are treated identically here. They differ in what
-- the office means by them and in what payroll does about them, but neither is
-- a person who should be opening the gate this afternoon.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- Nobody but active staff is ever pushed to a terminal
--
-- Enforced at the single point every enrolment passes through, rather than at
-- each of the four callers. The three fan-out triggers, the resync button and
-- anything written later all inherit it, and none of them has to remember.
--
-- This closes a live re-entry route as well: `profiles_fan_out_identity` fires
-- on a name or code edit, so correcting the spelling of a terminated worker's
-- name would have pushed a fresh USERINFO record and handed them the gate back.
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

-- ---------------------------------------------------------------------------
-- The status change itself
--
-- Templates are deliberately kept. This is the one place where that differs
-- from a deletion performed on a terminal, and the difference is real: a
-- supervisor deleting somebody at the gate has unenrolled them, so their
-- fingerprints go, whereas a suspension is a decision the office expects to
-- revisit. Keeping the master copy means reinstating somebody is a status
-- change rather than a queue at the enrolment terminal with four hundred
-- people's fingers to re-scan.
--
-- Keeping them is only safe because nothing can now push a non-active person:
-- the guard above holds for the resync button as much as for the triggers.
-- ---------------------------------------------------------------------------

create or replace function app.fan_out_profile_status()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if old.status is not distinct from new.status then
    return new;
  end if;

  -- Nobody has enrolled them anywhere yet, so there is nothing to withdraw.
  if new.device_pin is null then
    return new;
  end if;

  if new.status = 'active' then
    -- Reinstated. Their user record and every template they own go back to
    -- every terminal, including the one they were originally enrolled on —
    -- that box removed them too.
    perform app.fan_out_person(new.id, null);
  else
    perform app.fan_out_removal(new.device_pin, null);
  end if;

  return new;
end;
$$;

comment on function app.fan_out_profile_status() is
  'Withdraws a suspended or terminated person from every terminal, and puts them back when they are made active again. Their stored templates are kept either way, so reinstatement needs no re-scan.';

create trigger profiles_fan_out_status
  after update of status on public.profiles
  for each row execute function app.fan_out_profile_status();

-- ---------------------------------------------------------------------------
-- Anybody already in the wrong state
--
-- The trigger only sees changes made after it exists. Someone terminated last
-- month is still on all three terminals right now, which is the situation this
-- migration was written about — so they are withdrawn here, once.
-- ---------------------------------------------------------------------------

do $$
declare
  v_person record;
begin
  for v_person in
    select device_pin from public.profiles
     where status <> 'active' and device_pin is not null
  loop
    perform app.fan_out_removal(v_person.device_pin, null);
  end loop;
end;
$$;
