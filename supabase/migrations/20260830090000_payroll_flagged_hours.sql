-- ============================================================================
-- Flagged hours on a payroll run: dates where the overtime ceiling dropped
-- worked time the engine could not confidently price — most commonly a
-- double-duty day (two real shifts collapsing into one attendance total).
--
-- This is observation, not a second calculation: the numbers on the payslip
-- are unchanged. It exists so an approver sees "3 hours unaccounted for on
-- 2026-08-14 — check the punches" before signing off, instead of the hours
-- silently disappearing. See excessHours() in src/lib/payroll/hours.ts.
-- ============================================================================

alter table public.payroll_items
  add column flagged_hours numeric(6, 2) not null default 0 check (flagged_hours >= 0),
  add column flagged_days  jsonb not null default '[]'::jsonb;

comment on column public.payroll_items.flagged_hours is
  'Total hours this period''s overtime ceiling dropped rather than priced. Zero in the common case; non-zero needs a human to check the listed dates before approval, not a recalculation.';

comment on column public.payroll_items.flagged_days is
  'Array of {work_date, hours} for every date flagged_hours is drawn from.';
