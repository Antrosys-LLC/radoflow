#!/usr/bin/env node
/**
 * Puts a department on no fixed hours: every active person in it is marked
 * flexible_hours (no in or out time enforced, never late, paid for completing
 * the duty hours), taken off the shift roster, and every late already recorded
 * for them is cleared.
 *
 *   node scripts/make-department-flexible.mjs Creation            # dry run
 *   node scripts/make-department-flexible.mjs Creation --apply
 *   node scripts/make-department-flexible.mjs --revert <backup-file>
 *
 * Only `is_late` and `minutes_late` are touched on past days; hours are left
 * alone. Every row changed is written to backups/ first, and --revert puts the
 * profiles and days back exactly. Pay runs already made keep their old
 * deductions until they are recalculated.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

for (const line of readFileSync(new URL("../.env.local", import.meta.url), "utf8").split(/\r?\n/)) {
  const at = line.indexOf("=");
  if (at < 1 || line.trim().startsWith("#")) continue;
  const key = line.slice(0, at).trim();
  if (!process.env[key]) process.env[key] = line.slice(at + 1).trim().replace(/^["']|["']$/g, "");
}

const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

const args = process.argv.slice(2);
const apply = args.includes("--apply");
const revertAt = args.indexOf("--revert");
const BACKUP_DIR = new URL("../backups/", import.meta.url);

async function inBatches(ids, fn) {
  for (let i = 0; i < ids.length; i += 100) await fn(ids.slice(i, i + 100));
}

if (revertAt >= 0) {
  const backup = JSON.parse(readFileSync(args[revertAt + 1], "utf8"));
  for (const p of backup.profiles) {
    const { error } = await db
      .from("profiles")
      .update({ flexible_hours: p.flexible_hours, shift_id: p.shift_id })
      .eq("id", p.id);
    if (error) console.error(`profile ${p.id}: ${error.message}`);
  }
  for (const d of backup.days) {
    const { error } = await db
      .from("attendance_days")
      .update({ minutes_late: d.minutes_late, is_late: d.is_late })
      .eq("id", d.id);
    if (error) console.error(`day ${d.id}: ${error.message}`);
  }
  console.log(`Restored ${backup.profiles.length} profiles and ${backup.days.length} days.`);
  process.exit(0);
}

const name = args.find((a) => !a.startsWith("--"));
if (!name) {
  console.error("Usage: make-department-flexible.mjs <department name> [--apply]");
  process.exit(1);
}

const { data: depts, error: deptError } = await db.from("departments").select("id, name").ilike("name", name);
if (deptError) throw new Error(deptError.message);
if (depts.length === 0) throw new Error(`No department called "${name}".`);

const { data: people, error: peopleError } = await db
  .from("profiles")
  .select("id, full_name, status, flexible_hours, shift_id")
  .in("department_id", depts.map((d) => d.id))
  .eq("status", "active");
if (peopleError) throw new Error(peopleError.message);

const ids = people.map((p) => p.id);
const days = [];
await inBatches(ids, async (batch) => {
  for (let page = 0; ; page++) {
    const { data, error } = await db
      .from("attendance_days")
      .select("id, profile_id, work_date, minutes_late, is_late")
      .in("profile_id", batch)
      .or("is_late.eq.true,minutes_late.gt.0")
      .order("id")
      .range(page * 1000, page * 1000 + 999);
    if (error) throw new Error(error.message);
    days.push(...data);
    if (data.length < 1000) break;
  }
});

const minutes = days.reduce((t, d) => t + (d.minutes_late ?? 0), 0);
console.log(`${depts.map((d) => d.name).join(", ")}: ${people.length} active people.`);
console.log(`  ${people.filter((p) => !p.flexible_hours).length} to mark flexible, ${people.filter((p) => p.shift_id).length} to take off a shift.`);
console.log(`  ${days.length} late days to clear (${minutes} minutes).`);

if (!apply) {
  console.log("Dry run. Re-run with --apply to commit.");
  process.exit(0);
}

if (!existsSync(BACKUP_DIR)) mkdirSync(BACKUP_DIR, { recursive: true });
const stamp = new Date().toISOString().replace(/[:.]/g, "-");
const file = new URL(`flexible-${name.toLowerCase()}-${stamp}.json`, BACKUP_DIR);
writeFileSync(
  file,
  JSON.stringify({ profiles: people.map(({ id, flexible_hours, shift_id }) => ({ id, flexible_hours, shift_id })), days }, null, 2),
);
console.log(`Backed up to ${file.pathname}`);

await inBatches(ids, async (batch) => {
  const { error } = await db.from("profiles").update({ flexible_hours: true, shift_id: null }).in("id", batch);
  if (error) throw new Error(error.message);
});
await inBatches(days.map((d) => d.id), async (batch) => {
  const { error } = await db.from("attendance_days").update({ minutes_late: 0, is_late: false }).in("id", batch);
  if (error) throw new Error(error.message);
});
console.log(`Done: ${people.length} people made flexible, ${days.length} late days cleared.`);
