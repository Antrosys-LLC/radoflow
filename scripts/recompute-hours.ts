/**
 * Rebuilds the days whose hours the twelve-hour pairing window threw away.
 *
 * `splitIntoSessions` treats punches more than a fixed twelve hours apart as
 * two separate stretches of attendance rather than one long one — the rule
 * that stops a night at home being paid as a very long lunch break. But both
 * of Rado's shifts run exactly twelve hours once their overtime is counted, so
 * twelve was not a ceiling above a long day; it was the length of one. A
 * worker who arrived at 07:33 and left at 19:53 cleared it by twenty minutes,
 * split into two blocks of a single punch each, and was paid for none of it.
 * Over the first half of September that silently zeroed about four and a half
 * thousand worked hours.
 *
 * `presenceWindowHours` now derives the window from the person's own shift.
 * This rebuilds the days already stored, through `recomputeAttendanceDay` —
 * the same function ingestion runs — so a repaired day is exactly the day a
 * clean replay of its punches would have produced.
 *
 * Two rules keep it safe to run against a live month:
 *
 *   1. **It only touches days whose hours go up.** The window can only ever
 *      join two stretches that were split, never split one that was joined, so
 *      a day that would come back shorter means something else changed since
 *      it was written. Those are reported and left alone rather than quietly
 *      repriced.
 *   2. **A day with no punches behind it is never rebuilt.** Rebuilding one
 *      from punches that do not exist would replace it with an absence.
 *      `recomputeAttendanceDay` already refuses a corrected (`is_manual`) or
 *      locked row, and this refuses the rest.
 *
 * Note that a rebuild also refreshes lateness, since it replays the whole day.
 * That is the same rule `recompute-lateness.ts` applied and is idempotent.
 *
 * Dry by default: it prints what it would change and writes nothing. Pass
 * --apply to commit. Every row it is about to touch is written to a timestamped
 * JSON backup first, and --revert <file> puts those rows back.
 *
 * Run through jiti so the @/ imports resolve as they do in the app. The alias
 * must be absolute:
 *
 *   JITI_ALIAS='{"@":"E:/radoflow/src"}' npx jiti scripts/recompute-hours.ts 2026-09-01 2026-09-16
 *   JITI_ALIAS='{"@":"E:/radoflow/src"}' npx jiti scripts/recompute-hours.ts 2026-09-01 2026-09-16 --apply
 *   JITI_ALIAS='{"@":"E:/radoflow/src"}' npx jiti scripts/recompute-hours.ts --revert <backup-file>
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

const { computeDayFromPunches } = await import("@/lib/attendance/compute");
const { presenceWindowHours } = await import("@/lib/attendance/shift-detect");
const { recomputeAttendanceDay } = await import("@/lib/devices/ingest");
const { daysInMonthOf, overtimeRate, splitDayHours } = await import("@/lib/payroll/hours");
const { DEFAULT_PAY_RULE } = await import("@/lib/payroll/types");
import type { RawPunch } from "@/lib/attendance/compute";
import type { ShiftClock } from "@/lib/attendance/shift-now";
import type { DayType } from "@/lib/payroll/types";

const supabase = createClient(url, serviceKey, { auth: { persistSession: false } });

const args = process.argv.slice(2);
const apply = args.includes("--apply");
const revertIndex = args.indexOf("--revert");
const [from, to] = args.filter((arg) => !arg.startsWith("--"));

const BACKUP_DIR = new URL("../backups/", import.meta.url);

/** Every column a rebuild rewrites, so --revert can put the day back exactly. */
interface StoredDay {
  id: string;
  profile_id: string;
  work_date: string;
  first_in: string | null;
  last_out: string | null;
  regular_hours: number | null;
  break_minutes: number | null;
  hours_are_final: boolean | null;
  status: string | null;
  note: string | null;
  minutes_late: number | null;
  is_late: boolean | null;
}

const RESTORED_COLUMNS =
  "id, profile_id, work_date, first_in, last_out, regular_hours, break_minutes, hours_are_final, status, note, minutes_late, is_late";

async function revert(file: string): Promise<void> {
  const rows: StoredDay[] = JSON.parse(readFileSync(file, "utf8"));
  console.log(`Restoring ${rows.length} rows from ${file}`);
  for (const row of rows) {
    const { id: _id, profile_id: _profileId, work_date: _workDate, ...columns } = row;
    const { error } = await supabase.from("attendance_days").update(columns).eq("id", row.id);
    if (error) console.error(`  ${row.work_date} ${row.profile_id}: ${error.message}`);
  }
  console.log("Done.");
}

/**
 * Paged to the end of every batch.
 *
 * PostgREST stops at a thousand rows and says nothing, which for a factory of
 * four hundred is a fortnight cut in half — and a repair that silently skips
 * half its rows is worse than one that refuses to run.
 */
async function pageAll<T>(
  table: "attendance_days" | "punches",
  columns: string,
  profileIds: readonly string[],
  fromDate: string,
  toDate: string,
): Promise<T[]> {
  const rows: T[] = [];
  for (let i = 0; i < profileIds.length; i += 100) {
    const batch = profileIds.slice(i, i + 100);
    for (let page = 0; ; page++) {
      const { data, error } = await supabase
        .from(table)
        .select(columns)
        .in("profile_id", batch)
        .gte("work_date", fromDate)
        .lte("work_date", toDate)
        .order("profile_id")
        .order("work_date")
        .range(page * 1000, page * 1000 + 999);
      if (error) throw new Error(error.message);
      rows.push(...((data ?? []) as T[]));
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
    console.error("Usage: recompute-hours.ts <from> <to> [--apply]");
    process.exit(1);
  }

  const { data: staff, error: staffError } = await supabase
    .from("profiles")
    .select(
      "id, full_name, shift_id, site_id, flexible_hours, requires_attendance, duty_hours, monthly_salary, worker_type",
    )
    .eq("status", "active");
  if (staffError) throw new Error(staffError.message);

  const { data: shiftRows, error: shiftError } = await supabase
    .from("shifts")
    .select("id, code, name, starts_at, ends_at, overtime_until, grace_minutes")
    .eq("is_active", true);
  if (shiftError) throw new Error(shiftError.message);

  const shifts: ShiftClock[] = (shiftRows ?? []).map((row) => ({
    id: row.id,
    code: row.code,
    name: row.name,
    startsAt: String(row.starts_at),
    endsAt: String(row.ends_at),
    overtimeUntil: row.overtime_until ? String(row.overtime_until) : null,
    graceMinutes: row.grace_minutes ?? 0,
  }));

  const people = new Map((staff ?? []).map((person) => [person.id, person]));
  const profileIds = [...people.keys()];

  const days = await pageAll<
    StoredDay & { day_type: string | null; is_manual: boolean | null; locked: boolean | null }
  >("attendance_days", `${RESTORED_COLUMNS}, day_type, is_manual, locked`, profileIds, from, to);
  const punches = await pageAll<{
    profile_id: string;
    work_date: string;
    punched_at: string;
    direction: string | null;
  }>("punches", "profile_id, work_date, punched_at, direction", profileIds, from, to);

  const punchesByDay = new Map<string, RawPunch[]>();
  for (const punch of punches) {
    const key = `${punch.profile_id}|${punch.work_date}`;
    const list = punchesByDay.get(key) ?? [];
    list.push({
      punchedAt: new Date(punch.punched_at),
      direction: (punch.direction ?? "unknown") as RawPunch["direction"],
    });
    punchesByDay.set(key, list);
  }

  console.log(
    `Read ${days.length} attendance days and ${punches.length} punches for ${from} to ${to}.`,
  );

  const changes: { row: (typeof days)[number]; name: string; was: number; now: number }[] = [];
  const shrinks: { name: string; workDate: string; was: number; now: number }[] = [];
  let skippedManual = 0;
  let skippedNoPunches = 0;

  for (const row of days) {
    const person = people.get(row.profile_id);
    if (!person) continue;
    if (row.is_manual || row.locked) {
      skippedManual += 1;
      continue;
    }

    const raw = punchesByDay.get(`${row.profile_id}|${row.work_date}`);
    if (!raw || raw.length === 0) {
      skippedNoPunches += 1;
      continue;
    }

    const rostered = shifts.find((shift) => shift.id === person.shift_id) ?? null;
    const windowHours = rostered ? presenceWindowHours(rostered) : null;
    const options = {
      requiresAttendance: person.requires_attendance ?? true,
      floorFinalOut: Boolean(person.shift_id) && !person.flexible_hours,
    };

    const rebuilt = computeDayFromPunches(raw, (row.day_type ?? "workday") as DayType, {
      ...options,
      ...(windowHours === null ? {} : { sessionWindowHours: windowHours }),
    });

    const stored = Number(row.regular_hours ?? 0);
    if (rebuilt.hoursWorked === stored) continue;

    if (rebuilt.hoursWorked < stored) {
      // Rule 1: the window can only join stretches, never split them. A day
      // that comes back shorter changed for some other reason — report it.
      shrinks.push({
        name: person.full_name,
        workDate: row.work_date,
        was: stored,
        now: rebuilt.hoursWorked,
      });
      continue;
    }

    changes.push({ row, name: person.full_name, was: stored, now: rebuilt.hoursWorked });
  }

  /*
   * What the recovered time is worth, priced the way payroll prices it: the
   * hours land in the duty and overtime buckets under the standard rule, and
   * only the overtime is new money — the duty hours were already covered by
   * the day's salary, since a day attended is a day earned however short.
   */
  const overtimeOf = (hours: number, row: (typeof days)[number], duty: number) =>
    splitDayHours(
      {
        workDate: row.work_date,
        dayType: (row.day_type ?? "workday") as DayType,
        hoursWorked: hours,
        status: "present",
        hoursAreFinal: false,
      },
      DEFAULT_PAY_RULE,
      duty,
    ).overtime;

  let overtimeBefore = 0;
  let overtimeAfter = 0;
  let rupees = 0;
  for (const change of changes) {
    const person = people.get(change.row.profile_id);
    const duty = Number(person?.duty_hours ?? 8);
    const before = overtimeOf(change.was, change.row, duty);
    const after = overtimeOf(change.now, change.row, duty);
    overtimeBefore += before;
    overtimeAfter += after;
    // A contract firm is billed its agreed amount, not per hour, so recovered
    // hours on one of its people cost the factory nothing extra.
    if (person && person.worker_type !== "contractor") {
      rupees +=
        (after - before) *
        overtimeRate(Number(person.monthly_salary ?? 0), daysInMonthOf(change.row.work_date));
    }
  }

  const hoursBefore = changes.reduce((total, change) => total + change.was, 0);
  const hoursAfter = changes.reduce((total, change) => total + change.now, 0);

  console.log(
    `Skipped ${skippedManual} corrected or locked rows, ${skippedNoPunches} without punches.`,
  );
  if (shrinks.length > 0) {
    console.log(`\nLeft alone — these ${shrinks.length} days would come back shorter:`);
    for (const shrink of shrinks.slice(0, 10)) {
      console.log(
        `  ${shrink.workDate}  ${shrink.name.padEnd(20)} ${shrink.was}h -> ${shrink.now}h`,
      );
    }
    if (shrinks.length > 10) console.log(`  … and ${shrinks.length - 10} more`);
  }

  console.log(`\n${changes.length} days change:`);
  for (const change of changes.slice(0, 20)) {
    console.log(
      `  ${change.row.work_date}  ${change.name.padEnd(20)} ${String(change.was).padStart(6)}h -> ${String(change.now).padStart(6)}h`,
    );
  }
  if (changes.length > 20) console.log(`  … and ${changes.length - 20} more`);

  console.log(
    `\nHours on those days:     ${Math.round(hoursBefore * 100) / 100} -> ${Math.round(hoursAfter * 100) / 100} (${Math.round((hoursAfter - hoursBefore) * 100) / 100} recovered)`,
  );
  console.log(
    `Of which payable overtime: ${Math.round(overtimeBefore * 100) / 100} -> ${Math.round(overtimeAfter * 100) / 100} h`,
  );
  console.log(`Overtime that becomes payable: Rs ${Math.round(rupees).toLocaleString("en-PK")}`);

  if (!apply) {
    console.log("\nDry run. Nothing was written. Pass --apply to commit.");
    return;
  }

  if (!existsSync(BACKUP_DIR)) mkdirSync(BACKUP_DIR, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const backupFile = new URL(`hours-${stamp}.json`, BACKUP_DIR);
  const backup: StoredDay[] = changes.map(({ row }) => ({
    id: row.id,
    profile_id: row.profile_id,
    work_date: row.work_date,
    first_in: row.first_in,
    last_out: row.last_out,
    regular_hours: row.regular_hours,
    break_minutes: row.break_minutes,
    hours_are_final: row.hours_are_final,
    status: row.status,
    note: row.note,
    minutes_late: row.minutes_late,
    is_late: row.is_late,
  }));
  writeFileSync(backupFile, JSON.stringify(backup, null, 2));
  console.log(`\nBacked up ${backup.length} rows to ${backupFile.pathname}`);

  let repaired = 0;
  for (const change of changes) {
    const siteId = people.get(change.row.profile_id)?.site_id;
    if (!siteId) continue;
    try {
      await recomputeAttendanceDay(change.row.profile_id, change.row.work_date, siteId);
      repaired += 1;
    } catch (error) {
      console.error(
        `  ${change.row.work_date} ${change.name}: ${error instanceof Error ? error.message : error}`,
      );
    }
  }

  console.log(`Rebuilt ${repaired} of ${changes.length} days.`);
}

await main();
