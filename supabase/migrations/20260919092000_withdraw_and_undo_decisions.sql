-- ============================================================================
-- Withdrawing a request, and taking a decision back within the hour.
--
-- Two things were missing from the approvals screen.
--
-- Withdrawing never worked for most of the people who could press it. The
-- only UPDATE policy on change_requests was the approvers' own, so a manager
-- withdrawing their request updated nothing and was told it "is not yours, or
-- is already decided". The requester gets their own policy here — narrow on
-- purpose, see the guard below.
--
-- A decision could not be taken back. An approval pressed on the wrong row
-- stood, and the only way out was to ask for the opposite change and approve
-- that too. Now the person who decided has an hour: an approval is reversed by
-- writing back what the row held before it (`previous_values`, captured at the
-- moment of approving), a rejection simply returns to the queue, and a
-- withdrawn request can be restored by whoever withdrew it. After an hour the
-- decision is part of the record — payroll may already have read it.
-- ============================================================================

alter table public.change_requests
  add column if not exists previous_values jsonb,
  add column if not exists created_row boolean not null default false,
  add column if not exists undone_at timestamptz,
  add column if not exists undone_by uuid references public.profiles (id) on delete set null;

comment on column public.change_requests.previous_values is
  'What the target row held for the changed columns just before approval. Written back if the approval is undone.';
comment on column public.change_requests.created_row is
  'The approval created the row rather than changing one, so undoing it deletes the row.';

drop policy if exists change_requests_withdraw on public.change_requests;
create policy change_requests_withdraw on public.change_requests
  for update to authenticated
  using (requested_by = auth.uid())
  with check (requested_by = auth.uid() and status in ('pending', 'cancelled'));

/**
 * What a requester who is not an approver may do to their own request.
 *
 * Exactly two things: withdraw it while it waits, and restore it within an
 * hour of withdrawing. Everything the approver reads — the payload, the title,
 * the summary — is frozen, or a request could be approved on one description
 * and apply another.
 */
create or replace function app.guard_change_request_requester()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if auth.uid() is null
     or app.can('payroll.approve', old.site_id)
     or app.can('attendance.approve', old.site_id) then
    return new;
  end if;

  if new.payload         is distinct from old.payload
     or new.entity_table is distinct from old.entity_table
     or new.entity_id    is distinct from old.entity_id
     or new.title        is distinct from old.title
     or new.summary      is distinct from old.summary
     or new.kind         is distinct from old.kind
     or new.site_id      is distinct from old.site_id
     or new.requested_by is distinct from old.requested_by
     or new.assigned_to  is distinct from old.assigned_to
     or new.decided_by   is distinct from old.decided_by
     or new.previous_values is distinct from old.previous_values
     or new.created_row  is distinct from old.created_row then
    raise exception 'Only an approver can change what a request says'
      using errcode = '42501';
  end if;

  if not (
       (old.status = 'pending' and new.status = 'cancelled')
    or (old.status = 'cancelled' and new.status = 'pending'
        and old.decided_at > now() - interval '1 hour')
  ) then
    raise exception 'A request can be withdrawn while it waits, and restored within an hour'
      using errcode = '42501';
  end if;

  return new;
end;
$$;

drop trigger if exists change_requests_guard_requester on public.change_requests;
create trigger change_requests_guard_requester
  before update on public.change_requests
  for each row execute function app.guard_change_request_requester();
