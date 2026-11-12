import type { SupabaseClient } from "@supabase/supabase-js";

import { selectAllInBatches } from "@/lib/supabase/in-batches";

/**
 * Who joined or left during a pay period.
 *
 * A pay run already pays both — a leaver is owed the days they worked, a joiner
 * the days from their start — but nothing on the payroll said which people they
 * were, so the office could not tell at a glance why somebody's month was short.
 *
 * Reads only what is reliable. A leaver is anyone with a `left_on` inside the
 * period. A joiner is anyone whose `salary_from` is inside it: the add-user form
 * sets that from the joining date typed, whereas `joined_on` is for most of the
 * factory just the day the record was imported, so it would call everybody new.
 */

export interface Movement {
  joinedOn: string | null;
  leftOn: string | null;
}

const within = (date: string | null | undefined, from: string, to: string) =>
  !!date && date >= from && date <= to;

/** The movement a person had in the period, or null when they were simply here. */
export function movementIn(
  person: { left_on?: string | null; salary_from?: string | null },
  periodStart: string,
  periodEnd: string,
): Movement | null {
  const leftOn = within(person.left_on, periodStart, periodEnd) ? (person.left_on ?? null) : null;
  const joinedOn = within(person.salary_from, periodStart, periodEnd)
    ? (person.salary_from ?? null)
    : null;
  return leftOn || joinedOn ? { joinedOn, leftOn } : null;
}

/** "Joined 20-Oct-2026", "Left 15-Oct-2026", or both, for a cell or a badge. */
export function movementTag(
  movement: Movement | null | undefined,
  format: (date: string) => string,
): string {
  if (!movement) return "";
  const parts: string[] = [];
  if (movement.joinedOn) parts.push(`Joined ${format(movement.joinedOn)}`);
  if (movement.leftOn) parts.push(`Left ${format(movement.leftOn)}`);
  return parts.join(" · ");
}

interface ProfileMovementRow {
  id: string;
  left_on: string | null;
  salary_from: string | null;
}

/**
 * The movements among the given people.
 *
 * Fails soft: a database without `salary_from`, or a reader who cannot see the
 * profile rows, simply gets no tags. The payroll itself never depends on this.
 */
export async function loadMovements(
  // Loosely typed on purpose: both the server client and the service client
  // are passed here, and this reads only three columns.
  supabase: SupabaseClient<never, never, never>,
  ids: readonly string[],
  periodStart: string,
  periodEnd: string,
): Promise<Map<string, Movement>> {
  const found = new Map<string, Movement>();
  try {
    const rows = await selectAllInBatches<ProfileMovementRow>(
      [...ids],
      (batch, first, last) =>
        supabase
          .from("profiles" as never)
          .select("id, left_on, salary_from")
          .in("id", batch)
          .order("id")
          .range(first, last) as never,
      "Could not read joining and leaving dates",
    );
    for (const row of rows) {
      const movement = movementIn(row, periodStart, periodEnd);
      if (movement) found.set(row.id, movement);
    }
  } catch {
    // No tags rather than no payroll.
  }
  return found;
}
