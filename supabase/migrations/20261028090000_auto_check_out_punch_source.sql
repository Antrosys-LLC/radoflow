-- ============================================================================
-- A check-out the system stamps because nobody scanned
--
-- Anyone still checked in when their duty (or duty plus the overtime ceiling)
-- ends is closed automatically by /api/cron/auto-check-out. The punch it writes
-- is marked source = 'auto' so the office can tell it from a scan, and so the
-- day is paired by its declared direction rather than guessed from the order.
-- ============================================================================

alter type public.punch_source add value if not exists 'auto';
