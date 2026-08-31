"use server";

import { revalidatePath } from "next/cache";

import { resolveDayType } from "@/lib/devices/ingest";
import { requirePermission } from "@/lib/auth/session";
import type { DayType } from "@/lib/payroll/types";
import { createClient } from "@/lib/supabase/server";

export interface ImportResultMessage {
  ok: boolean;
  message: string;
}

export interface ReviewedRegisterRow {
  profileId: string;
  workDate: string;
  status: "present" | "absent" | "leave";
  hoursWorked: number | null;
  note: string | null;
}

/**
 * Commits reviewed register rows as manual attendance entries.
 *
 * `is_manual: true` is what protects these from `recomputeAttendanceDay` —
 * see ingest.ts — so a device sync landing on the same date later cannot
 * silently overwrite a historical row someone just typed in by hand. Rows
 * that already carry real punch data (a `first_in`) are skipped rather than
 * replaced: a photographed guess should never overwrite a real clock-in.
 */
export async function importRegisterRows(
  siteId: string,
  rows: ReviewedRegisterRow[],
): Promise<ImportResultMessage> {
  const session = await requirePermission("registers.import");

  if (!siteId) return { ok: false, message: "Choose a factory first." };
  if (rows.length === 0) return { ok: false, message: "Nothing to import." };

  const supabase = await createClient();

  const uniqueDates = [...new Set(rows.map((r) => r.workDate))];
  const { data: existing } = await supabase
    .from("attendance_days")
    .select("profile_id, work_date, first_in")
    .in(
      "profile_id",
      rows.map((r) => r.profileId),
    )
    .in("work_date", uniqueDates);

  const existingByKey = new Map(
    (existing ?? []).map((row) => [`${row.profile_id}:${row.work_date}`, row]),
  );

  const dayTypeCache = new Map<string, DayType>();
  let imported = 0;
  const skipped: string[] = [];
  const failed: string[] = [];

  for (const row of rows) {
    const key = `${row.profileId}:${row.workDate}`;
    const already = existingByKey.get(key);
    if (already?.first_in) {
      skipped.push(`${row.workDate} — already has a real clock-in`);
      continue;
    }

    if (!dayTypeCache.has(row.workDate)) {
      dayTypeCache.set(row.workDate, await resolveDayType(siteId, row.workDate));
    }

    /*
     * `.select()` so a row that was filtered out rather than written can be
     * told apart from one that landed. An upsert taking the UPDATE path is
     * refused silently by an RLS USING clause — zero rows, no error — so
     * counting this as imported without checking would report a successful
     * import of attendance that does not exist.
     */
    const { data, error } = await supabase
      .from("attendance_days")
      .upsert(
        {
          profile_id: row.profileId,
          site_id: siteId,
          work_date: row.workDate,
          day_type: dayTypeCache.get(row.workDate)!,
          status: row.status,
          regular_hours: row.hoursWorked ?? 0,
          note: row.note
            ? `Imported from a paper register: ${row.note}`
            : "Imported from a paper register",
          is_manual: true,
          computed_at: new Date().toISOString(),
        },
        { onConflict: "profile_id,work_date" },
      )
      .select("id");

    if (error) failed.push(`${row.workDate}: ${error.message}`);
    else if (!data || data.length === 0) {
      failed.push(`${row.workDate}: not permitted to write attendance at this factory`);
    } else imported += 1;
  }

  await supabase.from("audit_log").insert({
    actor_id: session.userId,
    action: "registers.import",
    entity_type: "attendance_days",
    site_id: siteId,
    note: `Imported ${imported} row(s) from a digitized register page.${
      skipped.length > 0 ? ` ${skipped.length} skipped (existing punch data).` : ""
    }`,
  });

  revalidatePath("/attendance");
  revalidatePath("/attendance/logs");
  revalidatePath("/reports");

  const parts = [`Imported ${imported} row(s) as manual attendance entries.`];
  if (skipped.length > 0) parts.push(`${skipped.length} skipped — already had real punch data.`);
  if (failed.length > 0) parts.push(`${failed.length} failed: ${failed.slice(0, 3).join("; ")}.`);

  return { ok: imported > 0 || rows.length === skipped.length, message: parts.join(" ") };
}
