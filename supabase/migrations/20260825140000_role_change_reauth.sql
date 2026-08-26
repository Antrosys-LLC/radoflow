-- ============================================================================
-- A role change forces the person to sign in again.
--
-- Permissions are resolved once per request from the signed-in session. Until
-- that session ends, someone demoted at 9am keeps the access they had at 8am —
-- the change is real in the database and invisible in their browser. Stamping
-- the moment their access changed lets the session loader notice a token that
-- predates it and send them back to the login box.
--
-- The stamp lives on the profile rather than in the token because the token is
-- issued by GoTrue and cannot be rewritten from here.
-- ============================================================================

alter table public.profiles
  add column roles_changed_at timestamptz not null default now();

comment on column public.profiles.roles_changed_at is
  'When this person''s access last changed. A session whose token was issued before this is refused, forcing a fresh sign-in so the new permissions take effect immediately.';

create or replace function app.stamp_roles_changed()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_user uuid;
begin
  -- Covers all three operations: the row being removed on a delete, the row
  -- being written otherwise.
  v_user := coalesce(new.user_id, old.user_id);

  if v_user is not null then
    update public.profiles
       set roles_changed_at = now()
     where id = v_user;
  end if;

  return coalesce(new, old);
end;
$$;

create trigger user_roles_stamp_reauth
  after insert or update or delete on public.user_roles
  for each row execute function app.stamp_roles_changed();

/*
 * Per-person overrides change what someone may do just as surely as a role
 * does, so they force the same re-authentication. Leaving them out would make
 * "revoke this one capability" the one access change that does not take effect
 * until the person happens to sign out.
 */
create trigger user_overrides_stamp_reauth
  after insert or update or delete on public.user_permission_overrides
  for each row execute function app.stamp_roles_changed();
