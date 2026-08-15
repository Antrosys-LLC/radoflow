-- ============================================================================
-- Session helpers.
--
-- The app needs one cheap call that answers "who am I and what may I do", so
-- the shell can build a role-appropriate menu without N round trips. The
-- permission logic stays in the database — this only exposes it.
-- ============================================================================

/**
 * Every permission key the caller effectively holds.
 *
 * Superusers get the full catalogue rather than an empty set, so callers can
 * treat the result as the literal truth without special-casing Admin/CEO.
 */
create or replace function public.my_permissions()
returns setof text
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
begin
  if auth.uid() is null then
    return;
  end if;

  if app.is_superuser(auth.uid()) then
    return query select key from public.permissions;
    return;
  end if;

  return query
    select distinct p.key
      from public.permissions p
     where app.has_permission(auth.uid(), p.key);
end;
$$;

/** The caller's roles, most senior first. */
create or replace function public.my_roles()
returns table (key text, name text, is_superuser boolean, rank integer)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select r.key, r.name, r.is_superuser, r.rank
    from public.user_roles ur
    join public.roles r on r.id = ur.role_id
   where ur.user_id = auth.uid()
   order by r.rank;
$$;

grant execute on function public.my_permissions() to authenticated;
grant execute on function public.my_roles() to authenticated;
