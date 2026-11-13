import type { SupabaseClient } from "@supabase/supabase-js";

/** The department whose people are kitchen cards and nothing else. */
export const CANTEEN_CARDS_DEPARTMENT = "CANTEEN";

/**
 * A canteen card is not a worker.
 *
 * The unnamed card users on the terminals exist only so that a kitchen scan can
 * be counted as a meal. They have no attendance, no pay and no place in a
 * headcount, so every screen and file outside the canteen leaves them out — the
 * register, the logs, reports, rates, downloads and the dashboard's count. Only
 * the canteen module and the users screen, where they are managed, still list
 * them.
 *
 * They are found by their department rather than a flag on the profile, so no
 * migration stands between this and the people already enrolled.
 */
export async function canteenCardDepartmentIds(
  supabase: Pick<SupabaseClient, "from">,
): Promise<string[]> {
  const { data } = await supabase
    .from("departments")
    .select("id")
    .eq("code", CANTEEN_CARDS_DEPARTMENT);
  return (data ?? []).map((row: { id: string }) => row.id);
}

/** The rows that are not canteen cards. Departments without an id are kept. */
export function withoutCanteenCards<T extends { department_id: string | null }>(
  rows: readonly T[],
  cardDepartments: readonly string[],
): T[] {
  if (cardDepartments.length === 0) return [...rows];
  return rows.filter((row) => !row.department_id || !cardDepartments.includes(row.department_id));
}

/** The same exclusion for a department list, so the cards' own department is not offered. */
export function withoutCardDepartments<T extends { id: string }>(
  departments: readonly T[],
  cardDepartments: readonly string[],
): T[] {
  return departments.filter((d) => !cardDepartments.includes(d.id));
}
