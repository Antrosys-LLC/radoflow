-- ============================================================================
-- An administrator on the gates is an administrator on the kitchen too.
--
-- PIN 10000 is the super administrator on both gates. It is not necessarily a
-- RadoFlow profile, and `app.restore_administrators` only knew administrators
-- through `profiles.device_privilege`; for anyone else the merge could copy the
-- record across when the kitchen lacked it but could never raise it when the
-- kitchen already held the PIN as an ordinary user, because the queue refuses a
-- relayed user record for a PIN the target holds.
--
-- Now an administrator is whoever either RadoFlow or a peer terminal says is
-- one, at the highest privilege anyone reports. Privilege is still learned
-- upward only, and still only `Pri` is rewritten: the terminal's own name and
-- card survive.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- The queue can be told an instruction is deliberate
--
-- Dropped rather than replaced, for the reason given in 20260918090000: a
-- defaulted argument beside the old signature would make every call ambiguous.
-- Every existing caller passes four arguments and keeps its meaning.
-- ---------------------------------------------------------------------------

drop function if exists app.queue_device_command(uuid, text, text, uuid);

create function app.queue_device_command(
  p_device    uuid,
  p_kind      text,
  p_body      text,
  p_profile   uuid    default null,
  -- True for an instruction that must overwrite a user record the terminal
  -- already holds: today only an administrator's privilege being restored.
  p_assert    boolean default false
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
     and not p_assert
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

-- ---------------------------------------------------------------------------
-- Asserting the administrators onto one terminal
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
  v_held_pri  integer;
  v_body      text;
  v_corrected text;
  v_count     integer := 0;
begin
  for v_admin in
    with peer_pri as (
      select i.pin,
             max(coalesce(substring(i.command_body from '(?i)(?:^|\t)Pri=([0-9]+)')::integer, 0)) as pri
        from public.device_inventory i
        join public.devices d on d.id = i.device_id
       where i.device_id   = any (p_order)
         and d.sync_role   = 'peer'
         and i.record_type = 'user'
       group by i.pin
    )
    select coalesce(p.device_pin, pp.pin) as pin,
           p.id as profile_id,
           greatest(coalesce(p.device_privilege, 0), coalesce(pp.pri, 0)) as privilege
      from public.profiles p
      full join peer_pri pp on pp.pin = p.device_pin
     where greatest(coalesce(p.device_privilege, 0), coalesce(pp.pri, 0)) > 0
       -- Somebody RadoFlow has suspended or terminated is not restored to anything.
       and (p.id is null or p.status = 'active')
       and coalesce(p.device_pin, pp.pin) is not null
  loop
    select i.command_body into v_held
      from public.device_inventory i
     where i.device_id   = p_target
       and i.pin         = v_admin.pin
       and i.record_type = 'user';

    v_body := v_held;

    if v_body is null then
      select i.command_body into v_body
        from public.device_inventory i
        join public.devices d on d.id = i.device_id
       where i.device_id   = any (p_order)
         and d.sync_role   = 'peer'
         and i.pin         = v_admin.pin
         and i.record_type = 'user'
       order by array_position(p_order, i.device_id)
       limit 1;
    end if;

    -- No terminal has ever reported this PIN. There is no record to correct,
    -- and inventing one is `resync_device`'s job, not the merge's.
    if v_body is null then
      continue;
    end if;

    v_held_pri := coalesce(substring(v_body from '(?i)(?:^|\t)Pri=([0-9]+)')::integer, 0);

    -- Already at or above: a terminal is never demoted by the merge.
    if v_held is not null and v_held_pri >= v_admin.privilege then
      continue;
    end if;

    v_corrected := app.userinfo_at_privilege(v_body, v_admin.privilege::smallint);

    if v_corrected is not distinct from v_held then
      continue;
    end if;

    if app.queue_device_command(p_target, 'user.update', v_corrected, v_admin.profile_id, true)
       is not null then
      v_count := v_count + 1;
    end if;
  end loop;

  return v_count;
end;
$$;

comment on function app.restore_administrators(uuid, uuid[]) is
  'Queues, for one terminal, every administrator RadoFlow or a peer terminal knows, at the highest privilege reported, under the name and card that terminal already has for them. Never lowers a privilege.';
