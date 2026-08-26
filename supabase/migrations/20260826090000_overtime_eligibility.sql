-- ============================================================================
-- Overtime eligibility, and Sundays that are taken as leave.
--
-- The factory's own workers list spells out each person's arrangement in a
-- free-text column, and two of its distinctions have nowhere to live yet:
--
--   "8 Hours Duty + Over time"        — the common case, already expressible
--   "8 Hours Duty"                    — eight hours, and no overtime at all
--   "12 Hour duty + No extra days"    — twelve hours, and no overtime at all
--   "… Sunday Adjust in Leave …"      — a Sunday worked is taken as leave
--                                        instead of being paid as overtime
--
-- Duty hours alone cannot say "and nothing beyond this is paid": a twelve-hour
-- boundary still pays the thirteenth hour. That is a separate decision.
-- ============================================================================

alter table public.profiles
  add column overtime_eligible boolean not null default true;

comment on column public.profiles.overtime_eligible is
  'False for staff whose arrangement pays no overtime at all. Hours past their duty boundary are still recorded, so the floor can see them, but never priced.';

-- ---------------------------------------------------------------------------
-- Sunday taken as leave
--
-- Added on its own, and deliberately not used in this migration: Postgres will
-- not let a new enum value be referenced by the same transaction that creates
-- it. The import that assigns it runs afterwards.
-- ---------------------------------------------------------------------------

alter type public.sunday_policy add value if not exists 'adjust_in_leave';
