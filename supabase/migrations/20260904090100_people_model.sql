-- ============================================================================
-- A contract firm's agreed amount, owners who are on no system at all, and
-- the two attendance columns punch pairing needs.
--
-- Each of these puts an exception in data rather than in code, the pattern the
-- rest of this schema follows: requires_attendance, flexible_hours and
-- overtime_eligible all exist for the same reason.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- What the firm is owed, not what its people are owed
--
-- Antrosys bills one agreed figure for the whole firm. Pricing each of its
-- three people separately charged three times what was agreed.
--
-- Meaningful only where default_worker_type is 'contractor'. On any other
-- department it stays zero and nothing reads it.
-- ---------------------------------------------------------------------------

alter table public.departments
  add column contract_amount numeric(14, 2) not null default 0
    check (contract_amount >= 0);

comment on column public.departments.contract_amount is
  'The firm''s agreed monthly amount, billed once for the whole department. Payroll charges this instead of pricing the people inside it. Zero on a directly-employed department.';

-- ---------------------------------------------------------------------------
-- Owners
--
-- Distinct from requires_attendance, because the two are independent: a
-- monthly manager keeps no attendance and is very much on payroll. This says
-- the person draws nothing through this system at all.
-- ---------------------------------------------------------------------------

alter table public.profiles
  add column payroll_exempt boolean not null default false;

comment on column public.profiles.payroll_exempt is
  'Draws no salary through this system. Excluded from payroll runs entirely rather than priced at zero — a zero line would state they earned nothing, which is a different claim from not being paid here.';

create index on public.profiles (payroll_exempt) where payroll_exempt;

-- ---------------------------------------------------------------------------
-- Breaks, and a day whose hours must not be rounded twice
--
-- hours_are_final marks a day whose clock-out was already floored to the half
-- hour. splitDayHours() would otherwise round the total again, half-up on a
-- fifteen-minute step, handing back some of what the floor took.
-- ---------------------------------------------------------------------------

alter table public.attendance_days
  add column break_minutes integer not null default 0
    check (break_minutes >= 0),
  add column hours_are_final boolean not null default false;

comment on column public.attendance_days.break_minutes is
  'Unpaid time between a clock-out and the next clock-in on the same day. Already excluded from the hours totals; recorded so a supervisor can see where the day went.';

comment on column public.attendance_days.hours_are_final is
  'The clock-out was floored to the half hour, so the payroll engine must not round these hours again.';
