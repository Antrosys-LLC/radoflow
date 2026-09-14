-- ============================================================================
-- What a meal costs, and what the canteen has served in rupees.
--
-- The register already says who ate and when. The office also needs what that
-- came to: one price per meal, set on the canteen settings screen, and a total
-- for any stretch of days.
--
-- The price is stamped onto each serving as it is recorded. A register priced
-- at today's rate would restate last month's canteen bill every time the price
-- moved; a serving priced when it was handed over never changes. Servings from
-- before a price was set carry none, and the history screen prices those at the
-- current rate and says so.
-- ============================================================================

alter table public.meal_claims
  add column if not exists price_pkr numeric(10, 2)
    check (price_pkr is null or price_pkr >= 0);

comment on column public.meal_claims.price_pkr is
  'Rupees for this serving, from canteen.meal_price_pkr at the moment it was served. Null when no price was set yet.';

insert into public.app_settings (key, value)
values ('canteen.meal_price_pkr', 'null'::jsonb)
on conflict (key) do nothing;

create or replace function app.stamp_meal_price()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if new.price_pkr is null then
    select case when jsonb_typeof(s.value) = 'number' then (s.value #>> '{}')::numeric end
      into new.price_pkr
      from public.app_settings s
     where s.key = 'canteen.meal_price_pkr';
  end if;
  return new;
end;
$$;

drop trigger if exists meal_claims_stamp_price on public.meal_claims;
create trigger meal_claims_stamp_price
  before insert on public.meal_claims
  for each row execute function app.stamp_meal_price();

-- Setting the price belongs to whoever runs the canteen, not to whoever holds
-- every other company setting.
drop policy if exists app_settings_canteen_price on public.app_settings;
create policy app_settings_canteen_price on public.app_settings
  for all to authenticated
  using (key = 'canteen.meal_price_pkr' and app.can('canteen.manage'))
  with check (key = 'canteen.meal_price_pkr' and app.can('canteen.manage'));
