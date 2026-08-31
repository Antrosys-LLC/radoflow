-- ============================================================================
-- Align RLS with the capabilities added this cycle.
--
-- Three features were gated on new permission keys at the action boundary,
-- but the policies underneath still named only the original ones. A holder of
-- the new key passed the action's check and was then filtered out by RLS —
-- and an UPDATE refused by a USING clause matches zero rows *without raising*,
-- so the action reported success while nothing was written.
--
-- It has not bitten yet only because these keys are currently held solely by
-- Admin and CEO, whose superuser short-circuit bypasses every policy. It
-- would bite the moment the office grants one of them to an actual clerk,
-- which is exactly what they are for.
--
-- The permission catalogue is the source of truth for what someone may do;
-- these policies now say the same thing.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- Marking cash handed over
--
-- Disbursement is deliberately a different job from running the calculation —
-- payroll.pay exists so a cashier can record handing over an envelope without
-- being able to recompute what is owed. The policy has to allow that write,
-- while payroll.run keeps the broader rights it already had.
-- ---------------------------------------------------------------------------

drop policy if exists items_write on public.payroll_items;

create policy items_write on public.payroll_items
  for all to authenticated
  using (app.can('payroll.run') or app.can('payroll.pay'))
  with check (app.can('payroll.run') or app.can('payroll.pay'));

comment on policy items_write on public.payroll_items is
  'payroll.run computes these rows; payroll.pay marks them handed over in cash. Both need to write.';

-- ---------------------------------------------------------------------------
-- Importing a digitised paper register
--
-- registers.import writes historical attendance in bulk, which is the same
-- act as correcting a missed punch — so it belongs alongside attendance.edit
-- rather than requiring it in addition.
-- ---------------------------------------------------------------------------

drop policy if exists attendance_write on public.attendance_days;

create policy attendance_write on public.attendance_days
  for all to authenticated
  using (
    app.can('attendance.edit.all', site_id)
    or app.can('registers.import', site_id)
    or (app.can('attendance.edit', site_id) and app.manages(auth.uid(), profile_id))
  )
  with check (
    app.can('attendance.edit.all', site_id)
    or app.can('registers.import', site_id)
    or (app.can('attendance.edit', site_id) and app.manages(auth.uid(), profile_id))
  );

-- ---------------------------------------------------------------------------
-- Serving a meal by hand
--
-- The counter's own scans are written by the device path under the service
-- key, so they never meet this policy. It governs the supervisor recording a
-- serving manually — a cut finger, a terminal that will not read — which is
-- the same canteen.serve capability the counter screen is gated on.
-- Management (canteen.view) is deliberately read-only here.
-- ---------------------------------------------------------------------------

-- Already correct; restated only so the intent is recorded next to the others.
comment on policy meal_claims_write on public.meal_claims is
  'canteen.serve records a serving by hand. Device scans bypass this via the service key.';
