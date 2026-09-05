-- ============================================================================
-- Each person reads the app in their own language.
--
-- On profiles rather than in a cookie or local storage: the preference should
-- follow the person to whatever phone or terminal they sign in on, and the
-- session already loads their profile once per request, so this costs no
-- extra query.
-- ============================================================================

alter table public.profiles
  add column language text not null default 'en'
    check (language in ('en', 'ur', 'roman-ur'));

comment on column public.profiles.language is
  'Interface language. Codes match the Ask assistant''s. Defaults to English: nobody is switched automatically, and the translations are reviewed before being offered as a default.';

-- ----------------------------------------------------------------------------
-- Carried across from 20260902090000_session_bootstrap.sql unchanged except for
-- one thing: `language` is added to the profile select list. `create or replace`
-- rewrites the whole body, so the roles aggregate, the permissions aggregate and
-- the closing `where` are reproduced verbatim rather than because they changed.
-- Nothing else in this function differs from that migration.
-- ----------------------------------------------------------------------------

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
                 language, roles_changed_at
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
