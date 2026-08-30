-- ============================================================================
-- Per-person cash payment tracking.
--
-- Salaries here are paid in cash, by hand, and not everyone is paid in the
-- same sitting — someone absent on payday, a cashier who runs out partway
-- through the floor, a supervisor collecting on behalf of their team on a
-- different day. `payroll_periods.paid_at` already marks the whole run as
-- disbursed and locked; this adds the finer-grained record of who has
-- actually been handed their cash, independent of when the period as a whole
-- gets closed out.
-- ============================================================================

alter table public.payroll_items
  add column paid_at timestamptz,
  add column paid_by uuid references public.profiles (id) on delete set null;

comment on column public.payroll_items.paid_at is
  'When this person was actually handed their cash. Independent of payroll_periods.paid_at, which closes the whole run.';

comment on column public.payroll_items.paid_by is
  'Who confirmed the handoff — for accountability on a cash payroll, not a computed value.';

create index on public.payroll_items (period_id, paid_at);
