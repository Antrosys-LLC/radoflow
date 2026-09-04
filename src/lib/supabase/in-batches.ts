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
 */

/** Comfortably inside the URI limit at UUID length, with room for other filters. */
export const ID_BATCH_SIZE = 100;

type Result<T> = { data: T[] | null; error: { message: string } | null };

export async function selectInBatches<T>(
  ids: readonly string[],
  select: (batch: string[]) => PromiseLike<Result<T>>,
  describe: string,
): Promise<T[]> {
  const rows: T[] = [];

  for (let i = 0; i < ids.length; i += ID_BATCH_SIZE) {
    const { data, error } = await select(ids.slice(i, i + ID_BATCH_SIZE));
    if (error) throw new Error(`${describe}: ${error.message}`);
    if (data) rows.push(...data);
  }

  return rows;
}
