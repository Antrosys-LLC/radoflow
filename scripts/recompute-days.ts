/**
 * Rebuilds the listed (person, date) attendance days from their punches.
 * Written by scripts/apply-workers-list.mjs after it moves a reused number's
 * punches to the new holder.
 *
 *   JITI_ALIAS='{"@":"E:/Rado/radoflow/src"}' npx jiti scripts/recompute-days.ts backups/days-to-recompute-<stamp>.json
 */
import { existsSync, readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

const envFile = new URL("../.env.local", import.meta.url);
if (existsSync(envFile)) process.loadEnvFile(envFile);

const { recomputeAttendanceDay } = await import("@/lib/devices/ingest");
const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
  auth: { persistSession: false },
});

const days: { profile_id: string; work_date: string }[] = JSON.parse(readFileSync(process.argv[2]!, "utf8"));
const { data: profiles } = await db.from("profiles").select("id, site_id").in("id", [...new Set(days.map((d) => d.profile_id))]);
const site = new Map((profiles ?? []).map((p) => [p.id, p.site_id as string]));

let done = 0;
for (const day of days) {
  await recomputeAttendanceDay(day.profile_id, day.work_date, site.get(day.profile_id)!);
  done++;
}
console.log(`Rebuilt ${done} days.`);
