#!/usr/bin/env node
/**
 * Accounts, Admin and Creation work the hours on the workers list but keep no
 * clock: nobody is told when to check in or out, and nobody is ever late.
 *
 * For everyone in those departments who is NOT on a fixed salary (NO TIME LIMIT,
 * No Attd. — those are `apply-duty-rules.mjs`'s):
 *   - flexible_hours on, shift cleared: paid for completing the duty hours
 *   - duty_hours 12 where the sheet says 12 H, otherwise 8
 *   - overtime_eligible only where the sheet says overtime: "+Time" or "+ Sunday".
 *     A bare "Duty 8 H" / "Duty 12 H" earns none, so hours past duty (a missed
 *     check-out) are never paid, and a Sunday earns nothing.
 *   - lates already recorded are cleared (flexible people are never late)
 * and the one Accounts "ASIF" the sheet marks No Attd. is made a fixed salary.
 *
 *   node scripts/apply-no-clock-departments.mjs "WORKERS LIST 01.xlsx"            # dry run
 *   node scripts/apply-no-clock-departments.mjs "WORKERS LIST 01.xlsx" --apply
 *   node scripts/apply-no-clock-departments.mjs --revert <backup-file>
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
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

// The sheet's heading → the department's name in RadoFlow.
const DEPARTMENTS = { Administraion: "Admin", Account: "Accounts", Creation: "Creation" };

const revertAt = args.indexOf("--revert");
if (revertAt >= 0) {
  const backup = JSON.parse(readFileSync(args[revertAt + 1], "utf8"));
  for (const { id, ...fields } of backup.profiles) {
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
  console.error('Usage: apply-no-clock-departments.mjs "WORKERS LIST.xlsx" [--apply]');
  process.exit(1);
}

const { people: sheet } = readWorkers(path);

const profiles = [];
for (let o = 0; ; o += 1000) {
  const { data, error } = await db
    .from("profiles")
    .select("id, full_name, device_pin, requires_attendance, flexible_hours, duty_hours, overtime_eligible, shift_id, worker_type, departments!inner(name)")
    .eq("status", "active")
    .in("departments.name", Object.values(DEPARTMENTS))
    .range(o, o + 999);
  if (error) throw new Error(error.message);
  profiles.push(...data);
  if (data.length < 1000) break;
}

const norm = (s) => s.toLowerCase().replace(/[^a-z]/g, "");
const changes = [];
const unmatched = [];
const used = new Set();

for (const s of sheet) {
  const dept = DEPARTMENTS[s.department];
  if (!dept || s.workerType === "contractor" || !s.rule) continue;

  const inDept = profiles.filter((p) => p.departments.name === dept && !used.has(p.id));
  let found = inDept.filter((p) => s.roll && String(p.device_pin) === String(Number(s.roll)) && norm(p.full_name) === norm(s.name));
  if (found.length !== 1) found = inDept.filter((p) => norm(p.full_name) === norm(s.name));
  if (found.length !== 1) {
    unmatched.push(s);
    continue;
  }
  const p = found[0];
  used.add(p.id);

  const rule = s.rule.toLowerCase();
  const fixed = !s.requiresAttendance;
  const want = fixed
    ? { requires_attendance: false, flexible_hours: true, shift_id: null }
    : {
        requires_attendance: true,
        flexible_hours: true,
        shift_id: null,
        duty_hours: /12\s*h/.test(rule) ? 12 : 8,
        overtime_eligible: /time|sunday/.test(rule),
      };

  const diff = {};
  for (const [k, v] of Object.entries(want)) if (v !== p[k] && !(k === "duty_hours" && Number(v) === Number(p[k]))) diff[k] = v;
  changes.push({ p, s, dept, diff, fixed });
}

// Their recorded lates, to be cleared.
const ids = changes.map((c) => c.p.id);
const lateDays = [];
for (let i = 0; i < ids.length; i += 100) {
  for (let page = 0; ; page++) {
    const { data, error } = await db
      .from("attendance_days")
      .select("id, profile_id, minutes_late, is_late")
      .in("profile_id", ids.slice(i, i + 100))
      .or("is_late.eq.true,minutes_late.gt.0")
      .order("id")
      .range(page * 1000, page * 1000 + 999);
    if (error) throw new Error(error.message);
    lateDays.push(...data);
    if (data.length < 1000) break;
  }
}

const touched = changes.filter((c) => Object.keys(c.diff).length > 0);
console.log(`${used.size} matched in Admin, Accounts and Creation; ${touched.length} change; ${unmatched.length} not matched.`);
for (const c of touched) {
  console.log(`  ${c.dept.padEnd(9)} ${c.p.full_name.padEnd(20)} [${c.s.rule.slice(0, 22).padEnd(22)}] ${Object.entries(c.diff).map(([k, v]) => `${k}: ${c.p[k]} -> ${v}`).join(", ")}`);
}
for (const s of unmatched) console.log(`  NOT MATCHED: ${s.department} ${s.name} ${s.rule}`);
console.log(`${lateDays.length} recorded late days (${lateDays.reduce((t, d) => t + (d.minutes_late ?? 0), 0)} minutes) would be cleared.`);

if (!APPLY) {
  console.log("\nDry run. Add --apply to commit.");
  process.exit(0);
}

if (!existsSync(BACKUPS)) mkdirSync(BACKUPS, { recursive: true });
const file = new URL(`no-clock-${new Date().toISOString().replace(/[:.]/g, "-")}.json`, BACKUPS);
writeFileSync(
  file,
  JSON.stringify(
    {
      profiles: touched.map(({ p }) => ({
        id: p.id,
        requires_attendance: p.requires_attendance,
        flexible_hours: p.flexible_hours,
        duty_hours: p.duty_hours,
        overtime_eligible: p.overtime_eligible,
        shift_id: p.shift_id,
      })),
      days: lateDays.map((d) => ({ id: d.id, minutes_late: d.minutes_late, is_late: d.is_late })),
    },
    null,
    2,
  ),
);
console.log(`Backed up to ${file.pathname}`);

for (const { p, diff } of touched) {
  const { error } = await db.from("profiles").update(diff).eq("id", p.id);
  if (error) console.error(`  ${p.full_name}: ${error.message}`);
}
for (let i = 0; i < lateDays.length; i += 100) {
  const { error } = await db
    .from("attendance_days")
    .update({ minutes_late: 0, is_late: false })
    .in("id", lateDays.slice(i, i + 100).map((d) => d.id));
  if (error) throw new Error(error.message);
}
console.log(`Done: ${touched.length} people updated, ${lateDays.length} late days cleared.`);
