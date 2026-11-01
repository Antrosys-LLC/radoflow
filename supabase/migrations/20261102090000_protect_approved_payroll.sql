-- An approved (or paid, or locked) pay period can never be deleted.
--
-- The app only offers Delete on a period that has not been approved, and asks
-- for the person's own password first. This trigger is the part that cannot be
-- bypassed: it holds for the service role and for a cascade from a site too.

create or replace function app.protect_approved_payroll()
returns trigger
language plpgsql
as $$
begin
  if old.status in ('approved', 'paid') or old.approved_at is not null or old.locked then
    raise exception 'An approved payroll cannot be deleted.' using errcode = 'P0001';
  end if;
  return old;
end;
$$;

drop trigger if exists payroll_periods_protect_approved on public.payroll_periods;
create trigger payroll_periods_protect_approved
  before delete on public.payroll_periods
  for each row execute function app.protect_approved_payroll();
