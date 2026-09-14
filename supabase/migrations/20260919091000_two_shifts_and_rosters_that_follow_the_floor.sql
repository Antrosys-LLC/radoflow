-- ============================================================================
-- Two eight-hour shifts, each with its overtime behind it — and a roster that
-- follows the floor.
--
-- The factory runs a day shift from 08:00 to 16:00 and a night shift from
-- 20:00 to 04:00. The four hours after each are overtime: the day shift's run
-- to 20:00, the night shift's to 08:00. The shifts were stored as two twelve-
-- hour blocks, which put the end of the working day at the end of overtime —
-- so the board could never say a person was on overtime, only still at work.
--
-- `overtime_until` is where overtime stops. It changes nothing the payroll
-- engine pays: the salary still covers `duty_hours`, and anything past that is
-- overtime up to `pay_rules.ot_daily_cap_hours`. It is the shift's own
-- statement of the window, for the board and for the roster.
--
-- People move between the two. Somebody on nights for a fortnight who starts
-- turning up at eight in the morning is on days now, and a roster that still
-- says nights marks him late by twelve hours every morning until somebody in
-- the office notices. So a person's shift follows their check-ins: after
-- `shifts.auto_switch_after_days` attended days in a row that all started on
-- the other shift, they are moved to it. `shift_follows_attendance` switches
-- that off for one person — a supervisor rostered on nights who covers the
-- odd day must not be flipped by it.
-- ============================================================================

alter table public.shifts
  add column if not exists overtime_until time;

comment on column public.shifts.overtime_until is
  'Where this shift''s overtime window ends. From ends_at to here is overtime; the daily overtime cap still applies.';

insert into public.shifts (site_id, code, name, starts_at, ends_at, overtime_until, grace_minutes, sort_order)
select s.id, v.code, v.name, v.starts_at::time, v.ends_at::time, v.ot_until::time, 15, v.sort_order
  from public.sites s
  cross join (values
    ('DAY',   'Day · 8am to 4pm, overtime to 8pm',   '08:00', '16:00', '20:00', 10),
    ('NIGHT', 'Night · 8pm to 4am, overtime to 8am', '20:00', '04:00', '08:00', 20)
  ) as v(code, name, starts_at, ends_at, ot_until, sort_order)
on conflict (site_id, code) do update
   set name           = excluded.name,
       starts_at      = excluded.starts_at,
       ends_at        = excluded.ends_at,
       overtime_until = excluded.overtime_until,
       is_active      = true;

alter table public.profiles
  add column if not exists shift_follows_attendance boolean not null default true,
  add column if not exists shift_changed_at timestamptz;

comment on column public.profiles.shift_follows_attendance is
  'Move this person between the day and night shift when their check-ins say they have moved. Off pins the shift the office chose.';
comment on column public.profiles.shift_changed_at is
  'When the shift was last changed because of attendance, so the office can see the roster moved on its own.';

-- Three days is long enough that one covered shift does not flip anybody, and
-- short enough that a real move is on the board by the end of the week.
insert into public.app_settings (key, value)
values ('shifts.auto_switch_after_days', '3'::jsonb)
on conflict (key) do nothing;
