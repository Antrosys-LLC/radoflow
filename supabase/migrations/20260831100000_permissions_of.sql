-- ============================================================================
-- "What may this other person do?"
--
-- Setting someone's password hands their account over. The office genuinely
-- needs to do that — workers forget passwords and have no mailbox to receive a
-- reset link — but `people.manage` alone could aim it at the CEO, and whoever
-- typed the new password could then sign in as them. Enrolling staff is not
-- supposed to be a route to running the company.
--
-- Answering "would this reset hand over more than the resetter already holds?"
-- needs the *target's* effective permissions, and until now nothing could
-- resolve those: my_permissions() only ever answers for the caller.
--
-- This is that function, deliberately built on the same app.has_permission()
-- and app.is_superuser() the policies use. Re-deriving role grants, overrides
-- and deny-beats-grant in application code would put a second copy of the
-- access rules somewhere they could drift from these — which is exactly how
-- the permission catalogue and the RLS policies came apart before.
-- ============================================================================

/**
 * Every permission key `p_user` effectively holds.
 *
 * Mirrors my_permissions() for an arbitrary person, including its rule that a
 * superuser resolves to the whole catalogue rather than an empty set. That is
 * what lets a caller ask one plain question — "does this account hold
 * access.manage?" — and have it be true for Admin and CEO without the caller
 * having to special-case them.
 */
create or replace function public.permissions_of(p_user uuid)
returns setof text
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
begin
  if auth.uid() is null then
    raise exception 'Not signed in' using errcode = '42501';
  end if;

  /*
   * Reading what someone else may do is itself an administrative act, and the
   * check lives here rather than only at the call site: a security definer
   * function is reachable over PostgREST by any authenticated user, so a guard
   * in the action above would be no guard at all.
   */
  if not (app.can('people.manage') or app.can('access.manage')) then
    raise exception 'Not permitted to read another user''s access'
      using errcode = '42501';
  end if;

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

comment on function public.permissions_of(uuid) is
  'Effective permission keys for any user. Superusers resolve to the full catalogue, as in my_permissions().';

grant execute on function public.permissions_of(uuid) to authenticated;
