-- ============================================================================
-- The gate register.
--
-- What comes through the gate is currently written in a paper book that lives
-- at the gate: a visitor, a supplier's truck, a roll of cloth going out. The
-- book answers "who was here on Tuesday" only if somebody walks to the gate
-- and turns the pages, and it answers "did that material ever come back"
-- almost never.
--
-- The supervisor at the gate writes an entry as it happens and can correct it
-- for an hour afterwards — long enough to fix a misheard name or a plate read
-- wrong at dusk, short enough that the register cannot be rewritten later to
-- suit a story. After that it is fixed unless a director changes it, which is
-- the property that makes the register worth keeping at all.
-- ============================================================================

create type public.gate_kind as enum (
  'visitor',   -- a person, with somebody to see
  'vehicle',   -- a truck or van, with a plate
  'material',  -- goods in or out, with a description
  'staff'      -- somebody on the payroll, off the usual biometric path
);

create type public.gate_direction as enum ('in', 'out');

create table public.gate_entries (
  id            uuid primary key default gen_random_uuid(),
  site_id       uuid references public.sites (id) on delete cascade,

  kind          public.gate_kind not null,
  direction     public.gate_direction not null,

  /*
   * Who or what came through. One field rather than a column per kind: a name,
   * a plate and a description are the same question asked about different
   * things, and four nullable columns would leave three of them empty on every
   * row while a reader hunted for the one that was filled.
   */
  subject       text not null,
  /** Their company, or where the goods are going. */
  party         text,
  /** Who they are here to see, or what the load is for. */
  purpose       text,
  /** A plate, a CNIC, a gate pass number — whatever was checked. */
  reference     text,
  quantity      text,

  /*
   * When it happened, not when it was typed. A supervisor writing up three
   * arrivals at once must be able to say what time each of them actually was,
   * or the register describes their typing rather than the gate.
   */
  happened_at   timestamptz not null default now(),
  remarks       text,

  recorded_by   uuid not null references public.profiles (id) on delete set null,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  edited_by     uuid references public.profiles (id) on delete set null
);

create index on public.gate_entries (happened_at desc);
create index on public.gate_entries (site_id, happened_at desc);
create index on public.gate_entries (recorded_by, created_at desc);

comment on table public.gate_entries is
  'The gate register. Written by the supervisor on duty, correctable by them for one hour, and thereafter only by a director.';

-- ---------------------------------------------------------------------------
-- Access
-- ---------------------------------------------------------------------------

insert into public.permissions (key, module, action, label, description) values
  ('gate.log',    'gate', 'manage', 'Write the gate register',
   'Add entries at the gate, and correct your own for an hour.'),
  ('gate.view',   'gate', 'view',   'Read the gate register',
   'See every entry, and download the register.'),
  ('gate.manage', 'gate', 'manage', 'Correct any gate entry',
   'Edit or remove an entry whoever wrote it and however long ago.')
on conflict (key) do nothing;

/*
 * Operations and Manager run the floor and the gate between them. The two
 * superuser roles hold everything implicitly, which is what gives a director
 * the unrestricted edit the one-hour rule below carves out.
 */
insert into public.role_permissions (role_id, permission_id)
select r.id, p.id
  from public.roles r
  join public.permissions p on p.key in ('gate.log', 'gate.view')
 where r.key in ('operations', 'manager')
on conflict do nothing;

-- Accounts reads the register without writing it: a delivery note and a
-- payment usually want checking against each other.
insert into public.role_permissions (role_id, permission_id)
select r.id, p.id
  from public.roles r
  join public.permissions p on p.key = 'gate.view'
 where r.key = 'accounts'
on conflict do nothing;

alter table public.gate_entries enable row level security;

-- Anybody who may read the register reads all of it. A gate log that showed
-- each supervisor only their own shift would answer none of the questions it
-- exists for.
create policy gate_entries_read on public.gate_entries
  for select to authenticated
  using (app.can('gate.view', site_id) or app.can('gate.log', site_id));

create policy gate_entries_insert on public.gate_entries
  for insert to authenticated
  with check (app.can('gate.log', site_id) and recorded_by = auth.uid());

/*
 * The hour.
 *
 * Enforced here rather than only in the action, because this is the rule that
 * makes the register evidence rather than a draft. `gate.manage` — held by the
 * superuser roles — is the deliberate exception: somebody has to be able to
 * fix a genuine error found the next morning, and that somebody is a director
 * whose name lands in `edited_by`.
 */
create policy gate_entries_update on public.gate_entries
  for update to authenticated
  using (
    app.can('gate.manage', site_id)
    or (
      app.can('gate.log', site_id)
      and recorded_by = auth.uid()
      and created_at > now() - interval '1 hour'
    )
  )
  with check (
    app.can('gate.manage', site_id)
    or (
      app.can('gate.log', site_id)
      and recorded_by = auth.uid()
      and created_at > now() - interval '1 hour'
    )
  );

-- Removing an entry is a director's act only. A supervisor who wrote the wrong
-- thing corrects it; deleting it would leave the register with a gap and no
-- record that there ever was one.
create policy gate_entries_delete on public.gate_entries
  for delete to authenticated
  using (app.can('gate.manage', site_id));

create trigger gate_entries_touch
  before update on public.gate_entries
  for each row execute function app.touch_updated_at();
