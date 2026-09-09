import { describe, expect, it } from "vitest";

import {
  BATCH_CONCURRENCY,
  ID_BATCH_SIZE,
  PAGE_SIZE,
  selectAllInBatches,
  selectInBatches,
} from "./in-batches";

/** `count` ids, distinguishable so order can be asserted. */
function ids(count: number): string[] {
  return Array.from({ length: count }, (_, i) => `id-${i}`);
}

describe("selectInBatches", () => {
  it("returns every row, in id order", async () => {
    const rows = await selectInBatches(
      ids(250),
      (batch) => Promise.resolve({ data: batch.map((id) => ({ id })), error: null }),
      "could not read",
    );

    expect(rows).toHaveLength(250);
    // Order matters even though nothing depends on it today: a helper that
    // returns a different order run to run is a bug waiting for its first
    // caller that does.
    expect(rows[0]).toEqual({ id: "id-0" });
    expect(rows[249]).toEqual({ id: "id-249" });
  });

  it("splits at the batch size", async () => {
    const sizes: number[] = [];
    await selectInBatches(
      ids(250),
      (batch) => {
        sizes.push(batch.length);
        return Promise.resolve({ data: [], error: null });
      },
      "could not read",
    );

    expect(sizes).toEqual([ID_BATCH_SIZE, ID_BATCH_SIZE, 50]);
  });

  it("runs batches concurrently", async () => {
    // The point of the change: five batches used to be five round trips end to
    // end. Counting peak overlap proves they now overlap rather than queue.
    let inFlight = 0;
    let peak = 0;

    await selectInBatches(
      ids(500),
      async (batch) => {
        inFlight += 1;
        peak = Math.max(peak, inFlight);
        await new Promise((resolve) => setTimeout(resolve, 5));
        inFlight -= 1;
        return { data: batch.map((id) => ({ id })), error: null };
      },
      "could not read",
    );

    expect(peak).toBeGreaterThan(1);
  });

  it("never exceeds the concurrency limit", async () => {
    // Supabase's pooler is shared. A page that renders faster by making every
    // other page wait is not faster.
    let inFlight = 0;
    let peak = 0;

    await selectInBatches(
      ids(ID_BATCH_SIZE * (BATCH_CONCURRENCY + 4)),
      async (batch) => {
        inFlight += 1;
        peak = Math.max(peak, inFlight);
        await new Promise((resolve) => setTimeout(resolve, 2));
        inFlight -= 1;
        return { data: batch.map((id) => ({ id })), error: null };
      },
      "could not read",
    );

    expect(peak).toBeLessThanOrEqual(BATCH_CONCURRENCY);
  });

  it("throws on an error rather than returning a short answer", async () => {
    // The whole reason this helper exists: a failed read hands back no rows,
    // and every caller would draw that as a floor marked absent.
    await expect(
      selectInBatches(
        ids(150),
        (batch) =>
          Promise.resolve(
            batch[0] === "id-100"
              ? { data: null, error: { message: "URI too long" } }
              : { data: [], error: null },
          ),
        "Could not read attendance",
      ),
    ).rejects.toThrow("Could not read attendance: URI too long");
  });

  it("asks for nothing when there are no ids", async () => {
    let called = 0;
    const rows = await selectInBatches(
      [],
      () => {
        called += 1;
        return Promise.resolve({ data: [], error: null });
      },
      "could not read",
    );

    expect(rows).toEqual([]);
    expect(called).toBe(0);
  });

  it("treats a null payload as no rows rather than throwing", async () => {
    // PostgREST answers a successful read of nothing with a null body; that is
    // an empty day, not a failure.
    const rows = await selectInBatches(
      ids(10),
      () => Promise.resolve({ data: null, error: null }),
      "could not read",
    );

    expect(rows).toEqual([]);
  });
});

describe("selectAllInBatches", () => {
  /**
   * A source that holds `perId` rows for every id and serves them a page at a
   * time, exactly as PostgREST does: a request for more than a page's worth
   * comes back silently truncated.
   */
  function paged(perId: number) {
    return (batch: string[], first: number, last: number) => {
      const all = batch.flatMap((id) => Array.from({ length: perId }, (_, n) => ({ id, n })));
      const window = all.slice(first, last + 1);
      return Promise.resolve({ data: window.slice(0, PAGE_SIZE), error: null });
    };
  }

  it("keeps asking until a batch runs out of rows", async () => {
    // 100 ids × 30 rows = 3,000 — three pages for the first batch alone, and
    // the shape that made payroll price a month's attendance off its first
    // thousand rows.
    const rows = await selectAllInBatches(ids(250), paged(30), "could not read");

    expect(rows).toHaveLength(250 * 30);
    expect(rows[0]).toEqual({ id: "id-0", n: 0 });
    expect(rows.at(-1)).toEqual({ id: "id-249", n: 29 });
  });

  it("asks once more when a page comes back exactly full", async () => {
    // The last page of an exact multiple is empty, and stopping on a full page
    // would end one row short of it every time.
    const calls: number[] = [];
    const rows = await selectAllInBatches(
      ids(1),
      (batch, first, last) => {
        calls.push(first);
        const all = Array.from({ length: PAGE_SIZE }, (_, n) => ({ id: batch[0], n }));
        return Promise.resolve({ data: all.slice(first, last + 1), error: null });
      },
      "could not read",
    );

    expect(rows).toHaveLength(PAGE_SIZE);
    expect(calls).toEqual([0, PAGE_SIZE]);
  });

  it("throws rather than handing back a short answer", async () => {
    // The whole point. A payroll run that reads an error as "this person never
    // came to work" pays them nothing for a month they worked.
    await expect(
      selectAllInBatches(
        ids(150),
        (batch) =>
          Promise.resolve(
            batch[0] === "id-100"
              ? { data: null, error: { message: "URI too long" } }
              : { data: [], error: null },
          ),
        "could not read attendance",
      ),
    ).rejects.toThrow("could not read attendance: URI too long");
  });

  it("does nothing at all for no ids", async () => {
    let called = false;
    const rows = await selectAllInBatches(
      [],
      () => {
        called = true;
        return Promise.resolve({ data: [], error: null });
      },
      "could not read",
    );

    expect(rows).toEqual([]);
    expect(called).toBe(false);
  });
});
