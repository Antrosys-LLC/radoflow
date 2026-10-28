#!/usr/bin/env node
/**
 * Makes the unnamed card users on the terminals (PINs 601-670) into canteen
 * cards: people in the Canteen Cards department who exist only to be counted at
 * the kitchen. Their kitchen scans become meal claims; their scans at the gates
 * are dropped by `ingestPunches`, so they never become attendance. They carry no
 * pay (payroll_exempt, no attendance, salary 0).
 *
 *   node scripts/add-canteen-cards.mjs            # dry run
 *   node scripts/add-canteen-cards.mjs --apply
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
const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

const { data: devices } = await db.from("devices").select("id, site_id");
const siteId = devices[0].site_id;

const held = [];
for (let o = 0; ; o += 1000) {
  const { data } = await db.from("device_inventory").select("pin").eq("record_type", "user").range(o, o + 999);
  held.push(...data);
  if (data.length < 1000) break;
}
const pins = [...new Set(held.map((r) => r.pin))].filter((p) => /^6\d\d$/.test(p) && Number(p) >= 601 && Number(p) <= 670).sort();

const known = new Set();
for (let o = 0; ; o += 1000) {
  const { data } = await db.from("profiles").select("device_pin").range(o, o + 999);
  known.add(...[]);
  for (const r of data) if (r.device_pin) known.add(r.device_pin);
  if (data.length < 1000) break;
}
const todo = pins.filter((p) => !known.has(p));
console.log(`${pins.length} card users on the terminals, ${todo.length} not in RadoFlow yet.`);
if (!APPLY) {
  console.log(`Would create: ${todo.join(", ")}\nDry run. Pass --apply.`);
  process.exit(0);
}

let { data: dept } = await db.from("departments").select("id").eq("site_id", siteId).eq("code", "CANTEEN").maybeSingle();
if (!dept) {
  const ins = await db
    .from("departments")
    .insert({ site_id: siteId, code: "CANTEEN", name: "Canteen Cards", default_worker_type: "employee" })
    .select("id")
    .single();
  if (ins.error) throw new Error(ins.error.message);
  dept = ins.data;
  console.log("Created the Canteen Cards department.");
}

let created = 0;
for (const pin of todo) {
  const name = `CARD ${pin}`;
  const { data: auth, error: authError } = await db.auth.admin.createUser({
    email: `${pin}@staff.invalid`,
    email_confirm: true,
    user_metadata: { full_name: name },
  });
  if (authError || !auth?.user) {
    console.log(`  ${pin}: login failed — ${authError?.message}`);
    continue;
  }
  const { error } = await db.from("profiles").insert({
    id: auth.user.id,
    employee_code: `CARD-${pin}`,
    full_name: name,
    device_pin: pin,
    site_id: siteId,
    department_id: dept.id,
    pay_class: "monthly",
    monthly_salary: 0,
    requires_attendance: false,
    flexible_hours: true,
    payroll_exempt: true,
  });
  if (error) {
    await db.auth.admin.deleteUser(auth.user.id);
    console.log(`  ${pin}: profile failed — ${error.message}`);
    continue;
  }
  created++;
}
console.log(`Created ${created} of ${todo.length}.`);
