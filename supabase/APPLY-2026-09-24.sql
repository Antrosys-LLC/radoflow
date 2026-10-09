  -- ============================================================================
  -- PENDING MIGRATION (24 Sep 2026) — paste this whole file into the Supabase
  -- SQL editor:  Dashboard -> SQL Editor -> New query -> paste -> Run
  --
  -- The exact content of:
  --
  --   20260924090000_terminal_edits_propagate.sql
  --
  -- Run it BEFORE deploying: until it is there the code skips the step quietly.
  -- After it, a name or card edited on a gate, or a re-enrolled finger or face,
  -- reaches the other terminals. The kitchen's own edits stay on the kitchen.
  -- ============================================================================
  
  -- >>> 20260924090000_terminal_edits_propagate.sql
  -- ============================================================================
  -- A change made on a gate reaches every other terminal.
  --
  -- Until now a terminal was only ever sent a slot it lacked, so renaming
  -- somebody on one gate, giving them a card, or re-enrolling a finger changed
  -- that gate alone and left the others on the old version.
  --
  -- The rule is still additive for everything that is not a change. What is new
  -- is that a terminal reporting a record DIFFERENT from the one RadoFlow last
  -- recorded for that same terminal has told us it was edited there, and that
  -- edit is pushed to the other terminals:
  --
  --   user record   the name and the card are written onto each other terminal's
  --                 OWN record, so nothing else about the person moves.
  --   finger, face  the new template replaces the old one.
  --
  -- Not changed, deliberately:
  --
  --   - A terminal that has not been edited is never touched. Two terminals that
  --     already disagree today (a name typed differently when somebody was
  --     enrolled) stay as they are until one of them is edited.
  --   - The kitchen sends nothing: an edit made there stays there.
  --   - Administrators keep their own names — PIN 1 is one person under two
  --     names on purpose — and a privilege is only ever raised, never lowered.
  --   - Suspended and terminated people are never pushed anywhere.
  --
  -- Called by the roster upload BEFORE it writes the new inventory, because the
  -- comparison is against the inventory as it stood.
  -- ============================================================================
  
  create or replace function app.user_field(p_body text, p_key text)
  returns text
  language sql
  immutable
  as $$
    select substring(p_body from ('(?i)(?:^|\t)' || p_key || '=([^\t]*)'));
  $$;
  
  create or replace function app.pri_of(p_body text)
  returns integer
  language sql
  immutable
  as $$
    select coalesce(substring(p_body from '(?i)(?:^|\t)Pri=([0-9]+)')::integer, 0);
  $$;
  
  -- A card compared by its digits: a terminal is free to pad it with zeros, and
  -- that is not an edit.
  create or replace function app.card_digits(p_body text)
  returns text
  language sql
  immutable
  as $$
    select ltrim(regexp_replace(coalesce(app.user_field(p_body, 'Card'), ''), '[^0-9]', '', 'g'), '0');
  $$;
  
  -- Text safe to use as a regexp_replace replacement: `\` and `&` are special.
  create or replace function app.regex_literal_replacement(p_text text)
  returns text
  language sql
  immutable
  as $$
    select replace(replace(coalesce(p_text, ''), '\', '\\'), '&', '\&');
  $$;
  
  create or replace function app.propagate_roster_edits(p_source uuid, p_slots jsonb)
  returns integer
  language plpgsql
  security definer
  set search_path = public, pg_temp
  as $$
  declare
    v_edit      record;
    v_target    uuid;
    v_held      text;
    v_new       text;
    v_new_pri   integer;
    v_held_pri  integer;
    v_queued    integer := 0;
  begin
    if p_source is null or p_slots is null or jsonb_typeof(p_slots) <> 'array' then
      return 0;
    end if;
  
    -- The kitchen's edits are its own.
    if not exists (
      select 1 from public.devices d where d.id = p_source and d.sync_role = 'peer'
    ) then
      return 0;
    end if;
  
    for v_edit in
      select s.pin, s.record_type, s.bio_type, s.finger_index,
             s.command_body as new_body
        from jsonb_to_recordset(p_slots)
               as s(pin text, record_type text, bio_type smallint, finger_index smallint, command_body text)
        join public.device_inventory i
          on i.device_id    = p_source
         and i.pin          = s.pin
         and i.record_type  = s.record_type
         and i.bio_type     = s.bio_type
         and i.finger_index = s.finger_index
       where s.pin ~ '^[0-9]+$'
         and not exists (
           select 1 from public.profiles p
            where p.device_pin = s.pin and p.status <> 'active'
         )
         and (
           (s.record_type = 'user' and (
                left(app.user_field(s.command_body, 'Name'), 24)
                  is distinct from left(app.user_field(i.command_body, 'Name'), 24)
             or app.card_digits(s.command_body) is distinct from app.card_digits(i.command_body)
             or app.pri_of(s.command_body)      is distinct from app.pri_of(i.command_body)
           ))
           or (s.record_type = 'template'
               and app.template_bytes(s.command_body) is distinct from app.template_bytes(i.command_body))
         )
       -- People before their fingers: a terminal discards a template for a PIN it
       -- has never seen.
       order by (s.record_type = 'template'), s.pin::bigint, s.bio_type, s.finger_index
    loop
      for v_target in select app.sync_targets(p_source) loop
        if v_edit.record_type = 'user' then
          select i.command_body into v_held
            from public.device_inventory i
           where i.device_id = v_target and i.pin = v_edit.pin and i.record_type = 'user';
  
          -- A terminal that does not hold the person is the merge's business.
          if v_held is null then
            continue;
          end if;
  
          v_new_pri  := app.pri_of(v_edit.new_body);
          v_held_pri := app.pri_of(v_held);
  
          if v_new_pri > 0 or v_held_pri > 0 then
            if v_new_pri > v_held_pri then
              v_new := app.userinfo_at_privilege(v_held, v_new_pri::smallint);
            else
              continue;
            end if;
          else
            v_new := regexp_replace(
                       v_held, '(?i)(^|\t)Name=[^\t]*',
                       '\1Name=' || app.regex_literal_replacement(app.user_field(v_edit.new_body, 'Name')));
            v_new := regexp_replace(
                       v_new, '(?i)(^|\t)Card=[^\t]*',
                       '\1Card=' || app.regex_literal_replacement(app.user_field(v_edit.new_body, 'Card')));
          end if;
  
          if v_new is distinct from v_held
             and app.queue_device_command(v_target, 'user.update', v_new, null, true) is not null then
            v_queued := v_queued + 1;
          end if;
        else
          -- Already holds exactly this template: nothing to say.
          if exists (
            select 1 from public.device_inventory i
             where i.device_id    = v_target
               and i.pin          = v_edit.pin
               and i.record_type  = 'template'
               and i.bio_type     = v_edit.bio_type
               and i.finger_index = v_edit.finger_index
               and app.template_bytes(i.command_body) is not distinct from app.template_bytes(v_edit.new_body)
          ) then
            continue;
          end if;
  
          if not exists (
            select 1 from public.device_inventory i
             where i.device_id = v_target and i.pin = v_edit.pin and i.record_type = 'user'
          ) then
            select i.command_body into v_new
              from public.device_inventory i
             where i.device_id = p_source and i.pin = v_edit.pin and i.record_type = 'user';
            if v_new is not null then
              perform app.queue_device_command(v_target, 'user.update', v_new, null);
            end if;
          end if;
  
          if app.queue_device_command(v_target, 'biometric.update', v_edit.new_body, null, true) is not null then
            v_queued := v_queued + 1;
          end if;
        end if;
      end loop;
    end loop;
  
    return v_queued;
  end;
  $$;
  
  comment on function app.propagate_roster_edits(uuid, jsonb) is
    'Given the slots a peer terminal just reported, pushes to the other terminals every user name/card edit and every re-enrolled finger or face, comparing with the inventory as it stood. The kitchen sends nothing; administrators keep their own names and are only raised.';
  
  create or replace function public.propagate_roster_edits(p_source uuid, p_slots jsonb)
  returns integer
  language sql
  security definer
  set search_path = public, pg_temp
  as $$
    select app.propagate_roster_edits(p_source, p_slots);
  $$;
  
  revoke execute on function public.propagate_roster_edits(uuid, jsonb) from public, anon, authenticated;
  grant execute on function public.propagate_roster_edits(uuid, jsonb) to service_role;
