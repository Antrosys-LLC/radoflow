-- ============================================================================
-- The capability catalogue and default role grants.
--
-- These are defaults, not laws: every row here is editable at runtime from the
-- control centre. Adding a capability to the product means inserting one row in
-- public.permissions — no policy rewrite, because RLS reads this table.
--
-- Role shape:
--   Admin      unrestricted — adds users, sees everything, does everything
--   CEO        unrestricted — manages the whole company
--   Operations attendance only, company-wide (COO)
--   Manager    attendance only, own department, may correct missed marks
--   Employee   own records only
-- ============================================================================

insert into public.permissions (key, module, action, label, description) values
  -- Dashboards
  ('dashboard.executive', 'dashboard', 'view',   'Executive dashboard',      'Company-wide view across all factories.'),
  ('dashboard.admin',     'dashboard', 'view',   'Admin dashboard',          'Full administration console.'),
  ('dashboard.operations','dashboard', 'view',   'Operations dashboard',     'Company-wide attendance and workforce view.'),
  ('dashboard.manager',   'dashboard', 'view',   'Manager dashboard',        'Own department view.'),
  ('dashboard.employee',  'dashboard', 'view',   'My dashboard',             'Personal attendance and payslips.'),

  -- People
  ('directory.view',      'people',    'view',   'View employee directory',  'Browse staff across permitted sites.'),
  ('people.view',         'people',    'view',   'View employee records',    'Open a full employee record.'),
  ('people.manage',       'people',    'manage', 'Add and edit employees',   'Create, edit, suspend and terminate staff.'),

  -- Attendance. The plain keys are scoped to the holder's own reports; the
  -- ".all" variants extend the same action company-wide.
  ('attendance.view',     'attendance','view',   'View team attendance',     'See attendance for their own reports.'),
  ('attendance.view.all', 'attendance','view',   'View all attendance',      'See attendance for every employee.'),
  ('attendance.edit',     'attendance','manage', 'Correct team attendance',  'Mark a missed punch for their own reports.'),
  ('attendance.edit.all', 'attendance','manage', 'Correct all attendance',   'Mark or override attendance for anyone.'),
  ('attendance.approve',  'attendance','approve','Approve attendance',       'Sign off a period''s attendance.'),
  ('calendar.manage',     'attendance','manage', 'Manage working calendar',  'Declare off-days and activate weekend shifts.'),

  -- Devices
  ('devices.view',        'devices',   'view',   'View biometric devices',   'See device health and sync status.'),
  ('devices.manage',      'devices',   'manage', 'Manage biometric devices', 'Add, configure and sync ZKTeco terminals.'),

  -- Leave
  ('leave.request',       'leave',     'create', 'Request leave',            'Submit own leave requests.'),
  ('leave.view',          'leave',     'view',   'View team leave',          'See requests from their own reports.'),
  ('leave.view.all',      'leave',     'view',   'View all leave',           'See every leave request.'),
  ('leave.approve',       'leave',     'approve','Approve team leave',       'Decide requests from their own reports.'),
  ('leave.approve.all',   'leave',     'approve','Approve all leave',        'Decide any leave request.'),

  -- Payroll
  ('payroll.view',        'payroll',   'view',   'View payroll',             'See payroll runs and totals.'),
  ('payroll.run',         'payroll',   'manage', 'Run payroll',              'Calculate and recalculate a pay period.'),
  ('payroll.approve',     'payroll',   'approve','Approve payroll',          'Sign off a payroll run.'),
  ('payroll.pay',         'payroll',   'manage', 'Mark payroll paid',        'Close a run as disbursed.'),
  ('payslip.view.all',    'payroll',   'view',   'View all payslips',        'Open any employee''s payslip.'),
  ('payslip.generate',    'payroll',   'manage', 'Generate payslips',        'Issue payslips for a run.'),

  -- Rates and money rules
  ('rates.view',          'rates',     'view',   'View pay rules',           'See hourly, overtime and weekend rates.'),
  ('rates.manage',        'rates',     'manage', 'Manage pay rules',         'Change rates, multipliers and deductions.'),

  -- Reporting
  ('reports.view',        'reports',   'view',   'View reports',             'Company and departmental reporting.'),
  ('kpi.view',            'reports',   'view',   'View department KPIs',     'Departmental performance tracking.'),
  ('kpi.manage',          'reports',   'manage', 'Manage department KPIs',   'Set targets and record actuals.'),
  ('expenses.view',       'reports',   'view',   'View expenses',            'Expense breakdown by category.'),
  ('expenses.manage',     'reports',   'manage', 'Manage expenses',          'Record and adjust expenses.'),

  -- Governance
  ('access.manage',       'access',    'manage', 'Manage access',            'Grant or revoke any capability for any person.'),
  ('settings.manage',     'settings',  'manage', 'Manage settings',          'Sites, departments, leave types and org setup.'),
  ('audit.view',          'audit',     'view',   'View audit trail',         'See every action taken in the system.');

insert into public.roles (key, name, description, is_system, is_superuser, rank) values
  ('admin',      'Admin',      'Unrestricted. Adds and edits users, sees every record, performs every action.', true, true,  10),
  ('ceo',        'CEO',        'Unrestricted. Manages the whole company and everyone''s access.',              true, true,  20),
  ('operations', 'Operations', 'Attendance only, across every factory. No payroll or pay-rate access.',        true, false, 30),
  ('manager',    'Manager',    'Attendance for their own department, including correcting missed marks.',      true, false, 40),
  ('employee',   'Employee',   'Own attendance and payslips only.',                                            true, false, 50);

-- Default grants.
--
-- Admin and CEO are intentionally absent: app.has_permission() short-circuits
-- for superuser roles, so they hold everything implicitly and can never be
-- locked out of the control centre by an accidental edit here.
insert into public.role_permissions (role_id, permission_id)
select r.id, p.id
  from public.roles r
  join public.permissions p on true
 where (r.key, p.key) in (
   -- Operations (COO) — attendance across every factory, and nothing that
   -- touches money. Deliberately no payroll.*, rates.* or expenses.*.
   ('operations', 'dashboard.operations'), ('operations', 'directory.view'),
   ('operations', 'attendance.view.all'),  ('operations', 'attendance.edit.all'),
   ('operations', 'attendance.approve'),   ('operations', 'calendar.manage'),
   ('operations', 'devices.view'),
   ('operations', 'leave.view.all'),       ('operations', 'leave.approve.all'),
   ('operations', 'reports.view'),
   ('operations', 'dashboard.employee'),   ('operations', 'leave.request'),

   -- Manager — attendance for their own department. attendance.edit is what
   -- lets them mark someone who was missed by the terminal; the RLS policy
   -- keeps the scope to their own reports.
   ('manager', 'dashboard.manager'), ('manager', 'directory.view'),
   ('manager', 'attendance.view'),   ('manager', 'attendance.edit'),
   ('manager', 'leave.view'),        ('manager', 'leave.approve'),
   ('manager', 'dashboard.employee'),('manager', 'leave.request'),
   -- Note: no payroll.*, rates.* or people.manage. The directory they can see
   -- is the pay-free public.employee_directory view, not public.profiles.

   -- Employee — self only
   ('employee', 'dashboard.employee'), ('employee', 'leave.request')
 );
