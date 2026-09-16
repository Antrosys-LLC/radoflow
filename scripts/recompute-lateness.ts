/**
 * Re-measures stored lateness against the shift each person actually came in
 * for, and repairs the days the old rule got wrong.
 *
 * Lateness used to be measured against the rostered shift alone. People rotate
 * onto nights days before the office moves them on paper — `followShifts` only
 * catches up after a run of attended days — so a 19:36 check-in on a day
 * roster was recorded as eleven hours late. The only active penalty tier is
 * per minute, so each of those nights deducted roughly one and a half days'
 * pay from somebody who arrived early for their shift.
 *
 * `shiftForArrival` fixes the rule going forward. This fixes the rows already
 * written, which payroll would otherwise price at the old figure.
 *
 * It re-measures through `shiftForArrival` and `minutesLateAgainstShift` — the
 * same pair the ingest path now runs — so a repaired day carries exactly the
 * figure a fresh punch would have produced.
 *
 * Two rules keep it safe to run against a live month:
 *
 *   1. **It can only ever lower a penalty.** A day the old rule scored at zero
 *      is left alone, whatever the new rule would say. Most of those zeroes
 *      belong to people who had no shift at all when the day was ingested —
 *      there was nothing to be late against — and they were given one only
 *      days later. Applying today's roster backwards would invent a deduction
 *      for a week nobody could have been late in.
 *   2. **It writes `minutes_late` and `is_late`, and nothing else.** Rebuilding
 *      the whole day from its punches would also move hours, and the hours
 *      have their own unrelated bug still open. One repair, one column pair.
 *
 * A row a supervisor corrected (`is_manual`) or locked is never touched.
 *
 * Dry by default: it prints what it would change and writes nothing. Pass
 * --apply to commit. Every row it is about to touch is written to a timestamped
 * JSON backup first, and --revert <file> puts those rows back.
 *
 * Run through jiti so the @/ imports resolve as they do in the app. The alias
 * must be absolute:
 *
 *   JITI_ALIAS='{"@":"E:/radoflow/src"}' npx jiti scripts/recompute-lateness.ts 2026-09-01 2026-09-16
 *   JITI_ALIAS='{"@":"E:/radoflow/src"}' npx jiti scripts/recompute-lateness.ts 2026-09-01 2026-09-16 --apply
 *   JITI_ALIAS='{"@":"E:/radoflow/src"}' npx jiti scripts/recompute-lateness.ts --revert <backup-file>
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

const envFile = new URL("../.env.local", import.meta.url);
if (existsSync(envFile)) process.loadEnvFile(envFile);

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!url || !serviceKey) {
  console.error("NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required.");
  process.exit(1);
}

const { pakistanMinutesOfDay, shiftForArrival } = await import("@/lib/attendance/shift-detect");
const { minutesLateAgainstShift } = await import("@/lib/attendance/compute");
const { zonedWallClockToUtc } = await import("@/lib/devices/timezone");
const { PAKISTAN_TIMEZONE } = await import("@/lib/time");
const { calculateLatePenalties } = await import("@/lib/payroll/late");
const { toLateTier } = await import("@/lib/payroll/mappers");
const { dailyRate, daysInMonthOf } = await import("@/lib/payroll/hours");
import type { ShiftClock } from "@/lib/attendance/shift-now";

const supabase = createClient(url, serviceKey, { auth: { persistSession: false } });

const args = process.argv.slice(2);
const apply = args.includes("--apply");
const revertIndex = args.indexOf("--revert");
const [from, to] = args.filter((arg) => !arg.startsWith("--"));

const BACKUP_DIR = new URL("../backups/", import.meta.url);

/** One stored day, as the backup holds it, so --revert can put it back exactly. */
interface StoredDay {
  id: string;
  profile_id: string;
  work_date: string;
  minutes_late: number | null;
  is_late: boolean | null;
}

async function revert(file: string): Promise<void> {
  const rows: StoredDay[] = JSON.parse(readFileSync(file, "utf8"));
  console.log(`Restoring ${rows.length} rows from ${file}`);
  for (const row of rows) {
    const { error } = await supabase
      .from("attendance_days")
      .update({ minutes_late: row.minutes_late, is_late: row.is_late })
      .eq("id", row.id);
    if (error) console.error(`  ${row.work_date} ${row.profile_id}: ${error.message}`);
  }
  console.log("Done.");
}

/**
 * Every attendance day in the range, paged to the end of each batch.
 *
 * PostgREST stops at a thousand rows and says nothing, which for a factory of
 * four hundred is a fortnight cut in half — and a repair that silently skips
 * half its rows is worse than one that refuses to run.
 */
async function readDays(fromDate: string, toDate: string, profileIds: string[]) {
  const rows: {
    id: string;
    profile_id: string;
    work_date: string;
    first_in: string | null;
    minutes_late: number | null;
    is_late: boolean | null;
    is_manual: boolean | null;
    locked: boolean | null;
    site_id: string | null;
  }[] = [];

  for (let i = 0; i < profileIds.length; i += 100) {
    const batch = profileIds.slice(i, i + 100);
    for (let page = 0; ; page++) {
      const { data, error } = await supabase
        .from("attendance_days")
        .select(
          "id, profile_id, work_date, first_in, minutes_late, is_late, is_manual, locked, site_id",
        )
        .in("profile_id", batch)
        .gte("work_date", fromDate)
        .lte("work_date", toDate)
        .order("profile_id")
        .order("work_date")
        .range(page * 1000, page * 1000 + 999);
      if (error) throw new Error(error.message);
      rows.push(...(data ?? []));
      if ((data?.length ?? 0) < 1000) break;
    }
  }

  return rows;
}

async function main(): Promise<void> {
  if (revertIndex >= 0) {
    const file = args[revertIndex + 1];
    if (!file) {
      console.error("--revert needs the backup file to restore from.");
      process.exit(1);
    }
    await revert(file);
    return;
  }

  if (!from || !to) {
    console.error("Usage: recompute-lateness.ts <from> <to> [--apply]");
    process.exit(1);
  }

  const { data: staff, error: staffError } = await supabase
    .from("profiles")
    .select("id, full_name, shift_id, site_id, flexible_hours, monthly_salary, duty_hours")
    .eq("status", "active");
  if (staffError) throw new Error(staffError.message);

  const { data: shiftRows, error: shiftError } = await supabase
    .from("shifts")
    .select("id, code, name, starts_at, ends_at, overtime_until, grace_minutes, site_id")
    .eq("is_active", true)
    .order("sort_order");
  if (shiftError) throw new Error(shiftError.message);

  const shiftsBySite = new Map<string, ShiftClock[]>();
  for (const row of shiftRows ?? []) {
    const list = shiftsBySite.get(row.site_id) ?? [];
    list.push({
      id: row.id,
      code: row.code,
      name: row.name,
      startsAt: String(row.starts_at),
      endsAt: String(row.ends_at),
      overtimeUntil: row.overtime_until ? String(row.overtime_until) : null,
      graceMinutes: row.grace_minutes ?? 0,
    });
    shiftsBySite.set(row.site_id, list);
  }

  const people = new Map((staff ?? []).map((person) => [person.id, person]));
  const days = await readDays(from, to, [...people.keys()]);
  console.log(`Read ${days.length} attendance days for ${from} to ${to}.`);

  const changes: {
    row: (typeof days)[number];
    name: string;
    was: number;
    now: number;
    shift: string;
  }[] = [];

  let skippedManual = 0;
  let skippedZero = 0;
  const increases: { name: string; workDate: string; was: number; now: number }[] = [];

  for (const row of days) {
    const person = people.get(row.profile_id);
    if (!person || !row.first_in) continue;
    if (row.is_manual || row.locked) {
      skippedManual += 1;
      continue;
    }
    const stored = row.minutes_late ?? 0;
    /*
     * Rule 1: a day nobody was marked late on is left as it is. See the note
     * at the top — almost every one of them is a day worked before that person
     * had a shift to be measured against.
     */
    if (stored <= 0) {
      skippedZero += 1;
      continue;
    }
    if (person.flexible_hours) {
      // Nobody on flexible hours can be late; a stored figure is left over
      // from before they were made flexible.
      if (stored !== 0) {
        changes.push({ row, name: person.full_name, was: stored, now: 0, shift: "flexible" });
      }
      continue;
    }

    const siteId = person.site_id ?? row.site_id;
    const shifts = siteId ? (shiftsBySite.get(siteId) ?? []) : [];
    const rostered = shifts.find((shift) => shift.id === person.shift_id) ?? null;
    if (!person.shift_id) continue;

    const arrival = pakistanMinutesOfDay(row.first_in);
    const against = arrival === null ? rostered : shiftForArrival(shifts, rostered, arrival);
    if (!against) continue;

    const start = zonedWallClockToUtc(
      `${row.work_date} ${against.startsAt.slice(0, 8)}`,
      PAKISTAN_TIMEZONE,
    );
    if (!start) continue;

    const predicted = minutesLateAgainstShift(new Date(row.first_in), start, against.graceMinutes);

    if (predicted === stored) continue;

    if (predicted > stored) {
      // The roster moved under the day. Reported, never written.
      increases.push({
        name: person.full_name,
        workDate: row.work_date,
        was: stored,
        now: predicted,
      });
      continue;
    }

    changes.push({ row, name: person.full_name, was: stored, now: predicted, shift: against.code });
  }

  const minutesBefore = changes.reduce((total, change) => total + change.was, 0);
  const minutesAfter = changes.reduce((total, change) => total + change.now, 0);

  /*
   * What the change is worth, priced by the engine rather than by a formula
   * repeated here — the penalty ladder is configurable, and a second opinion
   * about it in a repair script is one more thing that can drift.
   */
  const { data: tierRows } = await supabase
    .from("late_penalty_rules")
    .select("*")
    .eq("is_active", true)
    .order("from_minutes", { ascending: true })
    .order("id", { ascending: true });
  const tiers = (tierRows ?? []).map(toLateTier);

  const priceOf = (minutes: number, change: (typeof changes)[number]) => {
    const person = people.get(change.row.profile_id);
    if (!person || person.flexible_hours) return 0;
    const salary = Number(person.monthly_salary ?? 0);
    const duty = Number(person.duty_hours ?? 8) || 8;
    const perDay = dailyRate(salary, daysInMonthOf(change.row.work_date));
    return calculateLatePenalties(
      [
        {
          workDate: change.row.work_date,
          dayType: "workday",
          hoursWorked: 0,
          status: "present",
          minutesLate: minutes,
        },
      ],
      tiers,
      perDay,
      salary,
      duty,
    ).total;
  };

  const rupeesBefore = changes.reduce((total, change) => total + priceOf(change.was, change), 0);
  const rupeesAfter = changes.reduce((total, change) => total + priceOf(change.now, change), 0);

  console.log(`Skipped ${skippedManual} corrected or locked rows, ${skippedZero} already at zero.`);
  if (increases.length > 0) {
    console.log(
      `\nLeft alone — the new rule would raise these ${increases.length} penalties, so it does not:`,
    );
    for (const raise of increases.slice(0, 10)) {
      console.log(`  ${raise.workDate}  ${raise.name.padEnd(20)} ${raise.was} -> ${raise.now} min`);
    }
    if (increases.length > 10) console.log(`  … and ${increases.length - 10} more`);
  }
  console.log(`\n${changes.length} days change:`);
  for (const change of changes.slice(0, 25)) {
    console.log(
      `  ${change.row.work_date}  ${change.name.padEnd(20)} ${String(change.was).padStart(5)} -> ${String(change.now).padStart(4)} min   (measured against ${change.shift})`,
    );
  }
  if (changes.length > 25) console.log(`  … and ${changes.length - 25} more`);
  console.log(
    `\nLate minutes across those days: ${minutesBefore} -> ${minutesAfter} (${minutesBefore - minutesAfter} removed)`,
  );
  console.log(
    `Deductions they carry:          Rs ${Math.round(rupeesBefore).toLocaleString("en-PK")} -> Rs ${Math.round(rupeesAfter).toLocaleString("en-PK")} (Rs ${Math.round(rupeesBefore - rupeesAfter).toLocaleString("en-PK")} returned)`,
  );

  if (!apply) {
    console.log("\nDry run. Nothing was written. Pass --apply to commit.");
    return;
  }

  if (!existsSync(BACKUP_DIR)) mkdirSync(BACKUP_DIR, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const backupFile = new URL(`lateness-${stamp}.json`, BACKUP_DIR);
  const backup: StoredDay[] = changes.map(({ row }) => ({
    id: row.id,
    profile_id: row.profile_id,
    work_date: row.work_date,
    minutes_late: row.minutes_late,
    is_late: row.is_late,
  }));
  writeFileSync(backupFile, JSON.stringify(backup, null, 2));
  console.log(`\nBacked up ${backup.length} rows to ${backupFile.pathname}`);

  let repaired = 0;
  for (const change of changes) {
    const { error } = await supabase
      .from("attendance_days")
      .update({ minutes_late: change.now, is_late: change.now > 0 })
      .eq("id", change.row.id);
    if (error) {
      console.error(`  ${change.row.work_date} ${change.name}: ${error.message}`);
      continue;
    }
    repaired += 1;
  }

  console.log(`Repaired ${repaired} of ${changes.length} days.`);
}

await main();
