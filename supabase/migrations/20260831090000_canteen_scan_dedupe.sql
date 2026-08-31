-- ============================================================================
-- Make a replayed canteen batch a no-op instead of invented fraud.
--
-- A ZKTeco terminal keeps its buffer and resends the whole thing after a
-- network drop — normal behaviour the attendance path already absorbs with
-- punches_dedupe. The canteen path had no equivalent, so a replay re-ran every
-- scan against a meal_claims table that by then held the original serving.
-- Each one came back 23505, was reclassified "duplicate", and was written to
-- meal_scan_log a second time.
--
-- The effect was the worst one available: a dropped connection read as a
-- canteen full of workers caught going back for seconds. The refusal count on
-- the counter screen is the whole point of moving off paper tokens, and it was
-- measuring the network rather than the queue.
--
-- Deliberately NOT a partial index, for the reason recorded on punches_dedupe:
-- ON CONFLICT cannot target one through PostgREST. Unique indexes treat NULLs
-- as distinct, so a hand-recorded scan with no device never collides.
-- ============================================================================

-- Rows written before this migration carry the ingestion time rather than the
-- terminal reading, so an exact-duplicate pair can already exist. Collapse
-- them to the earliest of each group before the index is built, or it fails.
delete from public.meal_scan_log a
 using public.meal_scan_log b
 where a.device_id       is not null
   and a.device_id       = b.device_id
   and a.device_user_id  = b.device_user_id
   and a.scanned_at      = b.scanned_at
   and a.id              > b.id;

create unique index meal_scan_log_dedupe
  on public.meal_scan_log (device_id, device_user_id, scanned_at);

comment on index public.meal_scan_log_dedupe is
  'One terminal reading, recorded once, however many times the terminal resends it.';
