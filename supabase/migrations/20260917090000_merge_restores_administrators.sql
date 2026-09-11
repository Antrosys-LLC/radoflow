-- ============================================================================
-- The merge makes the three rosters one, and an administrator stays one.
--
-- `reconcile_rosters` was written to be additive: a terminal is only ever sent
-- a slot it lacks, and nothing it already holds is replaced. That is the right
-- rule for a fingerprint — another box's scan of the same finger is not better
-- than the one already there — and the wrong rule for a privilege.
--
-- The check-in gate holds PIN 1 as `Pri=0` and the check-out gate holds the
-- same person as `Pri=14`. Under the additive rule the merge leaves both
-- exactly as they are, so the gate keeps a locked menu for ever. A terminal
-- with no administrator at all opens its menu to whoever presses the button.
--
-- So the merge now ends with one narrow exception: every person RadoFlow knows
-- to be an administrator is asserted as one on every terminal, using that
-- terminal's own record so only `Pri` changes. PIN 1 is one person under two
-- names on the two gates — "UmarCEO" on the check-in, "Antrosys" on the
-- check-out — and restoring their menu access must not rename them on either.
--
-- The upload path does the same thing continuously: see `adminCorrections` in
-- src/lib/devices/roster-plan.ts. This is the one-off sweep for terminals that
-- are not going to upload first.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- The same user record, at a stated privilege
--
-- Rewrites the `Pri` field of a USERINFO body and touches nothing else. A body
-- with no `Pri` field is returned unchanged rather than repaired: every record
-- this system has ever built or parsed carries one, and inventing a field for
-- a line whose shape we have not seen is how a terminal is handed something it
-- reads as corrupt.
-- ---------------------------------------------------------------------------

create or replace function app.userinfo_at_privilege(p_body text, p_privilege smallint)
returns text
language sql
immutable
as $$
  select regexp_replace(p_body, '(?i)(^|\t)Pri=[0-9]*', '\1Pri=' || p_privilege);
$$;

comment on function app.userinfo_at_privilege(text, smallint) is
  'A USERINFO body with only its Pri field changed, so restoring an administrator never renames them or drops their card.';

-- ---------------------------------------------------------------------------
-- Asserting the administrators onto one terminal
--
-- For each active person RadoFlow holds at a privilege above ordinary, the
-- record queued is:
--
--   1. the target's own record for that PIN, if it has one — so its name and
--      card survive; otherwise
--   2. the record from the terminal earliest in `p_order` that holds the PIN —
--      the same precedence the merge itself uses; otherwise
--   3. nothing. No terminal has ever reported this PIN, so there is no record
--      to correct. `resync_device` is what puts a person on an empty box.
--
-- Queued with the profile id, which is what carries it past the rule that a
-- terminal is never sent a user record it already holds: that rule exists to
-- stop one terminal overwriting another, and this is not one terminal. It is
-- the office, which is the authority on who administers a box.
--
-- A terminal whose own record already reads at the right privilege is sent
-- nothing. Passing the profile id switches off the check that would otherwise
-- have caught that, so the same restraint is applied here by hand: a merge
-- across three correct terminals must queue nothing at all, or "nothing to
-- send" stops being a thing the screen can truthfully say.
-- ---------------------------------------------------------------------------

create or replace function app.restore_administrators(p_target uuid, p_order uuid[])
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_admin     record;
  v_held      text;
  v_body      text;
  v_corrected text;
  v_count     integer := 0;
begin
  for v_admin in
    select p.id, p.device_pin, p.device_privilege
      from public.profiles p
     where p.device_pin is not null
       and p.status = 'active'
       and p.device_privilege > 0
  loop
    select i.command_body into v_held
      from public.device_inventory i
     where i.device_id   = p_target
       and i.pin         = v_admin.device_pin
       and i.record_type = 'user';

    v_body := v_held;

    if v_body is null then
      select i.command_body into v_body
        from public.device_inventory i
       where i.device_id   = any (p_order)
         and i.pin         = v_admin.device_pin
         and i.record_type = 'user'
       order by array_position(p_order, i.device_id)
       limit 1;
    end if;

    -- No terminal has ever reported this PIN. There is no record to correct,
    -- and inventing one is `resync_device`'s job, not the merge's.
    if v_body is null then
      continue;
    end if;

    v_corrected := app.userinfo_at_privilege(v_body, v_admin.device_privilege);

    if v_corrected is not distinct from v_held then
      continue;
    end if;

    if app.queue_device_command(p_target, 'user.update', v_corrected, v_admin.id) is not null then
      v_count := v_count + 1;
    end if;
  end loop;

  return v_count;
end;
$$;

comment on function app.restore_administrators(uuid, uuid[]) is
  'Queues, for one terminal, every active administrator RadoFlow knows, at their RadoFlow privilege and under the name and card that terminal already has for them.';

-- ---------------------------------------------------------------------------
-- The merge, now with the exception on the end
--
-- Otherwise unchanged from 20260915090000. The return type gains a column, so
-- the function is dropped rather than replaced.
-- ---------------------------------------------------------------------------

drop function if exists public.reconcile_rosters(uuid[]);

create function public.reconcile_rosters(p_order uuid[])
returns table (
  target_device    uuid,
  users_queued     integer,
  templates_queued integer,
  admins_restored  integer
)
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

    -- Last, so an administrator who was copied across in this same run is
    -- corrected rather than left at whichever privilege the donor terminal had.
    admins_restored := app.restore_administrators(v_target, p_order);

    target_device := v_target;
    return next;
  end loop;
end;
$$;

comment on function public.reconcile_rosters(uuid[]) is
  'Queues, for each terminal, every user and finger another terminal holds and it lacks, taking the version from the terminal earliest in p_order, then asserts every RadoFlow administrator onto it. Never overwrites a slot a terminal already holds, except an administrator''s privilege.';

revoke execute on function public.reconcile_rosters(uuid[]) from public, anon, authenticated;
grant execute on function public.reconcile_rosters(uuid[]) to service_role;

-- ---------------------------------------------------------------------------
-- Who may run the merge
--
-- `reconcile_rosters` is service_role only, which suited a function called
-- from a script and does not suit a button. The wrapper is the pattern
-- `resync_device` already uses: the permission check lives inside the
-- function, where a caller cannot skip it, and the user's own client is what
-- reaches it.
-- ---------------------------------------------------------------------------

create or replace function public.merge_terminal_rosters()
returns table (
  target_device    uuid,
  users_queued     integer,
  templates_queued integer,
  admins_restored  integer
)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_order uuid[];
begin
  if not app.can('devices.manage') then
    raise exception 'Not allowed to sync devices.' using errcode = 'insufficient_privilege';
  end if;

  /*
   * Precedence, as the setup notes state it: the check-in gate's records go to
   * the other two, then the check-out gate's, then the kitchen's. Read off
   * what each terminal is for rather than from a list of ids, so replacing a
   * box does not silently drop it out of the merge.
   */
  select array_agg(d.id order by
           case
             when d.purpose = 'attendance' and d.direction = 'in'  then 1
             when d.purpose = 'attendance' and d.direction = 'out' then 2
             when d.purpose = 'canteen'                            then 3
             else 4
           end,
           d.name)
    into v_order
    from public.devices d
   where d.is_active;

  if v_order is null or array_length(v_order, 1) < 2 then
    raise exception 'A merge needs at least two active terminals.';
  end if;

  return query select * from public.reconcile_rosters(v_order);
end;
$$;

comment on function public.merge_terminal_rosters() is
  'The merge as the Biometric Devices screen runs it: every active terminal, in check-in, check-out, kitchen order.';

revoke execute on function public.merge_terminal_rosters() from public, anon;
grant execute on function public.merge_terminal_rosters() to authenticated, service_role;
