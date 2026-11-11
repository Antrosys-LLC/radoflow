-- ============================================================================
-- Delete the 157 suspended people with the old thousand-range codes (RD-2003 …
-- RD-3203). Run it yourself in the Supabase SQL editor; RadoFlow did not run it.
--
-- THIS CANNOT BE UNDONE. It also deletes everything attached to them: about 422
-- payroll lines, 1,779 attendance days, 1,101 punches and 110 meals. Past
-- payroll runs will then show fewer people and lower totals.
--
-- 1. Check the list first.
-- ============================================================================
select employee_code, full_name, status
  from public.profiles
 where status = 'suspended' and employee_code ~ '^RD-[0-9]+$'
 order by employee_code;

-- 2. Then delete (uncomment). Deleting the login removes the profile with it.
-- delete from auth.users
--  where id in (
--    select id from public.profiles
--     where status = 'suspended' and employee_code ~ '^RD-[0-9]+$'
--  );
