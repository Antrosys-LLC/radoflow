-- ============================================================================
-- When a fixed-salary joiner's pay starts
--
-- A fixed salary is the whole month, so a joiner added partway through one
-- would be paid all of it. The add-user form records the date the office
-- entered; the payroll run pays a fixed salary from that day. Null means the
-- person was there throughout, which is true of everybody already on the books
-- (their joined_on is only the day their record was created).
-- ============================================================================

alter table public.profiles add column if not exists salary_from date;

comment on column public.profiles.salary_from is
  'First day a fixed salary is owed. Null = whole month. Set by the add-user form from the joining date typed.';
