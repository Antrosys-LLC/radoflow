-- ============================================================================
-- PENDING MIGRATION (21 Sep 2026) — paste this whole file into the Supabase
-- SQL editor:  Dashboard -> SQL Editor -> New query -> paste -> Run
--
-- The exact content of:
--
--   20260921090000_canteen_menu_choices.sql
--
-- Run it after APPLY-2026-09-20.sql. Wednesday becomes Aloo Kofta (105) or
-- Sabzi (85), chosen on each Wednesday, instead of one combined dish.
-- ============================================================================


-- >>> 20260921090000_canteen_menu_choices.sql
-- ============================================================================
-- A day that serves one dish or another, chosen on the day.
--
-- Wednesday is Aloo Kofta (105) or Sabzi (85): the canteen cooks one of them
-- for the whole day, and which one is only known on the day. A dish marked
-- `is_option` is one of those alternatives. On each such date the office picks
-- what was served, which is written as that date's own menu
-- (canteen_menu_days); until then the day is flagged and counted at the dearer
-- option, so a bill is never short because nobody picked.
-- ============================================================================

alter table public.canteen_menu_weekly
  add column if not exists is_option boolean not null default false;

comment on column public.canteen_menu_weekly.is_option is
  'One of the alternatives for its weekday: the canteen serves one of them all day, and the office records which on each date.';

-- Wednesday, as two alternatives rather than one combined dish. Only replaces
-- the dish this project seeded, never one the office has since edited.
delete from public.canteen_menu_weekly
 where weekday = 3
   and name = 'Aloo Kofta / Sabzi'
   and price_pkr = 105
   and is_option = false;

insert into public.canteen_menu_weekly (site_id, weekday, name, price_pkr, is_option, sort_order)
select s.id, v.weekday, v.name, v.price, true, v.sort_order
  from (select id from public.sites order by name limit 1) s
 cross join (values
   (3, 'Aloo Kofta', 105, 10),
   (3, 'Sabzi', 85, 20)
 ) as v(weekday, name, price, sort_order)
 where not exists (select 1 from public.canteen_menu_weekly where weekday = 3);
