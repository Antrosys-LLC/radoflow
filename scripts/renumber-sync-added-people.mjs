#!/usr/bin/env node
/**
 * Moves the people the workers-list sync added under RD-4001…RD-4027 onto
 * enrolment numbers 600 upward (employee code and terminal number both). The
 * terminals drop the old number and receive the new one through the usual
 * fan-out on `profiles.device_pin`.
 *
 *   node scripts/renumber-sync-added-people.mjs          # dry run
 *   node scripts/renumber-sync-added-people.mjs --apply
 */
import { readFileSync } from "node:fs";
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

const START = 600;
const { data: all, error } = await db.from("profiles").select("id, full_name, employee_code, device_pin").limit(5000);
if (error) throw new Error(error.message);

const mine = all
  .filter((p) => /^RD-40(0[1-9]|1\d|2[0-7])$/.test(p.employee_code))
  .sort((a, b) => a.employee_code.localeCompare(b.employee_code));
const taken = new Set(all.flatMap((p) => [p.employee_code, p.device_pin]).filter(Boolean));
const plan = mine.map((p, i) => ({ ...p, to: String(START + i) }));
const clash = plan.filter((p) => taken.has(p.to));
if (clash.length) throw new Error(`Already in use: ${clash.map((p) => p.to).join(", ")}`);

for (const p of plan) console.log(`${p.employee_code} ${p.full_name}: ${p.device_pin} -> ${p.to}`);
if (!process.argv.includes("--apply")) console.log("\nDry run. Re-run with --apply to write.");
else {
  let done = 0;
  for (const p of plan) {
    const { error: e } = await db.from("profiles").update({ employee_code: p.to, device_pin: p.to }).eq("id", p.id);
    if (e) console.error(`${p.full_name}: ${e.message}`);
    else done++;
  }
  console.log(`\nRenumbered ${done} of ${plan.length}.`);
}
