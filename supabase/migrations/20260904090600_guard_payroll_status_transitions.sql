-- ============================================================================
-- Accounts must not be able to approve or disburse its own payroll run.
--
-- periods_write (20260814090300_rls.sql) is `for all` gated on
-- `app.can('payroll.run', site_id)`, and items_write
-- (20260830150000_align_rls_with_new_permissions.sql) on `payroll.run or
-- payroll.pay`. src/lib/supabase/client.ts puts the anon key and the signed-in
-- user's JWT in the browser, so PostgREST is directly reachable — a
-- `requirePermission("payroll.approve")` guard in a server action
-- (src/app/(app)/payroll/actions.ts) is a UI courtesy, not access control, for
-- anyone who can issue their own PATCH.
--
-- Accounts holds payroll.run and deliberately neither payroll.approve nor
-- payroll.pay (20260904090000_factory_admin_and_accounts.sql), so today it can
-- PATCH /rest/v1/payroll_periods to set status='approved', status='paid',
-- locked=true or paid_at, and PATCH /rest/v1/payroll_items to set paid_at
-- itself — completely bypassing the desk-separation the role exists for.
--
-- Fixed with a BEFORE UPDATE trigger rather than by rewriting the policies:
-- `with check` sees only the proposed new row, and telling "draft becoming
-- review" apart from "review becoming approved" needs the OLD row too. This
-- codebase already reaches for a trigger exactly when a write's legality
-- depends on the row's previous state — see
-- app.guard_profile_self_update() and app.guard_privileged_account_status()
-- (20260831110000_guard_privileged_accounts.sql) — so this follows the same
-- shape rather than inventing a second idiom for the same problem. The
-- existing policies are untouched: this migration only adds triggers
-- alongside them.
--
-- Transitions allowed:
--   draft/calculating -> review   payroll.run   (the ordinary calculate step)
--   review            -> approved payroll.approve
--   approved          -> paid     payroll.pay
-- `locked` and `payroll_periods.paid_at` are the disbursement markers
-- themselves and are guarded the same as the move to 'paid'; `approved_by`/
-- `approved_at` are guarded the same as the move to 'approved', so neither
-- record can be planted by a write that leaves `status` untouched.
-- ============================================================================

create or replace function app.guard_payroll_period_transition()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  -- Service-key work — src/lib/payroll/run.ts, migrations, seeds — has no
  -- session user. That path is what payroll.run authorised in the first
  -- place at the action boundary, and it only ever writes status='review', so
  -- trusting it here does not reopen the hole this trigger closes. Same
  -- allowance app.guard_profile_self_update() makes, for the same reason.
  if auth.uid() is null then
    return new;
  end if;

  -- Superusers (Admin, CEO) keep the unrestricted access every other guard in
  -- this schema grants them.
  if app.is_superuser(auth.uid()) then
    return new;
  end if;

  if new.status is distinct from old.status and new.status = 'approved'
     and not app.can('payroll.approve', new.site_id) then
    raise exception 'payroll.approve is required to approve a pay period'
      using errcode = '42501';
  end if;

  if new.status is distinct from old.status and new.status = 'paid'
     and not app.can('payroll.pay', new.site_id) then
    raise exception 'payroll.pay is required to mark a pay period paid'
      using errcode = '42501';
  end if;

  if (new.approved_by is distinct from old.approved_by
      or new.approved_at is distinct from old.approved_at)
     and not app.can('payroll.approve', new.site_id) then
    raise exception 'payroll.approve is required to set who approved a pay period'
      using errcode = '42501';
  end if;

  if (new.paid_at is distinct from old.paid_at
      or (new.locked and not old.locked))
     and not app.can('payroll.pay', new.site_id) then
    raise exception 'payroll.pay is required to mark a pay period paid or lock it'
      using errcode = '42501';
  end if;

  return new;
end;
$$;

comment on function app.guard_payroll_period_transition() is
  'Confines payroll.run to draft/calculating -> review. Approving, marking paid, locking, and the approved_by/approved_at/paid_at fields each require the matching payroll.approve or payroll.pay permission, regardless of what the outer RLS policy otherwise permits a payroll.run holder to write.';

create trigger payroll_periods_guard_transition
  before update on public.payroll_periods
  for each row execute function app.guard_payroll_period_transition();

-- ---------------------------------------------------------------------------
-- The same gap on payroll_items: items_write already permits payroll.run to
-- write every column on this table (that is how the engine records regular
-- hours, gross, deductions, ...), including paid_at/paid_by. Without this, an
-- Accounts user could PATCH /rest/v1/payroll_items directly to mark a line
-- paid through the same table the payroll.pay-only cashier's markItemPaid
-- server action writes to, never holding payroll.pay at all and never going
-- through the "period must be approved" check that action makes.
-- ---------------------------------------------------------------------------

create or replace function app.guard_payroll_item_payment()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if auth.uid() is null then
    return new;
  end if;

  if app.is_superuser(auth.uid()) then
    return new;
  end if;

  -- Unscoped by site, matching items_write itself: payroll_items carries no
  -- site_id column of its own, and the policy it supplements already checks
  -- payroll.pay the same way.
  if (new.paid_at is distinct from old.paid_at or new.paid_by is distinct from old.paid_by)
     and not app.can('payroll.pay') then
    raise exception 'payroll.pay is required to mark a payroll line paid'
      using errcode = '42501';
  end if;

  return new;
end;
$$;

comment on function app.guard_payroll_item_payment() is
  'payroll.run may recompute every other column on this row; only payroll.pay may change paid_at/paid_by.';

create trigger payroll_items_guard_payment
  before update on public.payroll_items
  for each row execute function app.guard_payroll_item_payment();
