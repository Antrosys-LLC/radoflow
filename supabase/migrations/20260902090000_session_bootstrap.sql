-- ============================================================================
-- One round trip for "who am I and what may I do".
--
-- session.sql set out to give the shell a single cheap call and then shipped
-- three: profiles, my_roles() and my_permissions(). Run per request, against a
-- Supabase project on the other side of the internet, each one is its own HTTP
-- request to PostgREST — and the app layout cannot render a single pixel until
-- all three come back.
--
-- This is the call that migration described. Profile, roles and permissions
-- resolve inside one statement and come back as one JSON document.
--
-- The permission logic is not restated here. It delegates to my_roles() and
-- my_permissions() so there is still exactly one definition of who may do
-- what, and superuser expansion keeps working without a second copy of the
-- rule to drift.
-- ============================================================================

create or replace function public.session_bootstrap()
returns jsonb
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select jsonb_build_object(
    'profile', (
      select to_jsonb(p)
        from (
          select id, employee_code, full_name, email, photo_url, designation,
                 site_id, department_id, pay_class, requires_attendance,
                 roles_changed_at
            from public.profiles
           where id = auth.uid()
        ) p
    ),
    'roles', coalesce(
      (select jsonb_agg(to_jsonb(r) order by r.rank) from public.my_roles() r),
      '[]'::jsonb
    ),
    'permissions', coalesce(
      (select jsonb_agg(k) from public.my_permissions() k),
      '[]'::jsonb
    )
  )
  where auth.uid() is not null;
$$;

comment on function public.session_bootstrap() is
  'Profile, roles and effective permissions for the caller, in one round trip. Replaces the three separate calls the app layout used to make on every request.';

grant execute on function public.session_bootstrap() to authenticated;
