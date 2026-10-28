/**
 * Closes check-ins that were never closed on days already over, for a range of
 * dates — the missing check-outs that leave a day at zero hours.
 * Dry by default.
 *
 *   JITI_ALIAS='{"@":"E:/Rado/radoflow/src"}' npx jiti scripts/auto-check-out-days.ts 2026-10-01 2026-10-26
 *   JITI_ALIAS='{"@":"E:/Rado/radoflow/src"}' npx jiti scripts/auto-check-out-days.ts 2026-10-01 2026-10-26 --apply
 *
 * Each stamp is a source='auto' punch at the person's due time (end of duty, or
 * plus the overtime ceiling for those who earn overtime), held before their next
 * scan. Recalculate the pay run afterwards.
 */
import { existsSync } from "node:fs";

const envFile = new URL("../.env.local", import.meta.url);
if (existsSync(envFile)) process.loadEnvFile(envFile);

const { autoCheckOutOpenDays } = await import("@/lib/attendance/auto-check-out-run");

const args = process.argv.slice(2);
const apply = args.includes("--apply");
const [from, to] = args.filter((a) => !a.startsWith("--"));
if (!from || !to) {
  console.error("Usage: auto-check-out-days.ts <from YYYY-MM-DD> <to YYYY-MM-DD> [--apply]");
  process.exit(1);
}

const result = await autoCheckOutOpenDays({ from, to, dryRun: !apply });
console.log(`${result.considered} open days found; ${result.closed.length} ${apply ? "closed" : "would be closed"}.`);
if (result.heldByOffice > 0) console.log(`${result.heldByOffice} left alone: corrected or locked by the office.`);
for (const c of result.closed.slice(0, 15)) {
  console.log(`  ${c.workDate} ${c.name.padEnd(22)} in ${c.checkedInAt.slice(11, 16)}Z -> out ${c.checkedOutAt.slice(11, 16)}Z`);
}
if (!apply) console.log("\nDry run — nothing written. Add --apply to commit.");
