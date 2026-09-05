-- ============================================================================
-- Attribute orphan punches when an enrolment is (re)synced
--
-- The manual "link enrolment" screen is gone. It was the only thing that
-- back-filled profile_id on punches already stored against an unrecognised
-- terminal id — the trigger below only ever wrote device_enrollments, never
-- touched punches already on record. With the screen gone the sole remaining
-- way to fix a mismatched employee code was editing it, which only affects
-- punches arriving from that point on: hours already punched against the old,
-- unclaimed id would sit unreachable by any timesheet forever.
--
-- This extends app.sync_device_enrollments() — defined in
-- 20260815100000_shifts_and_rates.sql, not touched here — so that whenever it
-- runs (a profile's employee_code or site changes) it also claims any punch
-- already sitting under that enrolment number with no owner. The function
-- body below is the existing one verbatim, plus that one addition.
-- ============================================================================

create or replace function app.sync_device_enrollments()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if new.site_id is null then
    return new;
  end if;

  insert into public.device_enrollments (device_id, device_user_id, profile_id)
  select d.id, new.employee_code, new.id
    from public.devices d
   where d.site_id = new.site_id
     and d.is_active
  on conflict (device_id, device_user_id)
    do update set profile_id = excluded.profile_id;

  -- A renamed employee code leaves its old mapping behind; drop it so punches
  -- cannot keep arriving under a code that no longer identifies anyone.
  if tg_op = 'UPDATE' and old.employee_code is distinct from new.employee_code then
    delete from public.device_enrollments
     where profile_id = new.id
       and device_user_id = old.employee_code;
  end if;

  /*
   * Attribute punches already recorded against this enrolment number.
   *
   * A terminal stores its own enroll id, and a punch arriving before anyone
   * claimed that id is kept with a null profile_id rather than dropped. The
   * manual re-link screen used to be what rescued those; with it gone this is
   * the only path, and without it a worker's recorded hours would sit in the
   * table unreachable by any timesheet.
   *
   * This attributes the punches; it does not itself recompute hours.
   * attendance_days for the affected dates is recomputed the next time
   * ingestion runs for that person and date, the same as any other punch
   * that arrives late.
   */
  update public.punches p
     set profile_id = new.id
   where p.profile_id is null
     and p.device_user_id = new.employee_code
     and p.device_id in (
       select d.id from public.devices d
        where d.site_id = new.site_id and d.is_active
     );

  return new;
end;
$$;
