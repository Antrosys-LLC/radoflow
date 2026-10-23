-- ---------------------------------------------------------------------------
-- A meal is once per serving day, not once per rolling 24 hours.
--
-- 20260905090000 refused a second claim within 24 hours of the first. That is
-- not how a canteen is used: lunch is eaten between 11:00 and 15:00, and
-- someone who ate at 13:30 on Monday and comes at 12:40 on Tuesday is eleven
-- minutes short of 24 hours and was refused as a "duplicate" — fed, and not
-- counted.
--
-- Measured on 19–23 October: 155 of the 265 refusals came 20–24 hours after
-- that person's previous meal. Those were next-day lunches, not second
-- helpings. The 20th showed 93 servings against about 175 people actually
-- scanned; the 21st, 115.
--
-- The limit is now counted against the day the serving belongs to
-- (`served_on`), the same date the counter tally, the menu and the bill use. A
-- window that runs past midnight already credits its after-midnight half to the
-- day it opened, so one dinner is still one meal.
--
-- A person limited to one meal also may not be served twice within eight hours
-- either side. That catches what the date alone would let through — a 03:00
-- scan with no window around it lands on the next date — and the second tap of
-- a finger that did not register the first time. It is not applied where the
-- limit is more than one, which is a contract firm's agreement to feed its
-- people more than once a day.
--
-- The advisory lock stays, for the reason 20260905090000 gives: an EXISTS test
-- alone is not atomic under READ COMMITTED.
-- ---------------------------------------------------------------------------

create or replace function app.enforce_meal_interval()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_limit integer;
  v_day   date;
  v_taken integer;
begin
  perform pg_advisory_xact_lock(hashtextextended(new.profile_id::text, 0));

  select coalesce(p.meals_per_day, d.meals_per_day, 1)
    into v_limit
    from public.profiles p
    left join public.departments d on d.id = p.department_id
   where p.id = new.profile_id;

  v_limit := coalesce(v_limit, 1);
  v_day   := coalesce(new.served_on, (new.claimed_at at time zone 'Asia/Karachi')::date);

  select count(*)
    into v_taken
    from public.meal_claims c
   where c.profile_id = new.profile_id
     and coalesce(c.served_on, (c.claimed_at at time zone 'Asia/Karachi')::date) = v_day;

  if v_taken >= v_limit then
    raise exception 'This person has already had % meal(s) for %.', v_limit, v_day
      using errcode = 'unique_violation';
  end if;

  if v_limit = 1 and exists (
    select 1
      from public.meal_claims c
     where c.profile_id = new.profile_id
       and c.claimed_at >  new.claimed_at - interval '8 hours'
       and c.claimed_at <  new.claimed_at + interval '8 hours'
  ) then
    raise exception 'This person was served within the last 8 hours.'
      using errcode = 'unique_violation';
  end if;

  return new;
end;
$$;

comment on function app.enforce_meal_interval() is
  'At most meals_per_day meals (the person''s, else their department''s, else one) per serving day (served_on), and for a one-meal person none within 8 hours either side. Made atomic by a per-profile advisory lock. Raises 23505 so ingestion reads it as a duplicate.';

comment on column public.departments.meals_per_day is
  'Meals each person in this department may take on one serving day — agreed with a contract firm. Null is one.';
