-- ============================================================================
-- The canteen's menu and prices, for every date: past, present and future.
--
--   Monday     Chicken        140
--   Tuesday    Daal Chana      85
--   Wednesday  Sabzi           85
--   Thursday   no meal
--   Friday     Daal Mash      105
--   Saturday   Kari Pakora     85
--   Sunday     Black Chany     85
--
-- A meal costs its weekday's dishes (src/lib/canteen/menu.ts), and the weekly
-- schedule is read for any date, so replacing it reprices all history as well
-- as the days to come. Two things would still override it, so they go:
--   * a date's own dishes (canteen_menu_days) -- among them the Wednesday
--     "Aloo Kofta / Sabzi" choices, which would keep old Wednesdays at 105.
-- Dates marked no-meal (canteen_menu_no_meal) are left alone: that says nothing
-- was served, not what it cost.
--
-- Thursday has no dishes. A meal somebody did take on a Thursday is counted at
-- the price stamped on it when it was served.
-- ============================================================================

delete from public.canteen_menu_days;

delete from public.canteen_menu_weekly;

insert into public.canteen_menu_weekly (site_id, weekday, name, price_pkr, is_option, sort_order)
select s.id, v.weekday, v.name, v.price, false, 10
  from (select id from public.sites order by name limit 1) s
 cross join (values
   (1, 'Chicken',     140),
   (2, 'Daal Chana',   85),
   (3, 'Sabzi',        85),
   (5, 'Daal Mash',   105),
   (6, 'Kari Pakora',  85),
   (0, 'Black Chany',  85)
 ) as v(weekday, name, price);
