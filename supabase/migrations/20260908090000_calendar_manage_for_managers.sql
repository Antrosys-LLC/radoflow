-- ============================================================================
-- Let a department manager change the working calendar.
--
-- The calendar is the answer to "we are working this Sunday" — a decision
-- taken on the floor, usually the day before, by whoever runs the shift. Until
-- now only Operations and the two superuser roles could record it, so a
-- manager who knew the factory was opening had to find someone else to say so,
-- and until they did the live board reported the whole shift absent and
-- payroll priced the day as ordinary work.
--
-- Scope is unchanged: the RLS policies on work_week and calendar_days still
-- test app.can('calendar.manage', site_id), so this grants the capability, not
-- a wider reach than the role already has.
-- ============================================================================

insert into public.role_permissions (role_id, permission_id)
select r.id, p.id
  from public.roles r
  join public.permissions p on p.key = 'calendar.manage'
 where r.key = 'manager'
on conflict do nothing;
