/**
 * Writes attendance taken from the handwritten gate registers into RadoFlow.
 *
 *   node scripts/apply-manual-sheet-attendance.mjs <rows.json> [limit]   # dry
 *   node scripts/apply-manual-sheet-attendance.mjs <rows.json> [limit] --write
 *
 * rows.json is the reviewed DRY-RUN workbook as [date, pin, name, dept, in, out, hours, ...]
 * with times as HH:MM or "HH:MM (+1d)" in Pakistan time.
 *
 * Each row becomes one attendance day, marked `is_manual` and `locked` (so a terminal sync never
 * recomputes it away) with note "Manual sheet". A day that already exists is never touched.
 */
import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

process.loadEnvFile(new URL("../.env.local", import.meta.url));
const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

const [file, limitArg] = process.argv.slice(2).filter((a) => a !== "--write");
const write = process.argv.includes("--write");
const rows = JSON.parse(readFileSync(file, "utf8")).filter((r) => r[7] === "present" || r[7] === "present ");
const todo = limitArg ? rows.slice(0, Number(limitArg)) : rows;

const instant = (date, hhmm) => {
  const next = hhmm.includes("(+1d)");
  const [h, m] = hhmm.split(" ")[0].split(":").map(Number);
  const base = Date.parse(`${date}T00:00:00+05:00`) + (next ? 86_400_000 : 0);
  return new Date(base + (h * 60 + m) * 60_000).toISOString();
};

const pins = [...new Set(todo.map((r) => r[1]))];
const { data: profs } = await supabase
  .from("profiles")
  .select("id, device_pin, site_id, shift_id, flexible_hours")
  .in("device_pin", pins);
const byPin = new Map(profs.map((p) => [p.device_pin, p]));
const { data: shifts } = await supabase.from("shifts").select("id, starts_at, grace_minutes");
const shiftById = new Map(shifts.map((s) => [s.id, s]));
const { data: calendar } = await supabase.from("calendar_days").select("site_id, day, day_type");
const { data: week } = await supabase.from("work_week").select("site_id, weekday, is_working");

const dayType = (siteId, date) => {
  const o = calendar.find((c) => c.site_id === siteId && c.day === date);
  if (o?.day_type) return o.day_type;
  const wd = new Date(`${date}T00:00:00Z`).getUTCDay();
  const w = week.find((x) => x.site_id === siteId && x.weekday === wd);
  return w && w.is_working === false ? "off" : "workday";
};

const lateMinutes = (profile, firstIn, date) => {
  const shift = profile.shift_id && !profile.flexible_hours ? shiftById.get(profile.shift_id) : null;
  if (!shift) return 0;
  const clock = String(shift.starts_at).slice(0, 8);
  const base = Date.parse(`${date}T00:00:00Z`);
  let best = null;
  for (const off of [-1, 0, 1]) {
    const d = new Date(base + off * 86_400_000).toISOString().slice(0, 10);
    const cand = Date.parse(`${d}T${clock}+05:00`);
    if (best === null || Math.abs(cand - Date.parse(firstIn)) < Math.abs(best - Date.parse(firstIn))) best = cand;
  }
  const late = Date.parse(firstIn) - (best + (shift.grace_minutes ?? 0) * 60_000);
  return late <= 0 ? 0 : Math.floor(late / 60_000);
};

const payload = [];
const skipped = [];
for (const r of todo) {
  const p = byPin.get(r[1]);
  if (!p) { skipped.push([r[0], r[1], "no profile"]); continue; }
  const first_in = instant(r[0], r[4]);
  const last_out = instant(r[0], r[5]);
  const hours = Math.round(((Date.parse(last_out) - Date.parse(first_in)) / 3_600_000) * 100) / 100;
  if (hours <= 0) { skipped.push([r[0], r[1], "non-positive hours"]); continue; }
  const minutes_late = lateMinutes(p, first_in, r[0]);
  payload.push({
    profile_id: p.id,
    site_id: p.site_id,
    work_date: r[0],
    first_in,
    last_out,
    regular_hours: hours,
    ot_hours: 0,
    weekend_hours: 0,
    holiday_hours: 0,
    day_type: dayType(p.site_id, r[0]),
    status: "present",
    is_manual: true,
    locked: true,
    note: "Manual sheet",
    shift_id: p.shift_id,
    minutes_late,
    is_late: minutes_late > 0,
    break_minutes: 0,
    hours_are_final: true,
  });
}

console.log(`${payload.length} rows ready, ${skipped.length} skipped`, skipped.slice(0, 5));
console.log(payload.slice(0, 3));
if (!write) process.exit(0);

let written = 0;
for (let i = 0; i < payload.length; i += 200) {
  const chunk = payload.slice(i, i + 200);
  // ignoreDuplicates: a day RadoFlow already holds (punched, corrected or locked) is left alone.
  const { data, error } = await supabase
    .from("attendance_days")
    .upsert(chunk, { onConflict: "profile_id,work_date", ignoreDuplicates: true })
    .select("id");
  if (error) throw new Error(error.message);
  written += data.length;
}
console.log(`written ${written} of ${payload.length}`);
