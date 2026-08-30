-- ============================================================================
-- The "ask" assistant: a natural-language question box over live attendance,
-- leave and payroll data, answered in Urdu, Roman Urdu or English by voice or
-- text. Read-only by construction — it holds no write tools, so there is
-- nothing for it to approve or change; it can only ever answer with what the
-- asking person's own permissions and RLS already let them see.
-- ============================================================================

insert into public.permissions (key, module, action, label, description) values
  ('assistant.ask', 'assistant', 'view', 'Ask the assistant',
   'Question attendance, leave and payroll data in plain language, by voice or text.');

-- Granted alongside the reporting-shaped roles. Admin and CEO already have it
-- implicitly as superusers; Employee is deliberately excluded for now — this
-- is scoped to the people who read reports rather than mark their own
-- attendance, not yet to floor-level self-service.
insert into public.role_permissions (role_id, permission_id)
select r.id, p.id
  from public.roles r
  join public.permissions p on p.key = 'assistant.ask'
 where r.key in ('operations', 'manager');
