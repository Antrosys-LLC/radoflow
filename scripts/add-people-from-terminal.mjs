#!/usr/bin/env node
/**
 * Adds to RadoFlow the people a terminal holds and RadoFlow does not.
 *
 * Somebody enrolled directly on a terminal is a PIN and a name on that box and
 * nothing else. RadoFlow cannot count their meals or their hours: every scan
 * comes back as an unknown person. This reads the terminal's own copy of its
 * roster (`device_inventory`, filled by the roster query) and makes each of
 * them a profile whose enrolment number is the PIN already on the box, so the
 * next scan resolves.
 *
 * Thousands-range numbers are left alone. The factory renumbered those to
 * their last three digits (4021 became 21), so a PIN in the thousands is an
 * old number for somebody who already exists — 10000 excepted, which is the
 * administrator. Pass --include-thousands to override.
 *
 * New profiles carry no pay: salary 0, no department, no CNIC. They are
 * enrolment records until the office fills in the rest.
 *
 *   node scripts/add-people-from-terminal.mjs kitchen             # dry run
 *   node scripts/add-people-from-terminal.mjs kitchen --apply
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
const THOUSANDS = process.argv.includes("--include-thousands");
const wanted = process.argv.slice(2).find((a) => !a.startsWith("--"));
if (!wanted) {
  console.error("Name the terminal, e.g. `kitchen`.");
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

const field = (body, name) => new RegExp(`${name}=([^\t]*)`).exec(body)?.[1]?.trim() ?? "";

const { data: devices } = await db.from("devices").select("id, name, site_id");
const device = (devices ?? []).find((d) => d.name.toLowerCase().includes(wanted.toLowerCase()));
if (!device) throw new Error(`No terminal matches "${wanted}".`);

const held = await all(() =>
  db.from("device_inventory").select("pin, command_body").eq("device_id", device.id).eq("record_type", "user"),
);
const known = new Set((await all(() => db.from("profiles").select("device_pin"))).map((p) => p.device_pin));

const inThousands = (pin) => Number(pin) >= 1000 && pin !== "10000";
const missing = held.filter((r) => !known.has(r.pin));
const todo = missing.filter((r) => THOUSANDS || !inThousands(r.pin));

console.log(`${device.name}: ${held.length} people on the box, ${missing.length} not in RadoFlow.`);
const skipped = missing.filter((r) => !todo.includes(r));
if (skipped.length) console.log(`Skipped (thousands range): ${skipped.map((r) => r.pin).join(", ")}`);

let created = 0;
for (const row of todo) {
  const name = field(row.command_body, "Name").toUpperCase();
  if (!name) {
    console.log(`  ${row.pin}: no name on the terminal, skipped`);
    continue;
  }
  console.log(`  ${APPLY ? "adding" : "would add"}  ${row.pin.padStart(5)}  ${name}`);
  if (!APPLY) continue;

  const { data: auth, error: authError } = await db.auth.admin.createUser({
    email: `${row.pin}@staff.invalid`,
    email_confirm: true,
    user_metadata: { full_name: name },
  });
  if (authError || !auth?.user) {
    console.log(`    ✗ login: ${authError?.message ?? "no auth row"}`);
    continue;
  }

  const { error } = await db.from("profiles").insert({
    id: auth.user.id,
    employee_code: row.pin,
    full_name: name,
    device_pin: row.pin,
    site_id: device.site_id,
    pay_class: "monthly",
    monthly_salary: 0,
  });
  if (error) {
    // Roll the login back rather than strand an auth row with no employee.
    await db.auth.admin.deleteUser(auth.user.id);
    console.log(`    ✗ profile: ${error.message}`);
    continue;
  }
  created++;
}

console.log(APPLY ? `\nCreated ${created} of ${todo.length}.` : "\nDry run. Pass --apply to create them.");
