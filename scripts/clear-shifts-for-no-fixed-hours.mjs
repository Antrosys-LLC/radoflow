#!/usr/bin/env node
/**
 * Takes people with no fixed hours (flexible_hours) or a fixed salary
 * (requires_attendance = false) off the shift roster: they have no shift to
 * keep, and the roster counts anyone on one.
 *
 *   node scripts/clear-shifts-for-no-fixed-hours.mjs          # dry run
 *   node scripts/clear-shifts-for-no-fixed-hours.mjs --apply
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

const { data, error } = await db
  .from("profiles")
  .select("id, full_name, employee_code")
  .not("shift_id", "is", null)
  .or("flexible_hours.eq.true,requires_attendance.eq.false");
if (error) throw new Error(error.message);

console.log(`${data.length} people on a shift with no fixed hours or a fixed salary.`);
if (!process.argv.includes("--apply")) {
  console.log("Dry run. Re-run with --apply to take them off.");
} else {
  const ids = data.map((p) => p.id);
  for (let i = 0; i < ids.length; i += 100) {
    const { error: e } = await db.from("profiles").update({ shift_id: null }).in("id", ids.slice(i, i + 100));
    if (e) throw new Error(e.message);
  }
  console.log(`Cleared the shift on ${ids.length}.`);
}
