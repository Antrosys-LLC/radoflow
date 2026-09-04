-- ============================================================================
-- Retire the seeded percentage late tiers now that a per-minute tier exists.
--
-- 20260904090250_seed_per_minute_tier.sql gave every site an open-ended
-- per-minute band (basis = 'minute'), but supabase/seed.sql still activates
-- four percentage-of-a-day bands (basis = 'day') on the same sites. findTier()
-- in src/lib/payroll/late.ts picks the *narrowest* matching band, so for
-- 15-120 minutes late the percentage tiers still win — the exact inversion of
-- the per-minute design. Worse, beyond 120 minutes the "beyond 2 hours"
-- percentage band and the per-minute band are both open-ended (equal width),
-- so the tie was broken by whatever order Postgres happened to return rows in.
--
-- Deactivating rather than deleting: the history stays intact (a completed
-- payroll run's payslip lines already reference these tiers by label), and a
-- site can switch back to percentage-of-day deliberately by flipping
-- is_active again. Scoped to basis = 'day' rather than by label, because
-- that column is exactly what distinguishes "the four tiers this migration
-- means to retire" from the per-minute tier added alongside them — no site
-- has a legitimate reason to run both bases against the same lateness at
-- once, which is the whole problem this migration fixes.
-- ============================================================================

update public.late_penalty_rules
   set is_active = false
 where basis = 'day'
   and is_active = true;
