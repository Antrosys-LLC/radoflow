-- ============================================================================
-- Development seed: two factories, their departments, rate rules, statutory
-- deductions, a terminal per site, and one signed-in user per role.
--
-- Applied automatically by `npm run db:reset`. Never run against production —
-- the passwords below are public knowledge.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- Sites and departments
-- ---------------------------------------------------------------------------

insert into public.sites (id, code, name, timezone) values
  ('11111111-1111-1111-1111-111111111111', 'DYE', 'Factory 1 — Dyeing Unit',  'Asia/Karachi'),
  ('22222222-2222-2222-2222-222222222222', 'TEX', 'Factory 2 — Textile Unit', 'Asia/Karachi');

insert into public.departments (site_id, code, name)
select s.id, d.code, d.name
  from public.sites s
  cross join (values
    ('SPIN', 'Spinning'),
    ('DYE',  'Dyeing'),
    ('QC',   'Quality'),
    ('PACK', 'Packaging'),
    ('ADMIN','Administration')
  ) as d(code, name);

-- Sunday and Saturday off by default; any date can override this.
insert into public.work_week (site_id, weekday, is_working)
select s.id, w.weekday, w.is_working
  from public.sites s
  cross join (values
    (0, false), (1, true), (2, true), (3, true), (4, true), (5, true), (6, false)
  ) as w(weekday, is_working);

-- ---------------------------------------------------------------------------
-- Rates: 8-hour day, overtime at 1.5x, weekend and holiday shifts at 2x
-- ---------------------------------------------------------------------------

-- Explicit rupees per hour, not multiples of the base wage.
insert into public.pay_rules (
  site_id, effective_from, standard_hours_per_day, standard_days_per_month,
  ot_hourly_rate, weekend_hourly_rate, holiday_hourly_rate, night_hourly_rate
)
select id, date '2026-01-01', 8, 26, 480, 640, 700, 400 from public.sites;

-- ---------------------------------------------------------------------------
-- Three shifts per factory. The night shift crosses midnight.
-- ---------------------------------------------------------------------------

insert into public.shifts (site_id, code, name, starts_at, ends_at, grace_minutes, break_minutes, sort_order)
select s.id, v.code, v.name, v.starts_at::time, v.ends_at::time, v.grace, v.brk, v.sort
  from public.sites s
  cross join (values
    ('A', 'Shift A — Morning',  '06:00', '14:00', 10, 30, 10),
    ('B', 'Shift B — Evening',  '14:00', '22:00', 10, 30, 20),
    ('C', 'Shift C — Night',    '22:00', '06:00', 15, 30, 30)
  ) as v(code, name, starts_at, ends_at, grace, brk, sort);

-- The operative late rule: one open-ended band, charged by the minute.
-- penalty_percent is meaningless for this basis and stores 100, read as "one
-- hundred percent of one minute's wage" — mirrors
-- 20260904090250_seed_per_minute_tier.sql, which only back-fills this row for
-- a site that was already seeded before that migration existed.
insert into public.late_penalty_rules (site_id, label, from_minutes, to_minutes, penalty_percent, basis, is_active)
select s.id, 'Late arrival — per minute', 0, null, 100, 'minute', true
  from public.sites s;

-- Tiered late deductions, as a percentage of one day's pay. Seeded inactive:
-- findTier() in src/lib/payroll/late.ts picks the *narrowest* matching band,
-- so if these were active they would win over the per-minute band above for
-- every lateness under two hours — the exact inversion the per-minute tier
-- exists to fix. Mirrors what 20260904090500_deactivate_percentage_late_tiers.sql
-- does to a database seeded before that migration. Kept as rows, not left
-- out, so a site can deliberately flip is_active back on — do not "fix" this
-- back to true without also touching findTier()'s tie-break.
insert into public.late_penalty_rules (site_id, label, from_minutes, to_minutes, penalty_percent, basis, is_active)
select s.id, v.label, v.from_min, v.to_min, v.pct, 'day', false
  from public.sites s
  cross join (values
    ('Late 15–30 minutes',   15,   30,  5.0),
    ('Late 30–60 minutes',   30,   60, 10.0),
    ('Late 1–2 hours',       60,  120, 25.0),
    ('Late beyond 2 hours',  120, null, 50.0)
  ) as v(label, from_min, to_min, pct);

insert into public.pay_components (site_id, code, label, kind, calc, amount, percent, is_statutory, sort_order)
select s.id, c.code, c.label, c.kind::public.component_kind, c.calc::public.component_calc,
       c.amount, c.percent, c.is_statutory, c.sort_order
  from public.sites s
  cross join (values
    ('EOBI',  'EOBI contribution',   'deduction', 'fixed',   370.0, 0.0,  true,  10),
    ('SESSI', 'Social security',     'deduction', 'percent',   0.0, 1.0,  true,  20),
    ('PF',    'Provident fund',      'deduction', 'percent',   0.0, 5.0,  false, 30)
  ) as c(code, label, kind, calc, amount, percent, is_statutory, sort_order);

-- Progressive income tax, applied to gross.
insert into public.pay_components (site_id, code, label, kind, calc, slabs, is_statutory, sort_order)
select id, 'TAX', 'Income tax', 'tax', 'slab',
  '[{"upto": 50000, "rate": 0}, {"upto": 100000, "rate": 2.5}, {"upto": 200000, "rate": 12.5}, {"upto": null, "rate": 20}]'::jsonb,
  true, 90
  from public.sites;

insert into public.leave_types (site_id, code, name, is_paid, annual_quota)
select s.id, l.code, l.name, l.is_paid, l.quota
  from public.sites s
  cross join (values
    ('ANNUAL', 'Annual leave',   true,  14.0),
    ('SICK',   'Sick leave',     true,  10.0),
    ('CASUAL', 'Casual leave',   true,  10.0),
    ('UNPAID', 'Unpaid leave',   false,  0.0)
  ) as l(code, name, is_paid, quota);

-- ---------------------------------------------------------------------------
-- Biometric terminals
-- ---------------------------------------------------------------------------

insert into public.devices (site_id, name, model, serial_number, mode, ip_address, port)
values
  ('11111111-1111-1111-1111-111111111111', 'Dyeing — main gate',  'ZKTeco K50', 'K50-DYE-0001', 'push', '192.168.1.201', 4370),
  ('22222222-2222-2222-2222-222222222222', 'Textile — main gate', 'ZKTeco K50', 'K50-TEX-0001', 'push', '192.168.1.202', 4370);

-- ---------------------------------------------------------------------------
-- Demo accounts
--
-- Sign in with the CNIC, not the email. Password for every account: antrosys123
-- ---------------------------------------------------------------------------

create or replace function pg_temp.seed_user(
  p_email        text,
  p_cnic         text,
  p_full_name    text,
  p_code         text,
  p_role         text,
  p_site         uuid,
  p_dept_code    text,
  p_pay_class    public.pay_class,
  p_monthly      numeric,
  p_hourly       numeric
) returns uuid
language plpgsql
as $$
declare
  v_user_id uuid := gen_random_uuid();
  v_dept    uuid;
begin
  -- The empty-string token columns are not decoration: GoTrue scans them into
  -- non-nullable Go strings, so a NULL makes every sign-in fail with the
  -- opaque "Database error querying schema".
  insert into auth.users (
    id, instance_id, aud, role, email, encrypted_password,
    email_confirmed_at, created_at, updated_at,
    raw_app_meta_data, raw_user_meta_data,
    confirmation_token, recovery_token,
    email_change, email_change_token_new, email_change_token_current,
    phone_change, phone_change_token, reauthentication_token,
    is_sso_user, is_anonymous
  ) values (
    v_user_id, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
    p_email, crypt('antrosys123', gen_salt('bf')),
    now(), now(), now(),
    '{"provider":"email","providers":["email"]}'::jsonb,
    jsonb_build_object('full_name', p_full_name, 'email', p_email),
    '', '', '', '', '', '', '', '',
    false, false
  );

  -- Supabase links each sign-in method through auth.identities; without an
  -- email identity the account exists but cannot authenticate.
  insert into auth.identities (
    id, user_id, provider_id, provider, identity_data, created_at, updated_at, last_sign_in_at
  ) values (
    gen_random_uuid(), v_user_id, v_user_id::text, 'email',
    jsonb_build_object('sub', v_user_id::text, 'email', p_email, 'email_verified', true),
    now(), now(), now()
  );

  select id into v_dept
    from public.departments
   where site_id = p_site and code = p_dept_code;

  insert into public.profiles (
    id, employee_code, full_name, cnic, email, site_id, department_id,
    pay_class, monthly_salary, hourly_rate, requires_attendance
  ) values (
    v_user_id, p_code, p_full_name, p_cnic, p_email, p_site, v_dept,
    p_pay_class, p_monthly, p_hourly, p_pay_class = 'hourly'
  );

  insert into public.user_roles (user_id, role_id)
  select v_user_id, id from public.roles where key = p_role;

  return v_user_id;
end;
$$;

select pg_temp.seed_user('admin@radoflow.test',      '35201-1000001-1', 'Rado Administrator',   'RD-0001', 'admin-antrosys',      '11111111-1111-1111-1111-111111111111', 'ADMIN', 'monthly', 260000, 0);
select pg_temp.seed_user('ceo@radoflow.test',        '35201-1000002-2', 'Rado Chief Executive', 'RD-0002', 'ceo',        '11111111-1111-1111-1111-111111111111', 'ADMIN', 'monthly', 900000, 0);
select pg_temp.seed_user('operations@radoflow.test', '35201-1000003-3', 'Rado Operations Head', 'RD-0003', 'operations', '11111111-1111-1111-1111-111111111111', 'ADMIN', 'monthly', 650000, 0);
select pg_temp.seed_user('manager@radoflow.test',    '35201-1000004-4', 'Ayesha Khan',          'RD-1041', 'manager',    '11111111-1111-1111-1111-111111111111', 'DYE',   'monthly', 180000, 0);
select pg_temp.seed_user('worker@radoflow.test',     '35201-1000005-5', 'Imran Sheikh',         'RD-1042', 'employee',   '11111111-1111-1111-1111-111111111111', 'SPIN',  'hourly',       0, 320);

-- Imran reports to Ayesha, so the Manager scope has something to resolve.
update public.profiles
   set manager_id = (select id from public.profiles where employee_code = 'RD-1041')
 where employee_code = 'RD-1042';

-- Terminal enrolments are created automatically by the profiles/devices
-- triggers, keyed on employee_code — the ERP code and the K50 id are the same
-- number by construction.

-- Put the hourly staff on the morning shift so the live board has something
-- to show; assign the rest to Shift A as well.
update public.profiles p
   set shift_id = (select s.id from public.shifts s
                    where s.site_id = p.site_id and s.code = 'A')
 where p.site_id is not null;

-- A negotiated overtime rate for one operator, proving per-person overrides
-- take precedence over the site default.
update public.profiles
   set ot_hourly_rate = 550
 where employee_code = 'RD-1042';
