-- ============================================================================
-- A role for the person who actually stands at the gate.
--
-- The register shipped with `gate.log` attached to Operations and Manager,
-- because those were the roles that existed. Neither describes the job: a gate
-- supervisor is not a floor manager, does not read attendance for a
-- department, and should not be given a role that carries all of that in order
-- to write down a truck.
--
-- So: their own role, holding the gate and nothing else beyond what any
-- employee has. Operations and Manager keep `gate.view` — they oversee the
-- gate and answer for what came through it — but stop holding `gate.log`,
-- which is now the gate supervisor's own.
-- ============================================================================

insert into public.roles (key, name, description, is_system, is_superuser, rank)
values (
  'gate-supervisor',
  'Gate Supervisor',
  'Writes the gate register, and corrects their own entries for an hour. Nothing else.',
  true,
  false,
  -- Below Canteen (45) and above Employee (50): the same shape of job, one
  -- station with one register, and `rank` only decides which role names a
  -- person when they hold several.
  46
)
on conflict (key) do update
   set name        = excluded.name,
       description = excluded.description,
       is_system   = excluded.is_system,
       rank        = excluded.rank;

/*
 * What the job needs, and no more.
 *
 * `gate.log` and `gate.view` are the register. `dashboard.employee` and
 * `leave.request` are what makes the app usable for somebody who works here —
 * without them a gate supervisor signs in to a single screen and cannot even
 * ask for a day off. Every other role on this system carries that pair for the
 * same reason.
 */
insert into public.role_permissions (role_id, permission_id)
select r.id, p.id
  from public.roles r
  join public.permissions p
    on p.key in ('gate.log', 'gate.view', 'dashboard.employee', 'leave.request')
 where r.key = 'gate-supervisor'
on conflict do nothing;

-- Overseeing the gate is reading it. Writing it is standing at it.
delete from public.role_permissions rp
 using public.roles r, public.permissions p
 where rp.role_id = r.id
   and rp.permission_id = p.id
   and p.key = 'gate.log'
   and r.key in ('operations', 'manager');

-- The landing page for a role with one screen is that screen; nothing in the
-- app needs telling, because `landingPathFor` already walks the permissions in
-- order and the gate is the only one they hold that resolves to a page.
