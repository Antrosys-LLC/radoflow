-- ============================================================================
-- Permissions for a person who is not holding a browser session.
--
-- The WhatsApp bot authenticates itself with a shared secret and then acts as
-- the RadoFlow user whose phone number sent the message. `my_permissions()` is
-- keyed on auth.uid(), which does not exist for the bot, so this is the same
-- answer for an explicit user id.
--
-- Callable by the service role only: handing it to `authenticated` would let any
-- signed-in person read anyone else's permissions.
-- ============================================================================

create or replace function public.permissions_of(p_user uuid)
returns setof text
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
begin
  if p_user is null then
    return;
  end if;

  if app.is_superuser(p_user) then
    return query select key from public.permissions;
    return;
  end if;

  return query
    select distinct p.key
      from public.permissions p
     where app.has_permission(p_user, p.key);
end;
$$;

revoke all on function public.permissions_of(uuid) from public, anon, authenticated;
grant execute on function public.permissions_of(uuid) to service_role;
