-- ============================================================================
-- PENDING MIGRATION (22 Sep 2026) — paste this whole file into the Supabase
-- SQL editor:  Dashboard -> SQL Editor -> New query -> paste -> Run
--
-- The exact content of:
--
--   20260922090000_live_board_is_the_floor_right_now.sql
--
-- Run it after APPLY-2026-09-19.sql (it needs shifts.overtime_until). The live
-- board and the dashboard then show whoever is on the floor at this minute,
-- day shift or night, and carry the day each row can be corrected through.
-- ============================================================================


-- >>> 20260922090000_live_board_is_the_floor_right_now.sql
-- ============================================================================
-- The live board is the floor at this minute, whatever the roster says.
--
-- `live_attendance` looked for each person's attendance on today's calendar
-- date. The night shift starts at 20:00 and runs to 08:00, and every punch it
-- makes after midnight is credited to the night it started on — yesterday. So
-- from 00:00 the board found no row for anybody on nights: everyone on the
-- floor dropped out of "working" and sat under "shift not started", and the
-- ones who never came were not "missing" either, because 02:00 is earlier
-- than 20:15.
--
-- Two things change.
--
-- 1. Anybody with a check-in and no check-out in the last sixteen hours is
--    working, on the date that check-in belongs to — the roster is not
--    consulted at all. At 06:45 that is the night shift; at 08:15 it is the
--    night shift still finishing its overtime *and* the day shift that has
--    just arrived; a supervisor covering a night off his own roster is on the
--    board the moment he scans. Sixteen hours because the longest shift plus
--    its overtime is twelve: past that it is a missed check-out, not a person
--    on the floor, and it stops claiming they are still here.
--
-- 2. Everyone else is read on their own shift's date. For a shift that crosses
--    midnight that is yesterday until its overtime ends, and "missing" is
--    measured from the start of the shift on that date as a timestamp, so it
--    no longer wraps round at midnight.
--
-- `day_id` and `day_status` are appended so the board can offer the correction
-- dialog per row — including for somebody with no stored day at all, where the
-- correction makes the row.
-- Needs `shifts.overtime_until` (20260919091000).
-- ============================================================================

create or replace view public.live_attendance
with (security_invoker = off) as
with clock as (
  select (now() at time zone 'Asia/Karachi') as local_now
)
select
  p.id                as profile_id,
  p.employee_code,
  p.full_name,
  p.site_id,
  p.department_id,
  p.shift_id,
  s.name              as shift_name,
  s.starts_at         as shift_starts_at,
  s.ends_at           as shift_ends_at,
  coalesce(a.work_date, d.work_date) as work_date,
  a.first_in,
  a.last_out,
  a.regular_hours,
  a.minutes_late,
  a.is_late,
  case
    when a.first_in is not null and a.last_out is null then 'working'
    when a.first_in is not null and a.last_out is not null then 'finished'
    when s.id is null then 'no_shift'
    -- Shift under way on its own date (grace allowed) and nothing from the terminal.
    when c.local_now >= d.work_date + s.starts_at + make_interval(mins => s.grace_minutes)
      then 'missing'
    else 'not_started'
  end                 as live_status,
  a.id                as day_id,
  a.status            as day_status
from public.profiles p
  left join public.shifts s on s.id = p.shift_id
  cross join clock c
  -- The date this person's shift is on right now.
  cross join lateral (
    select case
      when s.starts_at > coalesce(s.overtime_until, s.ends_at)
       and (
         c.local_now::time < coalesce(s.overtime_until, s.ends_at)
         or (
           c.local_now::time < time '10:00'
           and exists (
             select 1
               from public.attendance_days open_night
              where open_night.profile_id = p.id
                and open_night.work_date = c.local_now::date - 1
                and open_night.first_in is not null
                and open_night.last_out is null
           )
         )
       )
        then c.local_now::date - 1
      else c.local_now::date
    end as work_date
  ) d
  -- A check-in that is still open outranks the roster; otherwise the shift's date.
  left join lateral (
    select pick.*
      from (
        select still_in.*, 1 as preference
          from public.attendance_days still_in
         where still_in.profile_id = p.id
           and still_in.work_date >= c.local_now::date - 1
           and still_in.work_date <= c.local_now::date
           and still_in.first_in is not null
           and still_in.last_out is null
           -- Within the window, and not ahead of the clock: a terminal whose
           -- own time has run fast must not put somebody on the floor early.
           and still_in.first_in >= now() - interval '16 hours'
           and still_in.first_in <= now()
        union all
        select on_date.*, 2
          from public.attendance_days on_date
         where on_date.profile_id = p.id
           and on_date.work_date = d.work_date
      ) pick
     order by pick.preference, pick.first_in desc nulls last
     limit 1
  ) a on true
where p.status = 'active'
  and p.requires_attendance
  and (
    p.id = auth.uid()
    or app.can('attendance.view.all', p.site_id)
    or (app.can('attendance.view', p.site_id) and p.manager_id = auth.uid())
  );

grant select on public.live_attendance to authenticated;

comment on view public.live_attendance is
  'Live floor status in Pakistan time. An open check-in within sixteen hours is working whatever the roster says; everyone else is read on their own shift date. Row visibility follows the same rules as attendance_days.';
