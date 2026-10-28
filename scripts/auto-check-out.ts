/**
 * Runs the automatic check-out by hand: the same pass the cron route makes.
 * Dry by default — it lists who would be checked out, and when, and writes
 * nothing.
 *
 *   JITI_ALIAS='{"@":"E:/Rado/radoflow/src"}' npx jiti scripts/auto-check-out.ts
 *   JITI_ALIAS='{"@":"E:/Rado/radoflow/src"}' npx jiti scripts/auto-check-out.ts --apply
 *   JITI_ALIAS='{"@":"E:/Rado/radoflow/src"}' npx jiti scripts/auto-check-out.ts --hours 72
 *
 * `--hours` widens how far back an open check-in is looked for (default 36).
 * Closing old ones changes the hours those days pay, so read the dry run first.
 */

import { existsSync } from "node:fs";

const envFile = new URL("../.env.local", import.meta.url);
if (existsSync(envFile)) process.loadEnvFile(envFile);

const { autoCheckOutOverdue } = await import("@/lib/attendance/auto-check-out-run");
const { formatDate, formatTime } = await import("@/lib/time");

const args = process.argv.slice(2);
const apply = args.includes("--apply");
const hoursAt = args.indexOf("--hours");
const lookbackHours = hoursAt >= 0 ? Number(args[hoursAt + 1]) : undefined;

const result = await autoCheckOutOverdue({
  dryRun: !apply,
  ...(lookbackHours === undefined ? {} : { lookbackHours }),
});

console.log(`${result.considered} people still checked in; ${result.closed.length} are past their time.`);
if (result.heldByOffice > 0) console.log(`${result.heldByOffice} left alone: corrected or locked by the office.`);
for (const c of result.closed.slice(0, 40)) {
  console.log(
    `  ${c.name.padEnd(24)} in ${formatDate(c.checkedInAt)} ${formatTime(c.checkedInAt)}  ->  out ${formatDate(c.checkedOutAt)} ${formatTime(c.checkedOutAt)}`,
  );
}
if (result.closed.length > 40) console.log(`  … and ${result.closed.length - 40} more`);
console.log(apply ? "\nDone." : "\nDry run — nothing written. Add --apply to commit.");
