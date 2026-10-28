-- ============================================================================
-- AUTO CHECK-OUT — paste into the Supabase SQL editor, in TWO runs.
--
-- Run 1: just the first statement (a new enum value cannot be used in the
--        transaction that adds it).
-- Run 2: the rest, after replacing the two placeholders.
--
-- Before Run 2 set CRON_SECRET on the Railway service (any long random string)
-- and redeploy, then use the same string below.
-- ============================================================================

-- ---- Run 1 -----------------------------------------------------------------
alter type public.punch_source add value if not exists 'auto';

-- ---- Run 2 -----------------------------------------------------------------
create extension if not exists pg_cron;
create extension if not exists pg_net;

-- Every 15 minutes. Replace <APP_URL> (e.g. https://your-app.up.railway.app)
-- and <CRON_SECRET>. Re-running replaces the job rather than doubling it.
select cron.unschedule('auto-check-out')
 where exists (select 1 from cron.job where jobname = 'auto-check-out');

select cron.schedule(
  'auto-check-out',
  '*/15 * * * *',
  $job$
    select net.http_post(
      url     := '<APP_URL>/api/cron/auto-check-out',
      headers := jsonb_build_object('x-cron-secret', '<CRON_SECRET>'),
      timeout_milliseconds := 55000
    );
  $job$
);

-- To stop it:   select cron.unschedule('auto-check-out');
-- To see runs:  select * from cron.job_run_details order by start_time desc limit 10;
