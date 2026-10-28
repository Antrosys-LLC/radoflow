#!/usr/bin/env node
/**
 * Makes each person's pay arrangement match the duty-rule column of the workers
 * list.
 *
 *   NO TIME LIMIT / No Attd.  a fixed salary: no check-in or check-out is kept,
 *                             no shift, never late, paid the month's salary for
 *                             the days the run covers (requires_attendance =
 *                             false, flexible_hours = true, shift cleared)
 *   Duty 8 H / +Time / 12 H   a shift worker: requires attendance, not flexible
 *   FIXED                     a contract firm, billed once from its department
 *
 * People are matched on the roll against their terminal number, then on a name
 * that is unique among active staff. Anyone who cannot be matched either way is
 * listed and left alone.
 *
 * A person made flexible by `make-department-flexible.mjs` whom the sheet puts
 * on a shift is put back: flexible off, shift restored from that script's
 * backup, and (Accounts and Admin only) the lates it cleared restored.
 *
 *   node scripts/apply-duty-rules.mjs "WORKERS LIST 01.xlsx"            # dry run
 *   node scripts/apply-duty-rules.mjs "WORKERS LIST 01.xlsx" --apply
 *   node scripts/apply-duty-rules.mjs --revert <backup-file>
 */
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

import { readWorkers } from "./lib/read-workers-xlsx.mjs";

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
const APPLY = args.includes("--apply");
const BACKUPS = new URL("../backups/", import.meta.url);
const FIELDS = ["requires_attendance", "flexible_hours", "shift_id"];

async function inBatches(ids, fn) {
  for (let i = 0; i < ids.length; i += 100) await fn(ids.slice(i, i + 100));
}

const revertAt = args.indexOf("--revert");
if (revertAt >= 0) {
  const backup = JSON.parse(readFileSync(args[revertAt + 1], "utf8"));
  for (const p of backup.profiles) {
    const { id, ...fields } = p;
    const { error } = await db.from("profiles").update(fields).eq("id", id);
    if (error) console.error(`profile ${id}: ${error.message}`);
  }
  for (const d of backup.days) {
    const { error } = await db.from("attendance_days").update({ minutes_late: d.minutes_late, is_late: d.is_late }).eq("id", d.id);
    if (error) console.error(`day ${d.id}: ${error.message}`);
  }
  console.log(`Restored ${backup.profiles.length} profiles and ${backup.days.length} days.`);
  process.exit(0);
}

const path = args.find((a) => !a.startsWith("--"));
if (!path) {
  console.error('Usage: apply-duty-rules.mjs "WORKERS LIST.xlsx" [--apply]');
  process.exit(1);
}

const { people: sheet } = readWorkers(path);

const profiles = [];
for (let o = 0; ; o += 1000) {
  const { data, error } = await db
    .from("profiles")
    .select("id, full_name, device_pin, status, monthly_salary, requires_attendance, flexible_hours, duty_hours, shift_id, worker_type, departments(name)")
    .eq("status", "active")
    .range(o, o + 999);
  if (error) throw new Error(error.message);
  profiles.push(...data);
  if (data.length < 1000) break;
}

const norm = (s) => s.toLowerCase().replace(/[^a-z]/g, "");
const byPin = new Map();
const byName = new Map();
for (const p of profiles) {
  if (p.device_pin) (byPin.get(String(p.device_pin)) ?? byPin.set(String(p.device_pin), []).get(String(p.device_pin))).push(p);
  (byName.get(norm(p.full_name)) ?? byName.set(norm(p.full_name), []).get(norm(p.full_name))).push(p);
}

// What flexible_hours / shift_id were before make-department-flexible ran.
const flexBackup = new Map();
const lateBackup = [];
for (const f of readdirSync(BACKUPS).filter((n) => n.startsWith("flexible-"))) {
  const b = JSON.parse(readFileSync(new URL(f, BACKUPS), "utf8"));
  const dept = f.split("-")[1];
  for (const p of b.profiles) flexBackup.set(p.id, p);
  for (const d of b.days) lateBackup.push({ ...d, dept });
}

const changes = [];
const unmatched = [];
const matchedIds = new Set();

for (const s of sheet) {
  // A blank rule says nothing about the person; leave them as they are.
  if (s.workerType === "contractor" || !s.rule) continue;

  let candidates = s.roll ? (byPin.get(String(Number(s.roll))) ?? byPin.get(s.roll) ?? []) : [];
  // The roll is the terminal number: trust it only if the name agrees.
  candidates = candidates.filter((p) => norm(p.full_name) === norm(s.name) || candidates.length === 1);
  if (candidates.length !== 1) {
    const named = byName.get(norm(s.name)) ?? [];
    candidates = named.length === 1 ? named : [];
  }
  if (candidates.length !== 1) {
    unmatched.push(s);
    continue;
  }
  const p = candidates[0];
  if (matchedIds.has(p.id)) continue;
  matchedIds.add(p.id);
  if (p.worker_type === "contractor") continue;

  const fixed = !s.requiresAttendance;
  const want = {
    requires_attendance: s.requiresAttendance,
    flexible_hours: fixed ? true : false,
    shift_id: fixed ? null : p.shift_id,
  };
  // Put back the shift a department-wide change took away.
  if (!fixed && p.shift_id === null && flexBackup.get(p.id)?.shift_id) want.shift_id = flexBackup.get(p.id).shift_id;

  const diff = {};
  for (const k of FIELDS) {
    if (want[k] !== p[k]) diff[k] = want[k];
  }
  if (Object.keys(diff).length > 0) changes.push({ p, s, diff });
}

const salary = [];
for (const s of sheet) {
  const p = profiles.find((x) => matchedIds.has(x.id) && (String(x.device_pin) === String(Number(s.roll)) && norm(x.full_name) === norm(s.name)));
  if (p && s.salary && Number(p.monthly_salary) !== s.salary) salary.push({ s, p });
}
const tally = (pred) => changes.filter(pred).length;
console.log(`${sheet.length} on the sheet, ${matchedIds.size} matched, ${unmatched.length} not matched.`);
console.log(`${changes.length} people change:`);
console.log(`  -> fixed salary (no check-in/out):   ${tally((c) => c.diff.requires_attendance === false)}`);
console.log(`  -> on attendance again:              ${tally((c) => c.diff.requires_attendance === true || c.diff.flexible_hours === false)}`);
for (const c of changes.slice(0, 80)) {
  console.log(
    `  ${(c.p.departments?.name ?? "").padEnd(16)} ${c.p.full_name.padEnd(22)} [${c.s.rule.slice(0, 18).padEnd(18)}] ${Object.entries(c.diff).map(([k, v]) => `${k}: ${c.p[k]} -> ${v}`).join(", ")}`,
  );
}
if (changes.length > 80) console.log(`  … and ${changes.length - 80} more`);
if (unmatched.length > 0) {
  console.log(`\nNot matched (left alone):`);
  for (const s of unmatched.slice(0, 30)) console.log(`  ${s.department.padEnd(16)} ${s.name} (roll ${s.roll || "-"}) ${s.rule}`);
}

console.log(`
${salary.length} salaries differ from the sheet (reported only, not changed):`);
for (const { s, p } of salary.slice(0, 40)) console.log(`  ${s.department.padEnd(16)} ${s.name.padEnd(22)} sheet ${String(s.salary).padStart(7)}  db ${String(p.monthly_salary).padStart(7)}`);

// Lates cleared for Accounts/Admin people the sheet puts back on a shift.
const restoredIds = new Set(changes.filter((c) => c.diff.flexible_hours === false).map((c) => c.p.id));
const lateDays = lateBackup.filter((d) => d.dept !== "creation" && restoredIds.has(d.profile_id));
console.log(`\n${restoredIds.size} put back on a shift/attendance; ${lateDays.length} cleared lates in Accounts/Admin would be restored.`);

if (!APPLY) {
  console.log("\nDry run. Add --apply to commit.");
  process.exit(0);
}

if (!existsSync(BACKUPS)) mkdirSync(BACKUPS, { recursive: true });
const file = new URL(`duty-rules-${new Date().toISOString().replace(/[:.]/g, "-")}.json`, BACKUPS);
writeFileSync(
  file,
  JSON.stringify(
    {
      profiles: changes.map(({ p }) => ({ id: p.id, requires_attendance: p.requires_attendance, flexible_hours: p.flexible_hours, duty_hours: p.duty_hours, shift_id: p.shift_id })),
      days: lateDays.map((d) => ({ id: d.id, minutes_late: 0, is_late: false })),
    },
    null,
    2,
  ),
);
console.log(`Backed up to ${file.pathname}`);

for (const { p, diff } of changes) {
  const { error } = await db.from("profiles").update(diff).eq("id", p.id);
  if (error) console.error(`  ${p.full_name}: ${error.message}`);
}
await inBatches(lateDays.map((d) => d.id), async (batch) => {
  // Restore the lates the earlier script cleared.
  for (const id of batch) {
    const d = lateDays.find((x) => x.id === id);
    const { error } = await db.from("attendance_days").update({ minutes_late: d.minutes_late, is_late: d.is_late }).eq("id", id);
    if (error) console.error(`  day ${id}: ${error.message}`);
  }
});
console.log(`Done: ${changes.length} people updated, ${lateDays.length} late days restored.`);
