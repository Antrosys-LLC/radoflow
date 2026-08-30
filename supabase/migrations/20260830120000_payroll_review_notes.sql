-- ============================================================================
-- Plain-language review notes on a payroll run.
--
-- Where flagged_hours/flagged_days (added earlier) are a pure number the
-- engine computed, this is Claude's explanation of *why* a person is worth a
-- second look before the run is approved — covering dropped hours, an
-- attendance punch-pairing anomaly, and a net-pay swing against their own
-- recent history. It never changes a figure: this is commentary attached
-- after the fact, generated best-effort, and safe to be absent if the
-- assistant isn't configured or the call fails.
-- ============================================================================

alter table public.payroll_items
  add column review_note text,
  add column review_generated_at timestamptz;

comment on column public.payroll_items.review_note is
  'Plain-language explanation of why this line is worth a look before approval — covers dropped hours, attendance anomalies and pay-history outliers. Null means nothing flagged, or the review has not run.';
