-- ============================================================================
-- Replace the Admin role with Admin — Antrosys.
--
-- One unrestricted role, held by the people who maintain the system, ranked
-- above every other so it wins when a landing page or a label has to pick one.
--
-- It is both `is_superuser` and granted every permission explicitly. The flag
-- alone is enough for access control, but a role showing zero permissions in
-- the access screen reads as a broken role — the rows make what it can do
-- visible rather than implied.
-- ============================================================================

insert into public.roles (key, name, description, is_system, is_superuser, rank)
values (
  'admin-antrosys',
  'Admin — Antrosys',
  'Unrestricted. Every capability in the system, including access management.',
  true,
  true,
  5
)
on conflict (key) do update
   set name         = excluded.name,
       description  = excluded.description,
       is_system    = excluded.is_system,
       is_superuser = excluded.is_superuser,
       rank         = excluded.rank;

-- Every permission in the catalogue, and any added later by a migration that
-- re-runs this insert.
insert into public.role_permissions (role_id, permission_id)
select r.id, p.id
  from public.roles r
  cross join public.permissions p
 where r.key = 'admin-antrosys'
on conflict (role_id, permission_id) do nothing;

-- ---------------------------------------------------------------------------
-- Carry anyone on the old role across before it goes
--
-- Nobody holds it on the current deployment, but a database restored from an
-- older backup would otherwise silently lose its administrators when the
-- cascade below fires.
-- ---------------------------------------------------------------------------

insert into public.user_roles (user_id, role_id)
select ur.user_id, (select id from public.roles where key = 'admin-antrosys')
  from public.user_roles ur
  join public.roles r on r.id = ur.role_id
 where r.key = 'admin'
on conflict do nothing;

-- user_roles and role_permissions both cascade from roles.
delete from public.roles where key = 'admin';
