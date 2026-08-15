-- ============================================================================
-- RadoFlow core: sites, departments, people, and the role/permission model.
--
-- The permission model is deliberately data-driven rather than hard-coded:
-- any capability can be granted or revoked for any person at any time without
-- a code change. Effective access is
--     (role defaults  UNION  per-user grants)  MINUS  per-user denies
-- with roles flagged `is_superuser` short-circuiting to "everything".
--
-- Superuser status is a column rather than a hard-coded role key so the set of
-- unrestricted roles (today: CEO and Admin) can change without touching any
-- RLS policy.
-- ============================================================================

create schema if not exists app;

create extension if not exists "pgcrypto";

-- ---------------------------------------------------------------------------
-- Sites (factories) and departments
-- ---------------------------------------------------------------------------

create table public.sites (
  id          uuid primary key default gen_random_uuid(),
  code        text not null unique,
  name        text not null,
  timezone    text not null default 'Asia/Karachi',
  address     text,
  is_active   boolean not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

comment on table public.sites is 'Physical factories, e.g. Dyeing Unit / Textile Unit.';

create table public.departments (
  id          uuid primary key default gen_random_uuid(),
  site_id     uuid not null references public.sites (id) on delete cascade,
  code        text not null,
  name        text not null,
  is_active   boolean not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique (site_id, code)
);

create index on public.departments (site_id);

-- ---------------------------------------------------------------------------
-- People
--
-- pay_class and requires_attendance are separate on purpose. Monthly staff
-- normally do not clock in, but the CEO may still require it for a specific
-- person, and an hourly worker could be exempted — neither should need a
-- schema change.
-- ---------------------------------------------------------------------------

create type public.pay_class as enum ('monthly', 'hourly');
create type public.employment_status as enum ('active', 'suspended', 'terminated');

create table public.profiles (
  id                  uuid primary key references auth.users (id) on delete cascade,
  employee_code       text not null unique,
  full_name           text not null,
  email               text,
  phone               text,
  photo_url           text,

  site_id             uuid references public.sites (id) on delete set null,
  department_id       uuid references public.departments (id) on delete set null,
  designation         text,
  manager_id          uuid references public.profiles (id) on delete set null,

  pay_class           public.pay_class not null default 'hourly',
  -- Monthly staff default to false via the trigger below; always overridable.
  requires_attendance boolean not null default true,
  monthly_salary      numeric(14, 2) not null default 0 check (monthly_salary >= 0),
  hourly_rate         numeric(10, 2) not null default 0 check (hourly_rate >= 0),

  -- Floor staff sign in with a numeric PIN rather than a password.
  pin_hash            text,

  status              public.employment_status not null default 'active',
  joined_on           date not null default current_date,
  left_on             date,

  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

create index on public.profiles (site_id);
create index on public.profiles (department_id);
create index on public.profiles (manager_id);
create index on public.profiles (status);

comment on column public.profiles.requires_attendance is
  'Whether payroll expects clock-in data for this person. Independent of pay_class so exceptions need no code change.';

-- ---------------------------------------------------------------------------
-- Roles, permissions, and per-user overrides
-- ---------------------------------------------------------------------------

create table public.roles (
  id          uuid primary key default gen_random_uuid(),
  key         text not null unique,
  name        text not null,
  description text,
  -- System roles cannot be deleted; their permission sets are still editable.
  is_system   boolean not null default false,
  -- Holders bypass every permission check. Kept as data so the unrestricted
  -- set can be changed without a migration.
  is_superuser boolean not null default false,
  rank        integer not null default 100,
  created_at  timestamptz not null default now()
);

create table public.permissions (
  id          uuid primary key default gen_random_uuid(),
  key         text not null unique,
  module      text not null,
  action      text not null,
  label       text not null,
  description text
);

create index on public.permissions (module);

create table public.role_permissions (
  role_id       uuid not null references public.roles (id) on delete cascade,
  permission_id uuid not null references public.permissions (id) on delete cascade,
  primary key (role_id, permission_id)
);

-- A person may hold a role globally (site_id null) or only at one factory.
create table public.user_roles (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references public.profiles (id) on delete cascade,
  role_id     uuid not null references public.roles (id) on delete cascade,
  site_id     uuid references public.sites (id) on delete cascade,
  granted_by  uuid references public.profiles (id) on delete set null,
  granted_at  timestamptz not null default now()
);

create unique index user_roles_unique
  on public.user_roles (user_id, role_id, coalesce(site_id, '00000000-0000-0000-0000-000000000000'::uuid));

create type public.permission_effect as enum ('grant', 'deny');

-- The CEO's lever for one-off access changes without touching role defaults.
create table public.user_permission_overrides (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references public.profiles (id) on delete cascade,
  permission_id uuid not null references public.permissions (id) on delete cascade,
  effect        public.permission_effect not null,
  site_id       uuid references public.sites (id) on delete cascade,
  reason        text,
  granted_by    uuid references public.profiles (id) on delete set null,
  granted_at    timestamptz not null default now(),
  expires_at    timestamptz
);

create unique index user_permission_overrides_unique
  on public.user_permission_overrides (
    user_id, permission_id, coalesce(site_id, '00000000-0000-0000-0000-000000000000'::uuid)
  );

create index on public.user_permission_overrides (user_id);

-- ---------------------------------------------------------------------------
-- Audit trail — the CEO must be able to see every action taken by anyone.
-- ---------------------------------------------------------------------------

create table public.audit_log (
  id          bigserial primary key,
  actor_id    uuid references public.profiles (id) on delete set null,
  action      text not null,
  entity_type text not null,
  entity_id   text,
  site_id     uuid references public.sites (id) on delete set null,
  before      jsonb,
  after       jsonb,
  note        text,
  occurred_at timestamptz not null default now()
);

create index on public.audit_log (occurred_at desc);
create index on public.audit_log (actor_id);
create index on public.audit_log (entity_type, entity_id);

-- ---------------------------------------------------------------------------
-- Helper functions
--
-- SECURITY DEFINER is required: these are called from RLS policies on the very
-- tables they read, so without it the policies would recurse infinitely.
-- ---------------------------------------------------------------------------

create or replace function app.is_superuser(p_user uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1
      from public.user_roles ur
      join public.roles r on r.id = ur.role_id
     where ur.user_id = p_user
       and r.is_superuser
  );
$$;

create or replace function app.has_permission(
  p_user       uuid,
  p_permission text,
  p_site       uuid default null
)
returns boolean
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_permission_id uuid;
  v_denied        boolean;
  v_granted       boolean;
begin
  if p_user is null then
    return false;
  end if;

  -- Superusers (CEO and Admin) are unconditionally allowed everything,
  -- including every action available on the other dashboards. Checked before
  -- the deny list so an unrestricted role can never be locked out.
  if app.is_superuser(p_user) then
    return true;
  end if;

  select id into v_permission_id from public.permissions where key = p_permission;
  if v_permission_id is null then
    return false;
  end if;

  -- An explicit deny always wins, whatever the roles say.
  select exists (
    select 1
      from public.user_permission_overrides o
     where o.user_id = p_user
       and o.permission_id = v_permission_id
       and o.effect = 'deny'
       and (o.expires_at is null or o.expires_at > now())
       and (o.site_id is null or p_site is null or o.site_id = p_site)
  ) into v_denied;

  if v_denied then
    return false;
  end if;

  select exists (
    select 1
      from public.user_permission_overrides o
     where o.user_id = p_user
       and o.permission_id = v_permission_id
       and o.effect = 'grant'
       and (o.expires_at is null or o.expires_at > now())
       and (o.site_id is null or p_site is null or o.site_id = p_site)
  ) into v_granted;

  if v_granted then
    return true;
  end if;

  return exists (
    select 1
      from public.user_roles ur
      join public.role_permissions rp on rp.role_id = ur.role_id
     where ur.user_id = p_user
       and rp.permission_id = v_permission_id
       and (ur.site_id is null or p_site is null or ur.site_id = p_site)
  );
end;
$$;

-- Convenience wrappers for the current request's user.
create or replace function app.can(p_permission text, p_site uuid default null)
returns boolean
language sql
stable
as $$
  select app.has_permission(auth.uid(), p_permission, p_site);
$$;

create or replace function app.current_site()
returns uuid
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select site_id from public.profiles where id = auth.uid();
$$;

-- Managers see their own reports; used by the attendance and payroll policies.
create or replace function app.manages(p_user uuid, p_target uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1 from public.profiles p
     where p.id = p_target
       and p.manager_id = p_user
  );
$$;

-- ---------------------------------------------------------------------------
-- updated_at maintenance
-- ---------------------------------------------------------------------------

create or replace function app.touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create trigger sites_touch       before update on public.sites       for each row execute function app.touch_updated_at();
create trigger departments_touch before update on public.departments for each row execute function app.touch_updated_at();
create trigger profiles_touch    before update on public.profiles    for each row execute function app.touch_updated_at();

-- Monthly staff default to not requiring attendance; an explicit value wins.
create or replace function app.default_requires_attendance()
returns trigger
language plpgsql
as $$
begin
  if tg_op = 'INSERT' and new.pay_class = 'monthly' and new.requires_attendance is not distinct from true then
    new.requires_attendance := false;
  end if;
  return new;
end;
$$;

create trigger profiles_default_attendance
  before insert on public.profiles
  for each row execute function app.default_requires_attendance();
