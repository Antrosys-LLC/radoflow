-- ============================================================================
-- 20260904090600_guard_payroll_status_transitions.sql closed the UPDATE path
-- an Accounts (payroll.run-only) user could use to plant an approval or a
-- payment: two BEFORE UPDATE triggers that consult the OLD row to tell
-- "draft becoming review" apart from "review becoming approved".
--
-- A BEFORE UPDATE trigger never fires on an INSERT, and periods_write /
-- items_write are both `for all`, so INSERT is still open under the same
-- policies the UPDATE guard sits beside. Accounts can DELETE a payroll_items
-- row and INSERT a replacement with status='paid' and paid_at set, or DELETE
-- a payroll_periods row (cascading its items) and re-INSERT it with
-- status='paid', locked=true, paid_at set, and approved_by/approved_at filled
-- in — never touching an UPDATE at all, so the trigger added last never runs.
-- Same desk-separation hole, just reached by deleting the door instead of
-- picking the lock.
--
-- An INSERT has no OLD row, so the rule is simpler than the UPDATE guard's:
-- a row may not be *born* already in a privileged state. There is no
-- transition to classify — only whether the row being created already carries
-- approval or payment markers it has no permission to set.
--
-- Same permission checks, same auth.uid() is null service-role exemption
-- (src/lib/payroll/run.ts writes payroll_items through the service client,
-- and createPeriod / the ordinary payroll.run insert path only ever sets
-- site_id/label/period_start/period_end/budget — every guarded column stays
-- at its default, so this adds no friction to the normal flow), and the same
-- superuser exemption as 20260904090600_guard_payroll_status_transitions.sql.
-- Neither existing trigger nor either underlying policy is touched.
-- ============================================================================

create or replace function app.guard_payroll_period_insert()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  -- Service-key work — src/lib/payroll/run.ts, migrations, seeds — has no
  -- session user. Same allowance as the UPDATE guard, for the same reason.
  if auth.uid() is null then
    return new;
  end if;

  -- Superusers (Admin, CEO) keep the unrestricted access every other guard in
  -- this schema grants them.
  if app.is_superuser(auth.uid()) then
    return new;
  end if;

  if new.status = 'approved' and not app.can('payroll.approve', new.site_id) then
    raise exception 'payroll.approve is required to create a pay period already approved'
      using errcode = '42501';
  end if;

  if new.status = 'paid' and not app.can('payroll.pay', new.site_id) then
    raise exception 'payroll.pay is required to create a pay period already paid'
      using errcode = '42501';
  end if;

  if (new.approved_by is not null or new.approved_at is not null)
     and not app.can('payroll.approve', new.site_id) then
    raise exception 'payroll.approve is required to set who approved a pay period'
      using errcode = '42501';
  end if;

  if (new.paid_at is not null or new.locked)
     and not app.can('payroll.pay', new.site_id) then
    raise exception 'payroll.pay is required to mark a pay period paid or lock it'
      using errcode = '42501';
  end if;

  return new;
end;
$$;

comment on function app.guard_payroll_period_insert() is
  'INSERT counterpart to app.guard_payroll_period_transition(): a payroll_periods row may not be born already approved/paid, locked, or carrying approved_by/approved_at/paid_at, without the matching payroll.approve or payroll.pay permission — closing the DELETE-then-INSERT route around the UPDATE guard.';

create trigger payroll_periods_guard_insert
  before insert on public.payroll_periods
  for each row execute function app.guard_payroll_period_insert();

-- ---------------------------------------------------------------------------
-- Same shape on payroll_items: the UPDATE guard stops paid_at/paid_by from
-- being changed without payroll.pay, but a freshly INSERTed row can carry
-- status='paid' and paid_at/paid_by already filled in, since there is no OLD
-- row for the UPDATE guard's comparison to catch. Closing that also means a
-- DELETE-then-INSERT replacement can no longer skip requirePayableItem's
-- "period must be approved" check by never going through markItemPaid's
-- UPDATE at all.
-- ---------------------------------------------------------------------------

create or replace function app.guard_payroll_item_insert()
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

  -- Unscoped by site, matching items_write itself and the UPDATE guard beside
  -- this one: payroll_items carries no site_id column of its own.
  if (new.status = 'paid' or new.paid_at is not null or new.paid_by is not null)
     and not app.can('payroll.pay') then
    raise exception 'payroll.pay is required to create a payroll line already marked paid'
      using errcode = '42501';
  end if;

  return new;
end;
$$;

comment on function app.guard_payroll_item_insert() is
  'INSERT counterpart to app.guard_payroll_item_payment(): a payroll_items row may not be born already status=paid or carrying paid_at/paid_by, without payroll.pay.';

create trigger payroll_items_guard_insert
  before insert on public.payroll_items
  for each row execute function app.guard_payroll_item_insert();
