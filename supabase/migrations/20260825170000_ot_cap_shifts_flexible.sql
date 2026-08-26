-- ============================================================================
-- An overtime ceiling, the two twelve-hour shifts, and staff who keep no hours.
--
-- Three things the floor does that the schema could not say:
--
--   1. Overtime on a working day stops at four hours. Beyond that the terminal
--      is recording presence, not work anyone agreed to pay for.
--   2. The factory runs 08:00-20:00 and 20:00-08:00.
--   3. Some people have no in or out time to keep — they are not judged late,
--      whatever the clock says, even while rostered to a shift.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- The overtime ceiling
--
-- On pay_rules rather than hard-coded, because a ceiling is a negotiated
-- figure: it moves at the same kind of meeting that moves an hourly rate.
-- ---------------------------------------------------------------------------

alter table public.pay_rules
  add column ot_daily_cap_hours numeric(4, 2) not null default 4
    check (ot_daily_cap_hours >= 0);

comment on column public.pay_rules.ot_daily_cap_hours is
  'Most overtime hours payable on one working day. Sundays are not capped: every hour of a Sunday is overtime, and a Sunday shift is the whole point of coming in. Zero disables overtime entirely.';

-- ---------------------------------------------------------------------------
-- No in or out time to keep
--
-- Distinct from having no shift. Someone can be rostered to the night shift so
-- the floor knows where they are, while not being judged against its start
-- time — a driver, a fitter on call. Leaving the shift unset would hide them
-- from the roster to achieve the same thing.
-- ---------------------------------------------------------------------------

alter table public.profiles
  add column flexible_hours boolean not null default false;

comment on column public.profiles.flexible_hours is
  'No in or out time is enforced. Lateness is never recorded, whatever the shift says. Hours worked and overtime are still counted from the punches.';

-- ---------------------------------------------------------------------------
-- The two shifts
--
-- ends_at earlier than starts_at is how this schema marks a shift crossing
-- midnight, which is exactly what the night shift does.
-- ---------------------------------------------------------------------------

insert into public.shifts (site_id, code, name, starts_at, ends_at, grace_minutes, sort_order)
select s.id, v.code, v.name, v.starts_at::time, v.ends_at::time, v.grace, v.sort_order
  from public.sites s
  cross join (values
    ('DAY',   'Day · 8am to 8pm',   '08:00', '20:00', 15, 10),
    ('NIGHT', 'Night · 8pm to 8am', '20:00', '08:00', 15, 20)
  ) as v(code, name, starts_at, ends_at, grace, sort_order)
on conflict (site_id, code) do update
   set name      = excluded.name,
       starts_at = excluded.starts_at,
       ends_at   = excluded.ends_at;
