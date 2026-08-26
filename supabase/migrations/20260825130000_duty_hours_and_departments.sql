-- ============================================================================
-- Duty hours, contractors, and the real department list.
--
-- Three things the pay model could not express before:
--
--   1. How many hours a person's salary covers. A guard works twelve and is
--      paid for twelve; an operator on the same twelve-hour shift is paid for
--      eight, with the last four as overtime. Same clock, different boundary.
--   2. Whether Sunday is expected of them, and on what terms.
--   3. That some departments are staffed by contractors, who receive an agreed
--      amount and no calculation at all.
--
-- See docs/superpowers/specs/2026-08-25-duty-hours-and-salary-formula-design.md
-- ============================================================================

create type public.worker_type   as enum ('employee', 'contractor');
create type public.sunday_policy as enum ('off', 'optional', 'compulsory');

-- ---------------------------------------------------------------------------
-- Departments carry the default, people carry the truth
--
-- Putting the default on the department means adding someone to Folding does
-- not require remembering that Folding is contracted out. Overriding it per
-- person is still allowed: a directly-employed supervisor inside a contractor
-- department is a real case.
-- ---------------------------------------------------------------------------

alter table public.departments
  add column default_worker_type public.worker_type not null default 'employee';

alter table public.profiles
  add column worker_type   public.worker_type   not null default 'employee',
  add column duty_hours    numeric(4, 2)        not null default 8
    check (duty_hours > 0 and duty_hours <= 24),
  add column sunday_policy public.sunday_policy not null default 'off';

comment on column public.profiles.duty_hours is
  'Hours this person''s salary covers on a duty day. Work beyond it is overtime; work below it is still a full working day. Eight for most, twelve for guards.';

comment on column public.profiles.sunday_policy is
  'Whether Sunday is expected. Sunday is never a working day for pay: every hour worked on one is overtime, whatever this says. Compulsory only marks a missed Sunday as a violation.';

comment on column public.profiles.worker_type is
  'Contractors are paid the agreed amount in monthly_salary, flat. No day proration, no overtime, no late penalty.';

create index on public.profiles (worker_type);

-- ---------------------------------------------------------------------------
-- Saturday is a working day
--
-- The rule is "all days except Sunday". The original work week had Saturday
-- off, which would have paid every Saturday at the overtime rate — a large and
-- entirely silent overpayment.
-- ---------------------------------------------------------------------------

update public.work_week set is_working = true where weekday = 6;

-- ---------------------------------------------------------------------------
-- The 34 departments
--
-- Applied to every site. Idempotent, so a site added later can be back-filled
-- by re-running the same insert.
-- ---------------------------------------------------------------------------

insert into public.departments (site_id, code, name, default_worker_type)
select s.id, d.code, d.name, d.worker_type::public.worker_type
  from public.sites s
  cross join (values
    ('ADMIN',  'Admin',              'employee'),
    ('ACCT',   'Accounts',           'employee'),
    ('KORA',   'Kora',               'employee'),
    ('TSTORE', 'Tayyar Store',       'employee'),
    ('ELEC',   'Electric',           'employee'),
    ('WSHOP',  'Workshop',           'employee'),
    ('CREAT',  'Creation',           'employee'),
    ('KARE',   'Kare',               'employee'),
    ('SING',   'Singing',            'employee'),
    ('KARADR', 'Kara Drawing',       'employee'),
    ('MERC',   'Mercrize',           'employee'),
    ('BOUZ',   'Bouzer',             'employee'),
    ('ENGR',   'Engraving',          'employee'),
    ('COLOR',  'Color',              'employee'),
    ('SUNTX',  'Suntex',             'employee'),
    ('DGMAN',  'Digital Mandi Man',  'employee'),
    ('AUTO1',  'Auto 01',            'employee'),
    ('AUTO2',  'Auto 02',            'employee'),
    ('CALND',  'Calander',           'employee'),
    ('SOOPR',  'Sooper',             'employee'),
    ('VENCH',  'Vench',              'employee'),
    ('AGER',   'Ager Machine',       'employee'),
    ('JIGDY',  'Jigger Dyeing',      'employee'),
    ('JIGDR',  'Jigger Drawing',     'employee'),
    ('DGMC',   'Digital Machine',    'employee'),
    ('PPC',    'PPC',                'employee'),
    ('BOILR',  'Boiler',             'employee'),
    ('GM',     'GM',                 'employee'),
    ('SWEEP',  'Sweepers',           'employee'),
    ('RESGN',  'Resigned',           'employee'),
    ('FOLD',   'Folding',            'contractor'),
    ('YCP',    'Yasine CP',          'contractor'),
    ('ZNP',    'Zafar Nug Packing',  'contractor'),
    ('ANTRO',  'Antrosys',           'contractor')
  ) as d(code, name, worker_type)
on conflict (site_id, code) do nothing;

-- A department that already existed under one of these codes keeps its name
-- but adopts the contractor flag, so Folding is contracted out even on a site
-- that happened to have a Folding department already.
update public.departments d
   set default_worker_type = 'contractor'
  from (values ('FOLD'), ('YCP'), ('ZNP'), ('ANTRO')) as c(code)
 where d.code = c.code
   and d.default_worker_type <> 'contractor';

-- ---------------------------------------------------------------------------
-- People inherit their department's default
--
-- Only ever fires for rows the caller left alone: an explicit worker_type on
-- the insert or update is honoured as given.
-- ---------------------------------------------------------------------------

create or replace function app.default_worker_type_from_department()
returns trigger
language plpgsql
as $$
begin
  if new.department_id is null then
    return new;
  end if;

  -- On update, only follow the department when the department itself changed.
  -- Otherwise setting someone's worker_type by hand would be undone by the
  -- next unrelated save.
  if tg_op = 'UPDATE'
     and new.department_id is not distinct from old.department_id then
    return new;
  end if;

  /*
   * On insert, only fill in a value the caller left at the column default.
   * An explicit 'contractor' is a decision and is kept; 'employee' cannot be
   * told apart from "not specified", so it defers to the department. Putting a
   * directly-employed supervisor inside a contractor department therefore takes
   * a second save, which is rare enough to be worth the simpler rule.
   */
  if tg_op = 'INSERT' and new.worker_type <> 'employee' then
    return new;
  end if;

  select d.default_worker_type
    into new.worker_type
    from public.departments d
   where d.id = new.department_id;

  return new;
end;
$$;

create trigger profiles_default_worker_type
  before insert or update of department_id on public.profiles
  for each row execute function app.default_worker_type_from_department();
