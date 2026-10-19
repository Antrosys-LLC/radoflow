-- ============================================================================
-- PENDING MIGRATION (18 Oct 2026) — paste this whole file into the Supabase
-- SQL editor:  Dashboard -> SQL Editor -> New query -> paste -> Run
--
-- The exact content of:
--
--   20261018090000_working_means_last_scan_was_in.sql
--
-- Run it after APPLY-2026-09-22.sql. The live board then stops counting
-- people whose latest scan was a check-out.
-- ============================================================================


-- >>> 20261018090000_working_means_last_scan_was_in.sql
-- ============================================================================
-- "Working" means the last scan was a check-in.
--
-- The board counted anyone whose day held a check-in and no check-out. Two ways
-- that was true of a man who had gone home:
--
--   * His check-out was filed under the next calendar date, where it was the
--     only punch of the day — and a day's first punch is its check-in. A night
--     worker rostered on days left at 05:16, the 05:00–10:00 window only covers
--     people rostered on nights, and the board counted him as just arrived.
--   * Two taps on the way in shifted every pairing after them, so the real
--     check-out read as a fresh check-in.
--
-- The application now pairs by the gate each scan came from and files a
-- check-out against the check-in it closes. This is the same rule at the last
-- line of defence, for rows already stored and for any corrected by hand: an
-- open check-in does not count if the person's latest scan since is a
-- check-out.
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
    -- Only a check-in the lateral below chose as open: inside the window and not
    -- followed by a check-out scan. An old one with no check-out was a missed
    -- scan, and that person has arrived and gone — finished, not on the floor.
    when a.first_in is not null and a.last_out is null and a.preference = 1 then 'working'
    when a.first_in is not null then 'finished'
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
           -- Their latest scan, not their first: a check-out after it means
           -- they have gone, whatever the day's stored pairing says.
           and coalesce((
             select last_scan.direction
               from public.punches last_scan
              where last_scan.profile_id = p.id
                and last_scan.punched_at >= still_in.first_in - interval '1 minute'
                and last_scan.punched_at <= now()
              order by last_scan.punched_at desc
              limit 1
           ), 'in') <> 'out'
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
  'Live floor status in Pakistan time. An open check-in within sixteen hours, not followed by a check-out scan, is working whatever the roster says; everyone else is read on their own shift date. Row visibility follows the same rules as attendance_days.';
