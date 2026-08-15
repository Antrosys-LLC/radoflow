-- ============================================================================
-- Live floor status.
--
-- Answers the question every supervisor asks first: who is on the floor right
-- now, and whose shift has started without them. Computed in the database so
-- the CEO, Operations, Admin and a line Manager all read exactly the same
-- numbers — and so each still only sees the rows their role permits.
-- ============================================================================

/**
 * One row per active employee expected to clock in, for a given date.
 *
 * `working` means checked in and not yet out. `missing` means their shift has
 * already started (grace included) and no punch has arrived — the list that
 * actually needs chasing.
 */
create or replace view public.live_attendance
with (security_invoker = off) as
with today as (
  select (now() at time zone 'Asia/Karachi')::date as work_date,
         (now() at time zone 'Asia/Karachi')       as local_now
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
  t.work_date,
  a.first_in,
  a.last_out,
  a.regular_hours,
  a.minutes_late,
  a.is_late,
  case
    when a.first_in is not null and a.last_out is null then 'working'
    when a.first_in is not null and a.last_out is not null then 'finished'
    when s.id is null then 'no_shift'
    -- Shift under way (grace allowed) and still nothing from the terminal.
    when (t.local_now::time) >= (s.starts_at + make_interval(mins => s.grace_minutes))
      then 'missing'
    else 'not_started'
  end                 as live_status
from public.profiles p
  left join public.shifts s on s.id = p.shift_id
  cross join today t
  left join public.attendance_days a
    on a.profile_id = p.id and a.work_date = t.work_date
where p.status = 'active'
  and p.requires_attendance
  and (
    p.id = auth.uid()
    or app.can('attendance.view.all', p.site_id)
    or (app.can('attendance.view', p.site_id) and p.manager_id = auth.uid())
  );

grant select on public.live_attendance to authenticated;

comment on view public.live_attendance is
  'Live floor status for today in Pakistan time. Row visibility follows the same rules as attendance_days.';
