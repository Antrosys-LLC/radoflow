#!/usr/bin/env node
/**
 * Fills a date range with plausible attendance, so the app has something to
 * show before the terminals have produced a full month of punches.
 *
 * This is demo data, not a substitute for the gate: every row it writes is
 * marked `is_manual` and carries the note below, which is also how `--remove`
 * finds them again. It never touches a day the terminals already produced —
 * an existing row for a person and date is left exactly as it is, so real
 * hours can never be overwritten by an invented figure.
 *
 * Written from the site's shift, not from thin air: check-in lands around the
 * shift start, the day runs the person's own duty hours, and a small,
 * deterministic share of days come back late, absent or on leave so the
 * attendance and payroll screens have all their cases represented.
 *
 * Usage:
 *   node scripts/seed-demo-attendance.mjs 2026-09-01 2026-09-03
 *   node scripts/seed-demo-attendance.mjs 2026-09-01 2026-09-03 --dry-run
 *   node scripts/seed-demo-attendance.mjs 2026-09-01 2026-09-03 --remove
 */

import { existsSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

const envFile = new URL("../.env.local", import.meta.url);
if (existsSync(envFile)) process.loadEnvFile(envFile);

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

const NOTE = "Demo attendance (seed-demo-attendance.mjs)";
const DEFAULT_SHIFT_START = "08:00:00";

const [from, to] = process.argv.slice(2).filter((a) => !a.startsWith("--"));
const dryRun = process.argv.includes("--dry-run");
const remove = process.argv.includes("--remove");

if (!url || !serviceKey) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY.");
  process.exit(1);
}
if (!isDate(from) || !isDate(to) || from > to) {
  console.error("Usage: node scripts/seed-demo-attendance.mjs <from YYYY-MM-DD> <to YYYY-MM-DD>");
  process.exit(1);
}

const db = createClient(url, serviceKey, { auth: { persistSession: false } });

function isDate(value) {
  return typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value);
}

/** Every date from `from` to `to`, inclusive. */
function datesBetween(start, end) {
  const days = [];
  for (let d = new Date(`${start}T00:00:00Z`); ; d.setUTCDate(d.getUTCDate() + 1)) {
    const iso = d.toISOString().slice(0, 10);
    if (iso > end) break;
    days.push(iso);
  }
  return days;
}

/**
 * A stable number in [0, 1) for a person on a date.
 *
 * Deterministic rather than random so re-running produces the same factory:
 * the same people are late on the same days, and a screenshot taken today
 * still matches the data tomorrow.
 */
function spread(profileId, workDate) {
  let hash = 2166136261;
  for (const char of `${profileId}:${workDate}`) {
    hash ^= char.charCodeAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return ((hash >>> 0) % 1000) / 1000;
}

/** "2026-09-01" + "08:00:00" + minutes, as the UTC instant Pakistan means. */
function pakistanInstant(workDate, clock, addMinutes = 0) {
  const [hour, minute] = clock.split(":").map(Number);
  const base = Date.UTC(
    Number(workDate.slice(0, 4)),
    Number(workDate.slice(5, 7)) - 1,
    Number(workDate.slice(8, 10)),
    hour,
    minute,
  );
  // Asia/Karachi is UTC+5 all year — no DST to straddle.
  return new Date(base - 5 * 60 * 60 * 1000 + addMinutes * 60 * 1000).toISOString();
}

/** Sunday is nobody's working day unless the calendar says otherwise. */
function isSunday(workDate) {
  return new Date(`${workDate}T00:00:00Z`).getUTCDay() === 0;
}

/*
 * Every row carries every column, including the ones a non-working day has no
 * use for. A batch insert through PostgREST takes its column list from the
 * first row and sends NULL wherever a later row omits a key — which a
 * `not null default 0` column rejects outright, rather than falling back to
 * its default.
 */
const IDLE_DAY = {
  regular_hours: 0,
  ot_hours: 0,
  is_late: false,
  minutes_late: 0,
  first_in: null,
  last_out: null,
};

function dayFor(person, workDate, shiftStart, graceMinutes) {
  const roll = spread(person.id, workDate);

  if (isSunday(workDate)) {
    return { status: "off", day_type: "off", ...IDLE_DAY };
  }

  // 6% absent, 4% on leave, 12% late, the rest a straightforward day.
  if (roll < 0.06) {
    return { status: "absent", day_type: "workday", ...IDLE_DAY };
  }
  if (roll < 0.1) {
    return { status: "leave", day_type: "workday", ...IDLE_DAY };
  }

  const duty = Number(person.duty_hours ?? 8);
  const late = roll < 0.22;
  // 5 to 45 minutes past the grace period, so every penalty tier gets used.
  const minutesLate = late ? 5 + (Math.floor(roll * 1000) % 41) : 0;
  const overtime = roll > 0.9 ? 1 + (Math.floor(roll * 10) % 3) : 0;
  const startOffset = late ? graceMinutes + minutesLate : -Math.floor(roll * 12);

  return {
    status: "present",
    day_type: "workday",
    regular_hours: duty,
    ot_hours: overtime,
    is_late: late,
    minutes_late: minutesLate,
    first_in: pakistanInstant(workDate, shiftStart, startOffset),
    last_out: pakistanInstant(workDate, shiftStart, startOffset + (duty + overtime) * 60),
  };
}

const dates = datesBetween(from, to);

if (remove) {
  const { data, error } = await db
    .from("attendance_days")
    .delete()
    .eq("note", NOTE)
    .gte("work_date", from)
    .lte("work_date", to)
    .select("id");

  if (error) {
    console.error(`Could not remove demo attendance: ${error.message}`);
    process.exit(1);
  }
  console.log(`Removed ${data?.length ?? 0} demo attendance row(s) from ${from} to ${to}.`);
  process.exit(0);
}

const { data: staff, error: staffError } = await db
  .from("profiles")
  .select("id, full_name, site_id, shift_id, duty_hours, status")
  .eq("status", "active");

if (staffError) {
  console.error(`Could not read employees: ${staffError.message}`);
  process.exit(1);
}
if (!staff || staff.length === 0) {
  console.error("No active employees to generate attendance for.");
  process.exit(1);
}

const { data: shifts } = await db.from("shifts").select("id, site_id, starts_at, grace_minutes");
const shiftById = new Map((shifts ?? []).map((s) => [s.id, s]));
const shiftBySite = new Map();
for (const shift of shifts ?? []) {
  if (!shiftBySite.has(shift.site_id)) shiftBySite.set(shift.site_id, shift);
}

/*
 * Days the terminals (or a supervisor) already accounted for. Left untouched.
 *
 * Read a page at a time: PostgREST caps an unbounded select at its own
 * max-rows setting, and a short read here reads as "that day is free" — which
 * the unique constraint on (profile_id, work_date) then rejects mid-insert.
 */
const PAGE = 1000;
const taken = new Set();
for (let offset = 0; ; offset += PAGE) {
  const { data, error } = await db
    .from("attendance_days")
    .select("profile_id, work_date")
    .gte("work_date", from)
    .lte("work_date", to)
    .order("profile_id")
    .order("work_date")
    .range(offset, offset + PAGE - 1);

  if (error) {
    console.error(`Could not read existing attendance: ${error.message}`);
    process.exit(1);
  }
  for (const row of data ?? []) taken.add(`${row.profile_id}:${row.work_date}`);
  if (!data || data.length < PAGE) break;
}

const rows = [];
for (const person of staff) {
  const shift = shiftById.get(person.shift_id) ?? shiftBySite.get(person.site_id) ?? null;
  const shiftStart = shift?.starts_at ?? DEFAULT_SHIFT_START;
  const grace = Number(shift?.grace_minutes ?? 15);

  for (const workDate of dates) {
    if (taken.has(`${person.id}:${workDate}`)) continue;

    rows.push({
      profile_id: person.id,
      site_id: person.site_id,
      shift_id: person.shift_id ?? shift?.id ?? null,
      work_date: workDate,
      is_manual: true,
      note: NOTE,
      ...dayFor(person, workDate, shiftStart, grace),
    });
  }
}

const counts = rows.reduce((tally, row) => {
  tally[row.status] = (tally[row.status] ?? 0) + 1;
  return tally;
}, {});

console.log(`${staff.length} active employees, ${dates.length} date(s): ${from} to ${to}`);
console.log(`${taken.size} day(s) already recorded and left alone.`);
console.log(`${rows.length} row(s) to write:`, counts);

if (dryRun) {
  console.log("Dry run — nothing written.");
  process.exit(0);
}
if (rows.length === 0) {
  console.log("Nothing to write.");
  process.exit(0);
}

// Chunked: a single insert of a few thousand rows is a large enough request
// to be worth not finding out about the hard way.
const CHUNK = 500;
let written = 0;
for (let i = 0; i < rows.length; i += CHUNK) {
  const chunk = rows.slice(i, i + CHUNK);
  const { error } = await db.from("attendance_days").insert(chunk);
  if (error) {
    console.error(`Insert failed at row ${i}: ${error.message}`);
    process.exit(1);
  }
  written += chunk.length;
  console.log(`  wrote ${written}/${rows.length}`);
}

console.log(`Done. ${written} demo attendance row(s) written.`);
console.log(`Undo with: node scripts/seed-demo-attendance.mjs ${from} ${to} --remove`);
