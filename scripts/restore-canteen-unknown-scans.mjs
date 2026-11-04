#!/usr/bin/env node
/**
 * Turns the canteen's "unknown person" scans into meals.
 *
 * A scan is unknown when nobody held the terminal's number at the time. Two
 * causes are repaired here: a number that used to belong to somebody who has
 * since moved (605 was Imtiaz, now 88; 608 was Nasir, now 203), and a person the
 * terminal holds that RadoFlow had never heard of (494, 674, 679, 680, 681),
 * who are added as profiles named as the terminal names them.
 *
 * Each repaired scan is written the way the live path writes it: a meal claim
 * (the database refuses a second one for the same serving day, which is how a
 * second scan stays a duplicate rather than a second meal), then the scan log
 * row updated to say who and what happened.
 *
 *   node scripts/restore-canteen-unknown-scans.mjs 2026-11-01          # dry run
 *   node scripts/restore-canteen-unknown-scans.mjs 2026-11-01 --apply
 */
import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

for (const line of readFileSync(new URL("../.env.local", import.meta.url), "utf8").split(/\r?\n/)) {
  const at = line.indexOf("=");
  if (at < 1 || line.trim().startsWith("#")) continue;
  const key = line.slice(0, at).trim();
  if (!process.env[key]) process.env[key] = line.slice(at + 1).trim().replace(/^["']|["']$/g, "");
}
const APPLY = process.argv.includes("--apply");
const since = process.argv.slice(2).find((a) => /^\d{4}-\d{2}-\d{2}$/.test(a)) ?? "2026-11-01";
const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

// Old numbers that now belong to somebody else, by the person's current number.
const MOVED = { "605": "88", "608": "203" };
// People the terminals hold with no profile, named as the terminal names them.
const NEW_PEOPLE = { "494": "AQIB", "674": "CARD 674", "679": "CARD 679", "680": "CARD 680", "681": "CARD 681" };

const { data: scans, error } = await db
  .from("meal_scan_log")
  .select("*")
  .eq("outcome", "unknown_person")
  .gte("scanned_at", `${since}T00:00:00+05:00`)
  .order("scanned_at");
if (error) throw new Error(error.message);

const profiles = [];
for (let from = 0; ; from += 1000) {
  const { data } = await db.from("profiles").select("id, full_name, device_pin, site_id").range(from, from + 999);
  profiles.push(...data);
  if (data.length < 1000) break;
}
const byPin = new Map(profiles.filter((p) => p.device_pin).map((p) => [p.device_pin, p]));
const { data: devices } = await db.from("devices").select("id, name, site_id");
const site = devices[0].site_id;

const pkDate = (iso) => new Date(Date.parse(iso) + 5 * 3600e3).toISOString().slice(0, 10);

console.log(`${scans.length} unknown scans since ${since}`);
const needed = [...new Set(scans.map((s) => s.device_user_id))];
for (const pin of needed) {
  const target = MOVED[pin] ? byPin.get(MOVED[pin]) : byPin.get(pin);
  if (target) console.log(`  ${pin} -> ${target.full_name} (${target.device_pin})`);
  else if (NEW_PEOPLE[pin]) console.log(`  ${pin} -> new person ${NEW_PEOPLE[pin]}`);
  else console.log(`  ${pin} -> nobody known, left alone`);
}
if (!APPLY) {
  console.log("\nDry run. Re-run with --apply.");
  process.exit(0);
}

// People first.
for (const pin of needed) {
  if (MOVED[pin] || byPin.has(pin) || !NEW_PEOPLE[pin]) continue;
  const name = NEW_PEOPLE[pin];
  const { data: auth, error: authError } = await db.auth.admin.createUser({
    email: `${pin}@staff.invalid`,
    email_confirm: true,
    user_metadata: { full_name: name },
  });
  if (authError || !auth?.user) {
    console.log(`  ✗ login ${pin}: ${authError?.message}`);
    continue;
  }
  const { error: insertError } = await db.from("profiles").insert({
    id: auth.user.id,
    employee_code: pin,
    full_name: name,
    device_pin: pin,
    site_id: site,
    pay_class: "monthly",
    monthly_salary: 0,
  });
  if (insertError) {
    await db.auth.admin.deleteUser(auth.user.id);
    console.log(`  ✗ profile ${pin}: ${insertError.message}`);
    continue;
  }
  byPin.set(pin, { id: auth.user.id, full_name: name, device_pin: pin });
  console.log(`  added ${pin} ${name}`);
}

// Then the meals, oldest first.
let served = 0;
let duplicate = 0;
for (const scan of scans) {
  const person = MOVED[scan.device_user_id] ? byPin.get(MOVED[scan.device_user_id]) : byPin.get(scan.device_user_id);
  if (!person) continue;
  const servedOn = pkDate(scan.scanned_at);
  const { error: claimError } = await db.from("meal_claims").insert({
    profile_id: person.id,
    site_id: scan.site_id ?? site,
    meal_window_id: null,
    served_on: servedOn,
    claimed_at: scan.scanned_at,
    device_id: scan.device_id,
    device_user_id: scan.device_user_id,
    source: "device",
  });
  let outcome = "served";
  if (claimError) {
    if (claimError.code === "23505") outcome = "duplicate";
    else {
      console.log(`  ✗ claim ${scan.id}: ${claimError.message}`);
      continue;
    }
  }
  const { error: logError } = await db
    .from("meal_scan_log")
    .update({ profile_id: person.id, outcome, served_on: servedOn })
    .eq("id", scan.id);
  if (logError) console.log(`  ✗ log ${scan.id}: ${logError.message}`);
  else if (outcome === "served") served++;
  else duplicate++;
}
console.log(`\nMeals restored: ${served}; second scans kept as duplicates: ${duplicate}`);

// The old numbers are ghosts of people who now carry another; clear them from the terminals.
for (const pin of Object.keys(MOVED)) {
  for (const device of devices) {
    await db.from("device_commands").insert({ device_id: device.id, kind: "user.delete", body: `DATA DELETE USERINFO PIN=${pin}` });
  }
}
console.log(`Queued deletion of ${Object.keys(MOVED).join(", ")} on the terminals.`);
