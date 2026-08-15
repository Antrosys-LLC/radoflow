-- ============================================================================
-- Automatic terminal polling.
--
-- Push mode already delivers punches as they happen, but it depends on the
-- terminal choosing to talk to us. Polling on a timer closes the gap when a
-- device has been off the network, and gives a definite "last successful
-- sync" to show on screen rather than an absence of news.
-- ============================================================================

alter table public.devices
  add column auto_sync            boolean not null default true,
  add column sync_interval_seconds integer not null default 60
    check (sync_interval_seconds >= 30),
  add column last_sync_at         timestamptz,
  add column last_sync_count      integer not null default 0,
  add column consecutive_failures integer not null default 0;

comment on column public.devices.auto_sync is
  'Poll this terminal on a timer. Requires ip_address; push-only devices can leave it off.';
comment on column public.devices.consecutive_failures is
  'Reset on every success. Used to back off a terminal that is switched off rather than hammering it every minute.';
