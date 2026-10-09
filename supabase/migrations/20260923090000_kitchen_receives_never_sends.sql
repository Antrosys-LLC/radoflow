-- ============================================================================
-- The kitchen receives the gates' roster and gives nothing back.
--
-- Until now the three terminals were peers: whatever any one of them held, the
-- other two were sent. That is right for the two gates, which must agree about
-- who may come and go. It is wrong for the kitchen counter, which holds a long
-- tail of people nobody wants at the gates — and which, being a peer, would
-- have them copied there by the merge, relayed there on every roster upload,
-- and deleted from there whenever somebody pressed DELETE on the counter.
--
-- So a terminal now has a `sync_role`:
--
--   peer          exchanges users and fingers with every other terminal.
--                 The default, and what both gates are.
--   receive_only  is sent everything the peers hold and nothing it holds ever
--                 travels onward. The kitchen.
--
-- What "receive only" means, path by path:
--
--   - merge:        peers are donors; a receive-only terminal is only a target.
--                   Gate to gate is unchanged.
--   - enrolment:    a finger or face captured on it is stored centrally but is
--                   not queued to anyone (`app.fan_out_person`).
--   - roster upload: strangers on it are not relayed (src/lib/devices/user-sync.ts).
--   - deletion:     DELETE pressed on it clears that terminal and nothing else
--                   (`fan_out_removal_from_device`). People removed from the
--                   gates are still removed from it, via the ordinary fan-out.
--
-- Nothing already on the kitchen is replaced or removed: it is still only ever
-- sent a slot it lacks.
-- ============================================================================

alter table public.devices
  add column sync_role text not null default 'peer'
    check (sync_role in ('peer', 'receive_only'));

comment on column public.devices.sync_role is
  'peer: exchanges users and fingers with every other terminal. receive_only: is sent what the peers hold and nothing on it is ever copied elsewhere.';

update public.devices set sync_role = 'receive_only' where purpose = 'canteen';

-- ---------------------------------------------------------------------------
-- Enrolment on a receive-only terminal goes nowhere
-- ---------------------------------------------------------------------------

create or replace function app.fan_out_person(
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
  if p_except is not null
     and exists (
       select 1 from public.devices d
        where d.id = p_except and d.sync_role = 'receive_only'
     ) then
    return;
  end if;

  for v_device in select app.sync_targets(p_except) loop
    perform app.push_person_to_device(p_profile, v_device, p_assert_identity);
  end loop;
end;
$$;

-- ---------------------------------------------------------------------------
-- A deletion on a receive-only terminal clears that terminal
--
-- Otherwise unchanged from 20260915090000.
-- ---------------------------------------------------------------------------

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

  -- The counter's own clean-up is not a decision about the gates, nor about the
  -- master copy of the person's fingerprints.
  if exists (
    select 1 from public.devices d
     where d.id = p_except and d.sync_role = 'receive_only'
  ) then
    return;
  end if;

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
-- Administrators, donors from peers only
--
-- Otherwise unchanged from 20260917090000. `p_order` is still the list of
-- terminals the merge covers; the record to copy is now taken from a peer.
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
        join public.devices d on d.id = i.device_id
       where i.device_id   = any (p_order)
         and d.sync_role   = 'peer'
         and i.pin         = v_admin.device_pin
         and i.record_type = 'user'
       order by array_position(p_order, i.device_id)
       limit 1;
    end if;

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

-- ---------------------------------------------------------------------------
-- The merge: peers give, everyone receives
--
-- Otherwise unchanged from 20260917090000. The return type is the same, so the
-- function is replaced in place.
-- ---------------------------------------------------------------------------

create or replace function public.reconcile_rosters(p_order uuid[])
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
            join public.devices d on d.id = i.device_id
           where i.device_id <> v_target
             and i.device_id = any (p_order)
             -- Only a peer's roster is ever copied anywhere.
             and d.sync_role = 'peer'
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

    admins_restored := app.restore_administrators(v_target, p_order);

    target_device := v_target;
    return next;
  end loop;
end;
$$;

comment on function public.reconcile_rosters(uuid[]) is
  'Queues, for each terminal, every user and finger a peer terminal holds and it lacks, taking the version from the peer earliest in p_order, then asserts every RadoFlow administrator onto it. A receive-only terminal is a target and never a donor. Never overwrites a slot a terminal already holds, except an administrator''s privilege.';
