-- ============================================================================
-- One meal per person per 24 hours.
--
-- The canteen previously allowed one serving per *window* per day: someone who
-- ate at lunch could eat again at dinner, because those were different windows.
-- The rule is now a rolling twenty-four hours, measured from the previous
-- serving rather than from midnight — so a night-shift worker who eats at 23:00
-- is not entitled to another meal at 00:30 simply because the date changed.
--
-- Enforced here rather than in application code, for the reason the original
-- canteen migration gives: two scanners firing at the same instant, a replayed
-- device buffer and a retried request must all collapse to one meal, and only
-- the database sees all three.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- A meal no longer needs a window
--
-- Windows stop deciding whether someone may eat and become a label for which
-- sitting a meal belonged to. A scan at 03:00 that no window covers is still a
-- meal — it is simply recorded without one.
-- ---------------------------------------------------------------------------

alter table public.meal_claims
  alter column meal_window_id drop not null;

comment on column public.meal_claims.meal_window_id is
  'Which sitting this meal belonged to, where one was running. Null when no window covered the scan — a window no longer decides whether a person may eat.';

-- ---------------------------------------------------------------------------
-- The old guarantee no longer states the rule
--
-- unique (profile_id, meal_window_id, served_on) says "one serving per window
-- per day", which is now both too weak (it allowed lunch and dinner) and too
-- strong (it would reject a legitimate meal 25 hours later that happened to
-- fall in the same named window). It also cannot survive a null window.
-- ---------------------------------------------------------------------------

alter table public.meal_claims
  drop constraint if exists meal_claims_profile_id_meal_window_id_served_on_key;

-- The interval lookup below runs once per scan and grows with the table.
create index if not exists meal_claims_profile_recent
  on public.meal_claims (profile_id, claimed_at desc);

-- ---------------------------------------------------------------------------
-- The new guarantee
--
-- Raises unique_violation (23505) rather than a bespoke error code on purpose:
-- src/lib/canteen/ingest.ts already inserts first and reads 23505 as "already
-- ate", so the ingestion path needs no new branch and a replayed buffer keeps
-- being absorbed silently instead of being logged as a refusal.
--
-- The guarantee is the advisory lock below *plus* this interval test, not the
-- interval test alone. The constraint it replaces was a unique index, which
-- is atomic by construction: two concurrent inserts, one wins, the loser gets
-- 23505 from Postgres itself. An `exists (...)` check has no such guarantee
-- under READ COMMITTED (Supabase's default) — two transactions each read a
-- snapshot taken before the other's insert commits, so two scanners firing on
-- the same person at the same instant would both see "not served yet," both
-- pass, and both commit. That is exactly the case the original canteen
-- migration's header cites as the reason this lives in the database rather
-- than application code. `pg_advisory_xact_lock` closes that gap: the second
-- transaction blocks on the first, so by the time it runs its own `exists`
-- check the first transaction's row is already visible. Do not remove the
-- lock as a "simplification" — without it this function is not atomic.
-- ---------------------------------------------------------------------------

create or replace function app.enforce_meal_interval()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  /*
   * Serialise concurrent scans for this one person before testing.
   *
   * The check this replaces was a unique index, which is atomic. An EXISTS
   * test is not: under READ COMMITTED two terminals scanning the same finger
   * at the same instant would each see a snapshot without the other's
   * uncommitted row, both pass, and both commit — serving twice inside the
   * window this trigger exists to enforce. The lock is transaction-scoped, so
   * it is released on commit or rollback with nothing to clean up.
   *
   * Keyed on the profile, so two different people never wait on each other.
   * A hash collision between two profiles costs a moment of contention and
   * can never produce a wrong answer.
   */
  perform pg_advisory_xact_lock(hashtextextended(new.profile_id::text, 0));

  /*
   * Bounded on both sides, and symmetric. A claim on either side within 24
   * hours means the person has eaten: nothing in this system backdates a
   * claim, so the only way a row can land on the "wrong" side of new.claimed_at
   * is a batch being processed out of chronological order, and this trigger
   * must catch that case rather than trust the caller to have sorted first.
   */
  if exists (
    select 1
      from public.meal_claims c
     where c.profile_id = new.profile_id
       and c.claimed_at >  new.claimed_at - interval '24 hours'
       and c.claimed_at <  new.claimed_at + interval '24 hours'
  ) then
    raise exception 'This person was already served within the last 24 hours.'
      using errcode = 'unique_violation';
  end if;

  return new;
end;
$$;

create trigger meal_claims_once_per_24h
  before insert on public.meal_claims
  for each row execute function app.enforce_meal_interval();

comment on function app.enforce_meal_interval() is
  'One meal per person per rolling 24 hours, made atomic by a per-profile pg_advisory_xact_lock taken before the interval check (an EXISTS test alone is not atomic under READ COMMITTED). Raises 23505 so the ingestion path reads it as a duplicate rather than an error.';
