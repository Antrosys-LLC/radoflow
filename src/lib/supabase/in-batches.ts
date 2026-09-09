/**
 * Asking for rows by a long list of ids, a batch at a time.
 *
 * PostgREST takes its filters in the URL, so `in(...)` over a whole factory's
 * worth of profile ids builds a request URI of tens of kilobytes and the
 * server rejects it. The rejection is the dangerous part: an errored read
 * hands back no rows, which every caller here would otherwise read as "nobody
 * clocked in that day" and draw a floor marked absent. So this batches the ids
 * to keep each URI well inside the limit, and throws rather than returning a
 * short answer that looks like real data.
 *
 * The batches run concurrently. They were sequential, which on four hundred
 * people is five round trips end to end — about a second and a half added to
 * the dashboard, the attendance log and the check-in register, and the
 * dashboard re-runs it every thirty seconds. Nothing about a batch depends on
 * the one before it; they are one query split up to fit in a URI, so there was
 * never a reason to wait.
 */

/** Comfortably inside the URI limit at UUID length, with room for other filters. */
export const ID_BATCH_SIZE = 100;

/**
 * How many batches may be in flight at once.
 *
 * Not unbounded. A thousand-person site would otherwise open eleven
 * simultaneous connections for one chart, and Supabase's pooler is a shared
 * resource this app is not the only user of — a page that renders slightly
 * faster by making every other page wait is not faster. Six covers six hundred
 * people in a single round trip's worth of latency, which is every site this
 * runs on with room to spare.
 */
export const BATCH_CONCURRENCY = 6;

type Result<T> = { data: T[] | null; error: { message: string } | null };

export async function selectInBatches<T>(
  ids: readonly string[],
  select: (batch: string[]) => PromiseLike<Result<T>>,
  describe: string,
): Promise<T[]> {
  if (ids.length === 0) return [];

  const batches: string[][] = [];
  for (let i = 0; i < ids.length; i += ID_BATCH_SIZE) {
    batches.push(ids.slice(i, i + ID_BATCH_SIZE));
  }

  /*
   * Results are collected by index rather than pushed as they land, so the
   * rows come back in id order however the network reorders the responses.
   * Nothing here depends on that today, but a helper that returns a different
   * order run to run is a bug waiting for the first caller that does.
   */
  const collected: T[][] = new Array<T[]>(batches.length);

  /*
   * A shared cursor rather than chunking the batches into fixed groups: with
   * groups, one slow batch holds up every batch behind it in its group while
   * other workers sit idle. Each worker taking the next outstanding batch
   * keeps all of them busy until the work runs out.
   */
  let next = 0;

  async function worker(): Promise<void> {
    for (;;) {
      const index = next++;
      const batch = batches[index];
      if (!batch) return;

      const { data, error } = await select(batch);
      // Thrown, never swallowed: a short answer here is indistinguishable from
      // a quiet day, and gets drawn as one.
      if (error) throw new Error(`${describe}: ${error.message}`);
      collected[index] = data ?? [];
    }
  }

  await Promise.all(
    Array.from({ length: Math.min(BATCH_CONCURRENCY, batches.length) }, () => worker()),
  );

  return collected.flat();
}

/**
 * The PostgREST page size, and the reason this second function exists.
 *
 * A hosted Supabase project caps any single response at a thousand rows and
 * says nothing about having done so — the reply is a valid, complete-looking
 * array that happens to stop. `selectInBatches` splits by *id* to keep the URI
 * short, which is a different problem: a hundred people over a nine-day period
 * fits in one page, the same hundred over a month does not, and payroll then
 * prices whoever fell off the end as though they never came to work.
 */
export const PAGE_SIZE = 1000;

/**
 * Every matching row for a long list of ids — batched by id, and paged.
 *
 * The `select` callback is handed the batch and a row range, and must apply
 * both. It must also impose a stable order, or paging is meaningless: without
 * one, Postgres may return the same row on two pages and omit another
 * entirely.
 *
 * Prefer this over `selectInBatches` wherever the rows per id are unbounded —
 * a date range, an audit trail, a person's punches. Use the simpler one only
 * when each id yields a handful of rows and the batch cannot approach a page.
 */
export async function selectAllInBatches<T>(
  ids: readonly string[],
  select: (batch: string[], from: number, to: number) => PromiseLike<Result<T>>,
  describe: string,
): Promise<T[]> {
  if (ids.length === 0) return [];

  const batches: string[][] = [];
  for (let i = 0; i < ids.length; i += ID_BATCH_SIZE) {
    batches.push(ids.slice(i, i + ID_BATCH_SIZE));
  }

  const collected: T[][] = new Array<T[]>(batches.length);
  let next = 0;

  async function worker(): Promise<void> {
    for (;;) {
      const index = next++;
      const batch = batches[index];
      if (!batch) return;

      const rows: T[] = [];
      for (let offset = 0; ; offset += PAGE_SIZE) {
        const { data, error } = await select(batch, offset, offset + PAGE_SIZE - 1);
        if (error) throw new Error(`${describe}: ${error.message}`);

        const page = data ?? [];
        rows.push(...page);
        // A short page is the last page. A full one might not be, so ask again
        // — one wasted round trip on an exact multiple is the price of never
        // stopping one row early.
        if (page.length < PAGE_SIZE) break;
      }
      collected[index] = rows;
    }
  }

  await Promise.all(
    Array.from({ length: Math.min(BATCH_CONCURRENCY, batches.length) }, () => worker()),
  );

  return collected.flat();
}
