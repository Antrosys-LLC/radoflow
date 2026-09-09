-- ============================================================================
-- Lateness by the minute, and the assistant behind a narrower door.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. Fifteen minutes of grace, then a minute of pay for every minute late
--
-- The tiered ladder is gone from the pay-rates screen: it asked the office to
-- describe lateness as bands of percentages of a day, which is not how anybody
-- here thinks about it and not what was wanted. The rule is one sentence —
-- arrive more than fifteen minutes after your shift starts and each minute
-- past the fifteen costs a minute of pay.
--
-- Both halves already exist and neither is new logic. `shifts.grace_minutes`
-- is what `minutesLateAgainstShift` measures from, and a `basis = 'minute'`
-- row is what `calculateLatePenalties` charges by. What was missing is that
-- the live database has no penalty row at all, so lateness has been costing
-- nothing.
-- ---------------------------------------------------------------------------

update public.shifts
   set grace_minutes = 15
 where grace_minutes <> 15;

/*
 * One open-ended band per site, charged by the minute.
 *
 * `from_minutes = 0` because the grace has already been subtracted by the time
 * a tier is chosen — `minutes_late` is minutes *past* the grace, so a band
 * starting at zero is "any lateness that survived the grace period".
 *
 * `penalty_percent = 100` is read as "one hundred percent of one minute's
 * wage"; the column is meaningless for this basis and 100 is the only value
 * that does not quietly discount the deduction.
 */
insert into public.late_penalty_rules
  (site_id, shift_id, label, from_minutes, to_minutes, penalty_percent, basis, is_active)
select s.id, null, 'Late arrival — per minute', 0, null, 100, 'minute', true
  from public.sites s
 where not exists (
   select 1
     from public.late_penalty_rules r
    where r.site_id = s.id
      and r.basis = 'minute'
      and r.is_active
 );

-- Percentage bands, if any were ever created, are switched off rather than
-- deleted: they are history that a past payroll run was priced against, and
-- `findTier` picks the narrowest *active* match, so an inactive row cannot
-- compete with the per-minute one.
update public.late_penalty_rules
   set is_active = false
 where basis <> 'minute'
   and is_active;

-- ---------------------------------------------------------------------------
-- 2. The assistant is for the people who carry the cost of it
--
-- Every question costs real money against a monthly ceiling, and the two roles
-- that answer for that spend are the two that keep access. Operations and
-- Manager held `assistant.ask` because the assistant began as a reporting
-- convenience; it is now on every record in the app, and four hundred people
-- with an Ask button is a bill nobody agreed to.
--
-- The permission row itself stays in the catalogue, and so does the ability to
-- grant it again from the access screen — this revokes a grant, it does not
-- remove a capability.
-- ---------------------------------------------------------------------------

delete from public.role_permissions rp
 using public.roles r, public.permissions p
 where rp.role_id = r.id
   and rp.permission_id = p.id
   and p.key = 'assistant.ask'
   and r.key not in ('ceo', 'admin-antrosys');

-- Any per-person grant of it, too. An override outlives the role grant it was
-- written alongside, and would otherwise be the one door left open.
delete from public.user_permission_overrides o
 using public.permissions p
 where o.permission_id = p.id
   and p.key = 'assistant.ask'
   and o.effect = 'grant'
   and o.user_id not in (
     select ur.user_id
       from public.user_roles ur
       join public.roles r on r.id = ur.role_id
      where r.key in ('ceo', 'admin-antrosys')
   );

-- ---------------------------------------------------------------------------
-- 3. The Antrosys account sits with Antrosys
--
-- It was showing under "Unassigned" on the pay screen — a real department is
-- what stops one account appearing as an orphan beside four hundred people who
-- have one.
-- ---------------------------------------------------------------------------

update public.profiles p
   set department_id = d.id
  from public.departments d
 where d.name = 'Antrosys'
   and d.default_worker_type = 'contractor'
   and p.department_id is null
   and exists (
     select 1
       from public.user_roles ur
       join public.roles r on r.id = ur.role_id
      where ur.user_id = p.id
        and r.key in ('ceo', 'admin-antrosys')
   );
