-- ============================================================================
-- Row Level Security.
--
-- Access is enforced here, in the database, not in the React layer. Hiding a
-- button is a UI courtesy; these policies are what actually stops a Manager
-- from reading the CEO's payroll. Every policy routes through app.can(), so a
-- permission the CEO grants at runtime takes effect immediately and everywhere.
--
-- The service_role key used by the device-ingestion endpoint bypasses RLS by
-- design — that path authenticates the *device*, not a person.
-- ============================================================================

alter table public.sites                     enable row level security;
alter table public.departments               enable row level security;
alter table public.profiles                  enable row level security;
alter table public.roles                     enable row level security;
alter table public.permissions               enable row level security;
alter table public.role_permissions          enable row level security;
alter table public.user_roles                enable row level security;
alter table public.user_permission_overrides enable row level security;
alter table public.audit_log                 enable row level security;
alter table public.work_week                 enable row level security;
alter table public.calendar_days             enable row level security;
alter table public.devices                   enable row level security;
alter table public.device_enrollments        enable row level security;
alter table public.punches                   enable row level security;
alter table public.attendance_days           enable row level security;
alter table public.leave_types               enable row level security;
alter table public.leave_requests            enable row level security;
alter table public.approvals                 enable row level security;
alter table public.pay_rules                 enable row level security;
alter table public.pay_components            enable row level security;
alter table public.profile_pay_components    enable row level security;
alter table public.payroll_periods           enable row level security;
alter table public.payroll_items             enable row level security;
alter table public.payslips                  enable row level security;
alter table public.department_kpis           enable row level security;
alter table public.expenses                  enable row level security;

-- ---------------------------------------------------------------------------
-- Org structure — everyone signed in can see the shape of the company;
-- only settings.manage can reshape it.
-- ---------------------------------------------------------------------------

create policy sites_read on public.sites
  for select to authenticated using (true);
create policy sites_write on public.sites
  for all to authenticated
  using (app.can('settings.manage', id)) with check (app.can('settings.manage', id));

create policy departments_read on public.departments
  for select to authenticated using (true);
create policy departments_write on public.departments
  for all to authenticated
  using (app.can('settings.manage', site_id)) with check (app.can('settings.manage', site_id));

-- ---------------------------------------------------------------------------
-- People
-- ---------------------------------------------------------------------------

create policy profiles_read_self on public.profiles
  for select to authenticated using (id = auth.uid());

create policy profiles_read_reports on public.profiles
  for select to authenticated using (manager_id = auth.uid());

-- Deliberately NOT granted via 'directory.view'. public.profiles carries
-- monthly_salary, hourly_rate and pin_hash, and RLS is row-level — it cannot
-- hide those columns from a role that is allowed the row. Anyone who only
-- needs names and departments reads public.employee_directory below instead.
create policy profiles_read_hr on public.profiles
  for select to authenticated
  using (app.can('people.view', site_id) or app.can('payroll.view', site_id));

create policy profiles_write on public.profiles
  for all to authenticated
  using (app.can('people.manage', site_id)) with check (app.can('people.manage', site_id));

-- Everyone may correct their own contact details; payroll-affecting columns
-- are guarded by the trigger below rather than by the policy.
create policy profiles_update_self on public.profiles
  for update to authenticated using (id = auth.uid()) with check (id = auth.uid());

create or replace function app.guard_profile_self_update()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if auth.uid() is null or app.can('people.manage', new.site_id) then
    return new;
  end if;

  if new.id = auth.uid() then
    -- Self-service edits may not touch pay, placement, or employment terms.
    new.pay_class           := old.pay_class;
    new.requires_attendance := old.requires_attendance;
    new.monthly_salary      := old.monthly_salary;
    new.hourly_rate         := old.hourly_rate;
    new.site_id             := old.site_id;
    new.department_id       := old.department_id;
    new.manager_id          := old.manager_id;
    new.employee_code       := old.employee_code;
    new.status              := old.status;
    new.designation         := old.designation;
  end if;

  return new;
end;
$$;

create trigger profiles_guard_self_update
  before update on public.profiles
  for each row execute function app.guard_profile_self_update();

-- ---------------------------------------------------------------------------
-- Pay-free employee directory.
--
-- The roster a Manager or Operations needs — who works where, who reports to
-- whom — with no salary, rate or PIN column present at all. Runs as the view
-- owner so it can read past the profiles policies, and enforces its own access
-- in the WHERE clause; auth.uid() still resolves per request.
-- ---------------------------------------------------------------------------

create view public.employee_directory
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
     or app.can('directory.view', p.site_id);

grant select on public.employee_directory to authenticated;

-- ---------------------------------------------------------------------------
-- Roles and permissions — the CEO's control surface
-- ---------------------------------------------------------------------------

create policy roles_read on public.roles
  for select to authenticated using (true);
create policy roles_write on public.roles
  for all to authenticated
  using (app.can('access.manage')) with check (app.can('access.manage'));

create policy permissions_read on public.permissions
  for select to authenticated using (true);
create policy permissions_write on public.permissions
  for all to authenticated
  using (app.can('access.manage')) with check (app.can('access.manage'));

create policy role_permissions_read on public.role_permissions
  for select to authenticated using (true);
create policy role_permissions_write on public.role_permissions
  for all to authenticated
  using (app.can('access.manage')) with check (app.can('access.manage'));

create policy user_roles_read on public.user_roles
  for select to authenticated
  using (user_id = auth.uid() or app.can('access.manage', site_id));
create policy user_roles_write on public.user_roles
  for all to authenticated
  using (app.can('access.manage', site_id)) with check (app.can('access.manage', site_id));

create policy overrides_read on public.user_permission_overrides
  for select to authenticated
  using (user_id = auth.uid() or app.can('access.manage', site_id));
create policy overrides_write on public.user_permission_overrides
  for all to authenticated
  using (app.can('access.manage', site_id)) with check (app.can('access.manage', site_id));

create policy audit_read on public.audit_log
  for select to authenticated using (app.can('audit.view', site_id));
create policy audit_insert on public.audit_log
  for insert to authenticated with check (true);

-- ---------------------------------------------------------------------------
-- Calendar and devices
-- ---------------------------------------------------------------------------

create policy work_week_read on public.work_week
  for select to authenticated using (true);
create policy work_week_write on public.work_week
  for all to authenticated
  using (app.can('calendar.manage', site_id)) with check (app.can('calendar.manage', site_id));

create policy calendar_read on public.calendar_days
  for select to authenticated using (true);
create policy calendar_write on public.calendar_days
  for all to authenticated
  using (app.can('calendar.manage', site_id)) with check (app.can('calendar.manage', site_id));

-- comm_key lives on this table, so reads need an explicit permission.
create policy devices_read on public.devices
  for select to authenticated using (app.can('devices.view', site_id));
create policy devices_write on public.devices
  for all to authenticated
  using (app.can('devices.manage', site_id)) with check (app.can('devices.manage', site_id));

create policy enrollments_read on public.device_enrollments
  for select to authenticated
  using (profile_id = auth.uid() or app.can('devices.view'));
create policy enrollments_write on public.device_enrollments
  for all to authenticated
  using (app.can('devices.manage')) with check (app.can('devices.manage'));

-- ---------------------------------------------------------------------------
-- Attendance
-- ---------------------------------------------------------------------------

-- The plain 'attendance.*' keys only reach the holder's own reports; the
-- '.all' variants reach everyone. That is what keeps a Manager to their own
-- department while Operations sees every factory.
create policy punches_read on public.punches
  for select to authenticated
  using (
    profile_id = auth.uid()
    or app.can('attendance.view.all')
    or (app.can('attendance.view') and app.manages(auth.uid(), profile_id))
  );
create policy punches_write on public.punches
  for all to authenticated
  using (
    app.can('attendance.edit.all')
    or (app.can('attendance.edit') and app.manages(auth.uid(), profile_id))
  )
  with check (
    app.can('attendance.edit.all')
    or (app.can('attendance.edit') and app.manages(auth.uid(), profile_id))
  );

create policy attendance_read on public.attendance_days
  for select to authenticated
  using (
    profile_id = auth.uid()
    or app.can('attendance.view.all', site_id)
    or (app.can('attendance.view', site_id) and app.manages(auth.uid(), profile_id))
  );
create policy attendance_write on public.attendance_days
  for all to authenticated
  using (
    app.can('attendance.edit.all', site_id)
    or (app.can('attendance.edit', site_id) and app.manages(auth.uid(), profile_id))
  )
  with check (
    app.can('attendance.edit.all', site_id)
    or (app.can('attendance.edit', site_id) and app.manages(auth.uid(), profile_id))
  );

-- ---------------------------------------------------------------------------
-- Leave and approvals
-- ---------------------------------------------------------------------------

create policy leave_types_read on public.leave_types
  for select to authenticated using (true);
create policy leave_types_write on public.leave_types
  for all to authenticated
  using (app.can('settings.manage', site_id)) with check (app.can('settings.manage', site_id));

create policy leave_read on public.leave_requests
  for select to authenticated
  using (
    profile_id = auth.uid()
    or app.can('leave.view.all')
    or (app.can('leave.view') and app.manages(auth.uid(), profile_id))
  );
-- Anyone may file their own request.
create policy leave_insert_self on public.leave_requests
  for insert to authenticated with check (profile_id = auth.uid());
create policy leave_decide on public.leave_requests
  for update to authenticated
  using (
    profile_id = auth.uid()
    or app.can('leave.approve.all')
    or (app.can('leave.approve') and app.manages(auth.uid(), profile_id))
  )
  with check (
    profile_id = auth.uid()
    or app.can('leave.approve.all')
    or (app.can('leave.approve') and app.manages(auth.uid(), profile_id))
  );

create policy approvals_read on public.approvals
  for select to authenticated
  using (requested_by = auth.uid() or app.can(required_permission, site_id));
create policy approvals_insert on public.approvals
  for insert to authenticated with check (true);
create policy approvals_decide on public.approvals
  for update to authenticated
  using (app.can(required_permission, site_id)) with check (app.can(required_permission, site_id));

-- ---------------------------------------------------------------------------
-- Payroll
-- ---------------------------------------------------------------------------

create policy pay_rules_read on public.pay_rules
  for select to authenticated using (app.can('rates.view', site_id));
create policy pay_rules_write on public.pay_rules
  for all to authenticated
  using (app.can('rates.manage', site_id)) with check (app.can('rates.manage', site_id));

create policy pay_components_read on public.pay_components
  for select to authenticated using (app.can('rates.view', site_id));
create policy pay_components_write on public.pay_components
  for all to authenticated
  using (app.can('rates.manage', site_id)) with check (app.can('rates.manage', site_id));

create policy profile_components_read on public.profile_pay_components
  for select to authenticated
  using (profile_id = auth.uid() or app.can('payroll.view'));
create policy profile_components_write on public.profile_pay_components
  for all to authenticated
  using (app.can('rates.manage')) with check (app.can('rates.manage'));

create policy periods_read on public.payroll_periods
  for select to authenticated using (app.can('payroll.view', site_id));
create policy periods_write on public.payroll_periods
  for all to authenticated
  using (app.can('payroll.run', site_id)) with check (app.can('payroll.run', site_id));

-- Managing someone does not imply seeing their pay: a Manager's remit is
-- attendance, so only the person themselves and payroll.view holders qualify.
create policy items_read on public.payroll_items
  for select to authenticated
  using (profile_id = auth.uid() or app.can('payroll.view'));
create policy items_write on public.payroll_items
  for all to authenticated
  using (app.can('payroll.run')) with check (app.can('payroll.run'));

create policy payslips_read on public.payslips
  for select to authenticated
  using (profile_id = auth.uid() or app.can('payslip.view.all'));
create policy payslips_write on public.payslips
  for all to authenticated
  using (app.can('payslip.generate')) with check (app.can('payslip.generate'));

-- ---------------------------------------------------------------------------
-- KPIs and expenses
-- ---------------------------------------------------------------------------

create policy kpis_read on public.department_kpis
  for select to authenticated using (app.can('kpi.view'));
create policy kpis_write on public.department_kpis
  for all to authenticated
  using (app.can('kpi.manage')) with check (app.can('kpi.manage'));

create policy expenses_read on public.expenses
  for select to authenticated using (app.can('expenses.view', site_id));
create policy expenses_write on public.expenses
  for all to authenticated
  using (app.can('expenses.manage', site_id)) with check (app.can('expenses.manage', site_id));

-- ---------------------------------------------------------------------------
-- Table privileges.
--
-- Easy to forget and silently fatal: Postgres checks GRANTs *before* it ever
-- evaluates a row policy, so a table with perfect policies and no grant denies
-- every query with "permission denied for table". The broad grant here is the
-- intended Supabase shape — table privileges are permissive and the policies
-- above do the real filtering.
-- ---------------------------------------------------------------------------

grant usage on schema app to authenticated, anon, service_role;
grant execute on all functions in schema app to authenticated, service_role;

grant usage on schema public to authenticated, anon, service_role;

grant select, insert, update, delete on all tables in schema public
  to authenticated, service_role;

grant usage, select on all sequences in schema public
  to authenticated, service_role;

-- Same treatment for anything added by a later migration.
alter default privileges in schema public
  grant select, insert, update, delete on tables to authenticated, service_role;

alter default privileges in schema public
  grant usage, select on sequences to authenticated, service_role;
