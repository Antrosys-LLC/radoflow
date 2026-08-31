-- ============================================================================
-- Give the canteen features a route to the people they were built for.
--
-- The counter screen was designed for canteen staff who do not read English —
-- and then every canteen capability was left ungranted, so the only accounts
-- that could open it were Admin and CEO, via the superuser short-circuit.
-- A feature whose intended user cannot reach it is not finished.
--
-- Meal servings are deliberately kept apart from attendance: the person
-- handing out food has no business reading the attendance register or anyone's
-- pay, and the canteen contractor's staff are often not employees at all.
-- ============================================================================

insert into public.roles (key, name, description, is_system, is_superuser, rank) values
  ('canteen', 'Canteen',
   'Runs the serving counter. Sees who may eat and nothing else — no attendance register, no pay.',
   true, false, 45);

insert into public.role_permissions (role_id, permission_id)
select r.id, p.id
  from public.roles r
  join public.permissions p on true
 where (r.key, p.key) in (
   -- The counter itself, plus the ordinary self-service every account gets.
   ('canteen', 'canteen.serve'),
   ('canteen', 'dashboard.employee'),
   ('canteen', 'leave.request'),

   -- Management oversight. Operations already owns the workforce view across
   -- every factory, so who has eaten belongs with it; serving does not.
   ('operations', 'canteen.view'),

   -- A department manager sees the same counter their own floor queues at,
   -- which is what makes "my people were turned away" answerable.
   ('manager', 'canteen.view')
 );

-- canteen.manage (serving times, marking a terminal as a canteen scanner) is
-- deliberately left to Admin and CEO. It changes when the factory feeds
-- people, which is an owner's decision rather than a counter's.
