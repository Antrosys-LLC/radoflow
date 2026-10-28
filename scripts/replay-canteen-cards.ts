/**
 * Counts the past kitchen scans of the canteen cards (601-670) as meals.
 *
 * Those scans arrived before the cards had profiles, so each was logged as an
 * unknown person and is skipped by every replay. This saves those log rows,
 * removes them, and feeds the same scans back through `ingestMealScans`, so the
 * usual rules (one meal a serving day, the day's menu price) decide each one.
 *
 *   JITI_ALIAS='{"@":"E:/Rado/radoflow/src"}' npx jiti scripts/replay-canteen-cards.ts            # dry run
 *   JITI_ALIAS='{"@":"E:/Rado/radoflow/src"}' npx jiti scripts/replay-canteen-cards.ts --apply
 */
import { existsSync, mkdirSync, writeFileSync } from "node:fs";

const envFile = new URL("../.env.local", import.meta.url);
if (existsSync(envFile)) process.loadEnvFile(envFile);

const { createServiceClient } = await import("@/lib/supabase/service");
const { ingestMealScans } = await import("@/lib/canteen/ingest");

const apply = process.argv.includes("--apply");
const db = createServiceClient();

const { data: device } = await db.from("devices").select("id, site_id, timezone").eq("purpose", "canteen").single();
if (!device) throw new Error("No canteen terminal.");

const rows: { id: number; device_user_id: string; scanned_at: string }[] = [];
for (let o = 0; ; o += 1000) {
  const { data } = await db
    .from("meal_scan_log")
    .select("id, device_user_id, scanned_at")
    .eq("device_id", device.id)
    .eq("outcome", "unknown_person")
    .gte("device_user_id", "601")
    .lte("device_user_id", "670")
    .order("id")
    .range(o, o + 999);
  rows.push(...((data ?? []) as typeof rows));
  if ((data ?? []).length < 1000) break;
}
const cards = rows.filter((r) => /^6\d\d$/.test(r.device_user_id) && Number(r.device_user_id) >= 601 && Number(r.device_user_id) <= 670);
console.log(`${cards.length} unknown scans from cards 601-670.`);
if (!apply) {
  console.log("Dry run. Add --apply to count them as meals.");
  process.exit(0);
}

mkdirSync(new URL("../backups/", import.meta.url), { recursive: true });
writeFileSync(new URL(`../backups/canteen-cards-scans-${Date.now()}.json`, import.meta.url), JSON.stringify(cards, null, 2));

for (let i = 0; i < cards.length; i += 100) {
  const { error } = await db.from("meal_scan_log").delete().in("id", cards.slice(i, i + 100).map((r) => r.id));
  if (error) throw new Error(error.message);
}

const punches = cards.map((r) => ({
  deviceUserId: r.device_user_id,
  // The terminal's own reading: Karachi wall-clock time (UTC+5, no daylight saving).
  localTimestamp: new Date(Date.parse(r.scanned_at) + 5 * 3_600_000).toISOString().slice(0, 19).replace("T", " "),
  state: 0,
  verifyMode: null,
  workCode: null,
  direction: "unknown" as const,
}));
const result = await ingestMealScans(device as never, punches as never);
console.log("Result:", JSON.stringify(result));
