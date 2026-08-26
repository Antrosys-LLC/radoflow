-- ============================================================================
-- Give every site a working week.
--
-- work_week is only ever populated by supabase/seed.sql, which must never run
-- against production — so a real deployment has no rows at all. With none,
-- app.resolve_day_type falls through to "workday" for every date, which makes
-- Sunday look like an ordinary working day: the live board reports the entire
-- factory as absent, every Sunday.
--
-- Payroll was never affected. It decides Sunday from the date rather than from
-- the day type, precisely so a missing calendar cannot silently reprice a
-- month. This fixes the attendance side.
--
-- The previous migration's `update ... where weekday = 6` was a no-op for the
-- same reason: there was no row to update.
-- ============================================================================

insert into public.work_week (site_id, weekday, is_working)
select s.id, w.weekday, w.is_working
  from public.sites s
  cross join (values
    (0, false),  -- Sunday: the only day off. Work on one is overtime.
    (1, true),
    (2, true),
    (3, true),
    (4, true),
    (5, true),
    (6, true)    -- Saturday is an ordinary working day here.
  ) as w(weekday, is_working)
on conflict (site_id, weekday) do nothing;

-- A site set up before "all days except Sunday" may still have Saturday off.
-- Now that rows are guaranteed to exist, this actually has something to change.
update public.work_week set is_working = true  where weekday = 6;
update public.work_week set is_working = false where weekday = 0;
