-- ============================================================================
-- Two roles, a manager who can sign off, and a roster an employee may see.
--
-- Antrosys maintains the software; the factory has its own administrator. They
-- are different people with different reasons to hold the keys, and until now
-- they shared one role.
--
-- Factory Admin is deliberately NOT flagged is_superuser. app.has_permission()
-- short-circuits on the superuser flag before it reads the deny list, so a
-- superuser is one nobody can restrict in any degree — which is right for the
-- two roles that must never be locked out, and wrong for a role the CEO wants
-- to be able to trim. Granting every permission explicitly gives identical
-- power on day one and leaves a deny override able to bite.
-- ============================================================================

insert into public.roles (key, name, description, is_system, is_superuser, rank)
values (
  'factory-admin',
  'Factory Admin',
  'Runs the factory. Every capability by default; individual ones can be revoked by the CEO.',
  true,
  false,
  25
)
on conflict (key) do update
   set name         = excluded.name,
       description  = excluded.description,
       is_system    = excluded.is_system,
       is_superuser = excluded.is_superuser,
       rank         = excluded.rank;

-- Every permission in the catalogue, including any a later migration adds that
-- re-runs this insert.
insert into public.role_permissions (role_id, permission_id)
select r.id, p.id
  from public.roles r
  cross join public.permissions p
 where r.key = 'factory-admin'
on conflict (role_id, permission_id) do nothing;

-- ---------------------------------------------------------------------------
-- Accounts
--
-- Computes payroll; does not sign it off. payroll.approve and payroll.pay are
-- withheld deliberately, so the desk that produces the numbers is not the desk
-- that releases the money.
-- ---------------------------------------------------------------------------

insert into public.roles (key, name, description, is_system, is_superuser, rank)
values (
  'accounts',
  'Accounts',
  'Sees all attendance and payroll, and runs payroll. Approval and disbursement stay with an admin.',
  true,
  false,
  35
)
on conflict (key) do update
   set name        = excluded.name,
       description = excluded.description,
       is_system   = excluded.is_system,
       rank        = excluded.rank;

insert into public.role_permissions (role_id, permission_id)
select r.id, p.id
  from public.roles r
  join public.permissions p on true
 where (r.key, p.key) in (
   ('accounts', 'dashboard.employee'),  ('accounts', 'leave.request'),
   ('accounts', 'directory.view'),      ('accounts', 'attendance.view.all'),
   ('accounts', 'payroll.view'),        ('accounts', 'payroll.run'),
   ('accounts', 'payslip.view.all'),    ('accounts', 'reports.view')
 )
on conflict (role_id, permission_id) do nothing;

-- ---------------------------------------------------------------------------
-- A manager may sign off their own department's attendance
--
-- Scope is unchanged: the existing RLS policies keep a manager to their own
-- reports. This grants the action, not a wider view.
-- ---------------------------------------------------------------------------

insert into public.role_permissions (role_id, permission_id)
select r.id, p.id
  from public.roles r
  join public.permissions p on true
 where (r.key, p.key) in (('manager', 'attendance.approve'))
on conflict (role_id, permission_id) do nothing;

-- ---------------------------------------------------------------------------
-- An employee sees who else is in their department
--
-- Names, codes, designation and status only. This view exists precisely
-- because it carries no monthly_salary, hourly_rate or pin_hash column, so
-- widening its rows cannot leak pay. Attendance and payslips are unaffected:
-- those tables have their own self-only policies.
-- ---------------------------------------------------------------------------

create or replace view public.employee_directory
with (security_invoker = off) as
  select
    p.id,
    p.employee_code,
    p.full_name,
    p.photo_url,
    p.site_id,
    p.department_id,
    p.designation,
    p.manager_id,
    p.pay_class,
    p.requires_attendance,
    p.status,
    p.joined_on
  from public.profiles p
  where p.id = auth.uid()
     or p.manager_id = auth.uid()
     or app.can('directory.view', p.site_id)
     or p.department_id = (
          select me.department_id from public.profiles me where me.id = auth.uid()
        );

grant select on public.employee_directory to authenticated;
