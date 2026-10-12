#!/usr/bin/env node
/**
 * Moves people into the departments listed on the company roll JSON
 * (sheet "ROLL DATA": Company No., Department, Name),
 * exported to JSON as [{pin, dept, name}] since the project carries no Excel reader.
 *
 * The roll's Company No. is the person's enrolment number, `profiles.device_pin`.
 * Names are compared as a sanity check and any disagreement is reported rather
 * than written, so a stale number never moves the wrong person.
 *
 *   node scripts/set-departments-from-roll.mjs <roll.json>            # dry run
 *   node scripts/set-departments-from-roll.mjs <roll.json> --apply
 */
import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";

for (const line of readFileSync(new URL("../.env.local", import.meta.url), "utf8").split(/\r?\n/)) {
  const at = line.indexOf("=");
  if (at < 1 || line.trim().startsWith("#")) continue;
  const key = line.slice(0, at).trim();
  if (!process.env[key]) process.env[key] = line.slice(at + 1).trim().replace(/^["']|["']$/g, "");
}

const APPLY = process.argv.includes("--apply");
const path = process.argv.slice(2).find((a) => !a.startsWith("--"));
if (!path) {
  console.error("Give the path to the roll JSON.");
  process.exit(1);
}

const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

async function all(query) {
  const rows = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await query().range(from, from + 999);
    if (error) throw new Error(error.message);
    rows.push(...(data ?? []));
    if ((data ?? []).length < 1000) break;
  }
  return rows;
}

/** Sheet spellings that mean a department already in the database. */
const ALIASES = { "JIGER DRAWING": "JIGGER DRAWING", "WORK SHOP": "WORKSHOP", ADMINISTRATION: "ADMIN", ACCOUNT: "ACCOUNTS" };
const key = (s) => String(s).replace(/^\d+\s*-\s*/, "").trim().toUpperCase().replace(/\s+/g, " ");
const norm = (s) => ALIASES[key(s)] ?? key(s);
const words = (s) => String(s ?? "").toUpperCase().replace(/[^A-Z ]/g, "").split(/\s+/).filter(Boolean);
function lev(a, b) {
  const d = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)]);
  for (let j = 1; j <= b.length; j++) d[0][j] = j;
  for (let i = 1; i <= a.length; i++)
    for (let j = 1; j <= b.length; j++)
      d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
  return d[a.length][b.length];
}
/** Spelling variants (SAJJID/SAJID, UMAR/UMER) pass; a different person does not. */
const sameName = (a, b) => {
  const x = words(a), y = words(b);
  return x.some((u) => y.some((v) => 1 - lev(u, v) / Math.max(u.length, v.length) >= 0.6 || (u.length > 2 && v.length > 2 && u[0] === v[0] && u[u.length - 1] === v[v.length - 1])));
};

const roll = JSON.parse(readFileSync(path, "utf8"));

const departments = await all(() => db.from("departments").select("id, name"));
const deptByName = new Map(departments.map((d) => [norm(d.name), d]));
const profiles = await all(() => db.from("profiles").select("id, device_pin, full_name, department_id"));
const byPin = new Map(profiles.map((p) => [p.device_pin, p]));

const unknownDept = new Set();
const missing = [];
const nameClash = [];
const same = [];
const moves = [];
for (const r of roll) {
  const dept = deptByName.get(norm(r.dept));
  if (!dept) { unknownDept.add(r.dept); continue; }
  const p = byPin.get(r.pin);
  if (!p) { missing.push(r); continue; }
  if (!sameName(p.full_name, r.name)) { nameClash.push({ ...r, db: p.full_name }); continue; }
  if (p.department_id === dept.id) { same.push(r); continue; }
  moves.push({ id: p.id, pin: r.pin, name: p.full_name, to: dept.name, toId: dept.id, from: departments.find((d) => d.id === p.department_id)?.name ?? "none" });
}

console.log(`Roll: ${roll.length} people. Already right: ${same.length}. To move: ${moves.length}.`);
if (unknownDept.size) console.log(`Unknown departments: ${[...unknownDept].join(", ")}`);
if (missing.length) console.log(`Not in RadoFlow (${missing.length}): ${missing.map((r) => `${r.pin} ${r.name}`).join("; ")}`);
if (nameClash.length) console.log(`Name differs, left alone (${nameClash.length}):\n` + nameClash.map((r) => `  ${r.pin}: roll "${r.name}" vs RadoFlow "${r.db}"`).join("\n"));
for (const m of moves) console.log(`  ${m.pin} ${m.name}: ${m.from} -> ${m.to}`);

if (APPLY) {
  let done = 0;
  for (const m of moves) {
    const { error } = await db.from("profiles").update({ department_id: m.toId }).eq("id", m.id);
    if (error) console.error(`  ${m.pin}: ${error.message}`); else done++;
  }
  console.log(`Updated ${done} of ${moves.length}.`);
} else {
  console.log("Dry run. Re-run with --apply to write.");
}
