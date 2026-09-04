-- ============================================================================
-- Lateness charged by the minute.
--
-- The shift already allows fifteen minutes of grace. Past it, each minute
-- costs a minute of pay — which is what was asked for, and which the existing
-- percentage tiers cannot express: the smallest band they can charge is a
-- fraction of a whole day.
--
-- Percentage tiers are untouched and keep working. findTier() picks the
-- narrowest matching band, so a site can run per-minute for small latenesses
-- and a percentage penalty beyond some threshold if it ever wants to.
-- ============================================================================

alter type public.penalty_basis add value if not exists 'minute';
