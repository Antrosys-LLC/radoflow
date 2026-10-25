-- ============================================================================
-- A number two people have held.
--
-- When a new joiner takes a terminal number, the person who had it resigns on
-- the joining date: punches before the date are theirs, punches from it are the
-- new person's. The old person's number is kept here so a punch that reaches
-- the server late (a terminal that was offline) is still credited to whoever
-- held the number on the day it was made. `left_on` says until when.
-- ============================================================================

alter table public.profiles
  add column if not exists former_device_pin text;

comment on column public.profiles.former_device_pin is
  'The terminal number this person held until left_on, before it passed to a new joiner. Used only to credit late punches dated before left_on.';

create index if not exists profiles_former_device_pin_idx
  on public.profiles (former_device_pin)
  where former_device_pin is not null;
