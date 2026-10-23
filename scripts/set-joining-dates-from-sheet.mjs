#!/usr/bin/env node
/**
 * Sets `profiles.joined_on` from the dates in the workers list's last column.
 *
 * Only people whose row carries a date are touched; nobody else's joining date
 * is written or cleared. A row is matched to a person by name, and by roll
 * (their enrolment number) when two people share a name; a row that matches no
 * one, or more than one, is reported and left alone.
 *
 *   node scripts/set-joining-dates-from-sheet.mjs "WORKERS LIST 01.xlsx"          # dry run
 *   node scripts/set-joining-dates-from-sheet.mjs "WORKERS LIST 01.xlsx" --apply
 */
import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

import { readWorkers } from "./lib/read-workers-xlsx.mjs";

for (const line of readFileSync(new URL("../.env.local", import.meta.url), "utf8").split(/\r?\n/)) {
  const at = line.indexOf("=");
  if (at < 1 || line.trim().startsWith("#")) continue;
  const key = line.slice(0, at).trim();
  if (!process.env[key]) process.env[key] = line.slice(at + 1).trim().replace(/^["']|["']$/g, "");
}

const path = process.argv.slice(2).find((a) => !a.startsWith("--"));
if (!path) {
  console.error('Usage: node scripts/set-joining-dates-from-sheet.mjs "WORKERS LIST.xlsx" [--apply]');
  process.exit(1);
}
const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

const norm = (s) => String(s ?? "").toUpperCase().replace(/[^A-Z]/g, "");
const profiles = [];
for (let from = 0; ; from += 1000) {
  const { data, error } = await db
    .from("profiles")
    .select("id, full_name, employee_code, device_pin, joined_on")
    .range(from, from + 999);
  if (error) throw new Error(error.message);
  profiles.push(...data);
  if (data.length < 1000) break;
}

const { people } = readWorkers(path);
const todo = [];
const problems = [];

for (const p of people) {
  if (!p.joinedText) continue;
  const m = /^(\d{1,2})\.(\d{1,2})\.(\d{4})$/.exec(p.joinedText);
  if (!m) {
    problems.push(`${p.name}: "${p.joinedText}" is not a dd.mm.yyyy date`);
    continue;
  }
  const date = `${m[3]}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}`;
  let hits = profiles.filter((x) => norm(x.full_name) === norm(p.name));
  if (hits.length > 1 && /^\d+$/.test(p.roll)) {
    // The person who holds the roll, or — when the sheet gives one roll to two
    // people — the one the list sync added under a fresh RD- code.
    const byRoll = hits.filter((x) => x.device_pin === String(Number(p.roll)));
    hits = byRoll.length === 1 && byRoll[0].full_name === p.name ? byRoll : hits.filter((x) => /^RD-4\d{3}$/.test(x.employee_code));
  }
  if (hits.length !== 1) {
    problems.push(`${p.name} (roll ${p.roll || "none"}): ${hits.length} matching people, skipped`);
    continue;
  }
  todo.push({ id: hits[0].id, name: p.name, date, was: hits[0].joined_on });
}

console.log(`${todo.length} joining dates to set, ${problems.length} skipped.`);
for (const t of todo) console.log(`  ${t.name}: ${t.was ?? "none"} -> ${t.date}`);
for (const x of problems) console.log(`  ! ${x}`);

if (!process.argv.includes("--apply")) console.log("\nDry run. Re-run with --apply to write.");
else {
  let done = 0;
  for (const t of todo) {
    const { error } = await db.from("profiles").update({ joined_on: t.date }).eq("id", t.id);
    if (error) console.error(`  ${t.name}: ${error.message}`);
    else done++;
  }
  console.log(`\nSet ${done} of ${todo.length}.`);
}
