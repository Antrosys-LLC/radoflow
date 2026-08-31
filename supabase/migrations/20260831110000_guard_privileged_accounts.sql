-- ============================================================================
-- Administrators are not ordinary staff records.
--
-- `people.manage` exists so the office can enrol, correct and suspend workers.
-- Pointed at an administrator's account it stops being staff administration:
-- suspending the CEO takes the only unrestricted account offline, and — because
-- a payroll run only reads profiles with status 'active' — quietly drops them
-- from their own payroll. Neither is a thing "may add and edit employees" was
-- ever meant to authorise.
--
-- The password path cannot be defended here: it goes through the GoTrue admin
-- API under the service key, which no policy or trigger ever sees, so the
-- application check is the whole protection there. Status lives in
-- public.profiles and is reached with the caller's own client, so this one can
-- be held in the database — where it also covers anything that reaches the
-- column in future without remembering to ask.
--
-- Added as its own trigger rather than folded into
-- app.guard_profile_self_update(), which returns early for exactly the
-- `people.manage` holders this needs to constrain. Restructuring a working
-- guard to carry an unrelated rule is how both end up wrong.
-- ============================================================================

/**
 * Whether the current actor may administer `p_target`'s account.
 *
 * One condition covers both Admin/CEO and any runtime role granted the key,
 * because app.has_permission() short-circuits to true for a superuser: an
 * account that holds `access.manage` can grant any capability to anyone,
 * including itself, so reaching it is not a lateral move into someone else's
 * job but a route to every job.
 */
create or replace function app.may_administer(p_target uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select
    -- Migrations, seeds and service-key work have no session user. The same
    -- allowance app.guard_profile_self_update() makes, for the same reason.
    auth.uid() is null
    -- Already able to grant themselves anything, so nothing is escalated.
    or app.can('access.manage')
    or p_target = auth.uid()
    or not app.has_permission(p_target, 'access.manage');
$$;

comment on function app.may_administer(uuid) is
  'False when the actor would gain access-granting power by reaching this account.';

create or replace function app.guard_privileged_account_status()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if new.status is distinct from old.status and not app.may_administer(new.id) then
    raise exception
      'Only someone who manages access may change the status of an account that manages access'
      using errcode = '42501';
  end if;

  return new;
end;
$$;

create trigger profiles_guard_privileged_status
  before update on public.profiles
  for each row execute function app.guard_privileged_account_status();
