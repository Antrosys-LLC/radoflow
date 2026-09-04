-- ============================================================================
-- Attendance arrives within half a minute.
--
-- The terminals were polled once a minute, so a punch could sit on the device
-- for up to 60s before it appeared anywhere — long enough that a supervisor
-- watching the live board sees someone scan in front of them and the screen
-- disagrees. Thirty seconds is the floor the autosync migration already allows
-- (`sync_interval_seconds >= 30`), so this takes it there rather than loosening
-- the constraint.
--
-- Both halves matter: the default governs terminals added from now on, and the
-- update covers the ones already enrolled — which is every device currently in
-- the factory, none of which would otherwise change cadence.
-- ============================================================================

alter table public.devices
  alter column sync_interval_seconds set default 30;

/*
 * Only rows still sitting on the old default are moved.
 *
 * A terminal deliberately set to something slower — a spare, or one on a link
 * that cannot take the traffic — keeps the interval somebody chose for it.
 * Sweeping every row to 30 would silently overwrite that decision.
 */
update public.devices
   set sync_interval_seconds = 30
 where sync_interval_seconds = 60;

comment on column public.devices.sync_interval_seconds is
  'Seconds between polls of this terminal. Defaults to 30 so punches reach the floor board within half a minute. Minimum 30.';
