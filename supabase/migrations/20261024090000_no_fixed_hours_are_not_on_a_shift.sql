-- ============================================================================
-- People with no fixed hours are not on a shift.
--
-- Somebody with no in or out time to keep (flexible_hours) or paid a fixed
-- salary (requires_attendance = false) has no shift to be late for or absent
-- from. The board used to chase the first group as "not checked in" and list
-- them under "shift not started yet", and left the second off altogether.
--
-- Both now appear, with a status of their own, `no_fixed_time`, whenever they
-- have not scanned today; once they scan they are working or finished like
-- anybody else. The two flags ride along so the screen can say which it is.
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
    -- No in or out time, or a fixed salary: nothing to be late for or absent from.
    when p.flexible_hours or not p.requires_attendance then 'no_fixed_time'
    when s.id is null then 'no_shift'
    -- Shift under way on its own date (grace allowed) and nothing from the terminal.
    when c.local_now >= d.work_date + s.starts_at + make_interval(mins => s.grace_minutes)
      then 'missing'
    else 'not_started'
  end                 as live_status,
  a.id                as day_id,
  a.status            as day_status,
  p.flexible_hours,
  p.requires_attendance
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
  and (
    p.id = auth.uid()
    or app.can('attendance.view.all', p.site_id)
    or (app.can('attendance.view', p.site_id) and p.manager_id = auth.uid())
  );

grant select on public.live_attendance to authenticated;

comment on view public.live_attendance is
  'Live floor status in Pakistan time. People with no fixed hours or a fixed salary read as no_fixed_time until they scan. An open check-in within sixteen hours, not followed by a check-out scan, is working whatever the roster says; everyone else is read on their own shift date. Row visibility follows the same rules as attendance_days.';
