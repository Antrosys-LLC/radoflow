-- ============================================================================
-- Signing off a stretch of attendance.
--
-- `locked` already exists and already stops recomputeAttendanceDay() from
-- overwriting a row — that is what makes an approval durable rather than
-- decorative: a correction a manager accepted survives the next terminal sync
-- instead of being replaced by whatever the punches say.
--
-- What was missing is who accepted it and when. Without that, `locked` says a
-- row is frozen but not on whose authority, which is exactly the question
-- asked when a payslip is disputed.
-- ============================================================================

alter table public.attendance_days
  add column approved_by uuid references public.profiles (id) on delete set null,
  add column approved_at timestamptz;

comment on column public.attendance_days.approved_by is
  'The manager who signed this day off. Set together with locked, which is what actually stops recomputation replacing it.';

create index on public.attendance_days (approved_at) where approved_at is not null;

-- ---------------------------------------------------------------------------
-- A manager may write the days of the people who report to them
--
-- app.manages() already exists for exactly this and is used by the other
-- attendance policies. The `.all` variant carries anyone company-wide.
-- ---------------------------------------------------------------------------

create policy attendance_approve on public.attendance_days
  for update to authenticated
  using (
    (app.can('attendance.approve', site_id) and app.manages(auth.uid(), profile_id))
    or app.can('attendance.edit.all', site_id)
  )
  with check (
    (app.can('attendance.approve', site_id) and app.manages(auth.uid(), profile_id))
    or app.can('attendance.edit.all', site_id)
  );
