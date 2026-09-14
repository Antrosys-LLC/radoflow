-- ============================================================================
-- C-Level, and the two owners inside it.
--
-- "CEO" was one unrestricted role, and anybody holding it could do everything
-- — including hand the same power to somebody else. The business is owned by
-- two people, Arham Sethi and Ghaffar Sethi, and that is who should decide who
-- gets access to anything. Everybody else at director level is C-Level: every
-- capability the factory has, and no approval queue in front of any of it, but
-- not the key that decides who else gets in.
--
--   owner          C-Level · Owner. Unrestricted. Gives and takes away access
--                  from anyone, other C-Levels included.
--   ceo            C-Level. Every capability except `access.manage`. Keeps its
--                  key so nothing that reads the key has to change; only the
--                  name the screens show is different.
--   admin-antrosys unchanged — unrestricted, because Antrosys maintains the
--                  system and cannot be made to wait on it.
--
-- Nobody but an owner or Antrosys may give, change or take away any of those
-- three roles. That is held in a trigger on user_roles rather than in the
-- screen, because a role granted by any route — the users page, a bulk action,
-- a future import — is the same escalation.
-- ============================================================================

insert into public.roles (key, name, description, is_system, is_superuser, rank)
values (
  'owner',
  'C-Level · Owner',
  'Owns the business. Unrestricted, and decides who gets access to anything — other C-Levels included.',
  true,
  true,
  5
)
on conflict (key) do update
   set name         = excluded.name,
       description  = excluded.description,
       is_system    = true,
       is_superuser = true,
       rank         = excluded.rank;

update public.roles
   set name         = 'C-Level',
       description  = 'Runs the company. Every capability except giving access to others, and no approval needed for anything.',
       is_superuser = false,
       rank         = 20
 where key = 'ceo';

-- Every capability there is, bar the one that hands out capabilities.
insert into public.role_permissions (role_id, permission_id)
select r.id, p.id
  from public.roles r
  cross join public.permissions p
 where r.key = 'ceo'
   and p.key <> 'access.manage'
on conflict do nothing;

delete from public.role_permissions rp
 using public.roles r, public.permissions p
 where rp.role_id = r.id
   and rp.permission_id = p.id
   and r.key = 'ceo'
   and p.key = 'access.manage';

-- ---------------------------------------------------------------------------
-- The two owners
--
-- Matched on the name as the office typed it. Whoever is found loses whatever
-- role they held and holds `owner` alone; a name that matches nobody changes
-- nothing, and Antrosys can make the assignment from the users screen.
-- ---------------------------------------------------------------------------

-- The same condition twice rather than a temporary table: this file is also
-- pasted into the SQL editor, where every statement commits on its own and a
-- table created ON COMMIT DROP is gone before the next line runs.
delete from public.user_roles ur
 using public.profiles p
 where ur.user_id = p.id
   and (p.full_name ilike '%arham%sethi%' or p.full_name ilike '%ghaffar%sethi%');

insert into public.user_roles (user_id, role_id)
select p.id, r.id
  from public.profiles p
  cross join public.roles r
 where r.key = 'owner'
   and (p.full_name ilike '%arham%sethi%' or p.full_name ilike '%ghaffar%sethi%');

-- ---------------------------------------------------------------------------
-- Who may hand out leadership
-- ---------------------------------------------------------------------------

/** An owner, or Antrosys: the two who may decide about leadership roles. */
create or replace function app.is_owner(p_user uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1
      from public.user_roles ur
      join public.roles r on r.id = ur.role_id
     where ur.user_id = p_user
       and r.key in ('owner', 'admin-antrosys')
  );
$$;

/** Holds a leadership role: owner, C-Level or Antrosys. */
create or replace function app.is_leadership(p_user uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1
      from public.user_roles ur
      join public.roles r on r.id = ur.role_id
     where ur.user_id = p_user
       and r.key in ('owner', 'ceo', 'admin-antrosys')
  );
$$;

create or replace function app.guard_leadership_roles()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_key text;
  v_user uuid;
begin
  -- Migrations, seeds and service-key work have no session user.
  if auth.uid() is null or app.is_owner(auth.uid()) then
    return coalesce(new, old);
  end if;

  select key into v_key from public.roles where id = coalesce(new.role_id, old.role_id);
  v_user := coalesce(new.user_id, old.user_id);

  if v_key in ('owner', 'ceo', 'admin-antrosys')
     or (tg_op <> 'INSERT' and app.is_leadership(v_user)) then
    raise exception 'Only an owner may give or take away C-Level access'
      using errcode = '42501';
  end if;

  return coalesce(new, old);
end;
$$;

drop trigger if exists user_roles_guard_leadership on public.user_roles;
create trigger user_roles_guard_leadership
  before insert or update or delete on public.user_roles
  for each row execute function app.guard_leadership_roles();

/*
 * A C-Level account no longer holds `access.manage`, which is what
 * app.may_administer() used to recognise a privileged account by. Without
 * this, anybody holding `people.manage` could suspend a director.
 */
create or replace function app.may_administer(p_target uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select
    auth.uid() is null
    or p_target = auth.uid()
    or app.is_owner(auth.uid())
    or (
      app.can('access.manage')
      and not app.is_leadership(p_target)
    )
    or (
      not app.has_permission(p_target, 'access.manage')
      and not app.is_leadership(p_target)
    );
$$;

-- The assistant stays with the people who answer for its cost.
insert into public.role_permissions (role_id, permission_id)
select r.id, p.id
  from public.roles r
  cross join public.permissions p
 where r.key = 'owner'
   and p.key = 'assistant.ask'
on conflict do nothing;
