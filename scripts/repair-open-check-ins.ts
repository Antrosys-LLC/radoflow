/**
 * Repairs days that show somebody "working" who has gone home.
 *
 * Two faults wrote them, and both are fixed in ingestion (check-out-dates.ts,
 * sessions.ts `splitByDeclaredDirection`); this repairs what they already wrote.
 *
 *   1. A check-out filed under the next calendar date, as the only punch of a
 *      day. A day's first punch is its check-in, so the board counted the man
 *      as just arrived. The scan is moved onto the day of the check-in it closes.
 *   2. A check-in scanned twice, which flipped every pairing after it, so the
 *      real check-out read as a new check-in.
 *
 * Dry by default: it prints what would change and writes nothing. With --apply
 * it first saves the punches and days it will touch to backups/, moves the
 * punches, and rebuilds the days through `recomputeAttendanceDay` — the same
 * function ingestion runs. Corrected (`is_manual`) and locked days are never
 * rebuilt. --revert <file> puts the saved punch dates back (days are then
 * rebuilt by running this again, or by the next punch).
 *
 *   JITI_ALIAS='{"@":"E:/Rado/radoflow/src"}' npx jiti scripts/repair-open-check-ins.ts 2026-10-14 2026-10-18
 *   JITI_ALIAS='{"@":"E:/Rado/radoflow/src"}' npx jiti scripts/repair-open-check-ins.ts 2026-10-14 2026-10-18 --apply
 *   JITI_ALIAS='{"@":"E:/Rado/radoflow/src"}' npx jiti scripts/repair-open-check-ins.ts --revert <backup-file>
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
const { openCheckInDate } = await import("@/lib/attendance/check-out-dates");
const { presenceWindowHours } = await import("@/lib/attendance/shift-detect");
const { recomputeAttendanceDay } = await import("@/lib/devices/ingest");

const supabase = createClient(url, serviceKey, { auth: { persistSession: false } });

const args = process.argv.slice(2);
const apply = args.includes("--apply");
const revertAt = args.indexOf("--revert");
const [from, to] = args.filter((arg) => !arg.startsWith("--"));

const BACKUP_DIR = new URL("../backups/", import.meta.url);

interface Punch {
  id: string;
  profile_id: string | null;
  device_id: string | null;
  punched_at: string;
  direction: "in" | "out" | "unknown";
  work_date: string;
}

async function pagePunches(fromIso: string, toIso: string): Promise<Punch[]> {
  const rows: Punch[] = [];
  for (let offset = 0; ; offset += 1000) {
    const { data, error } = await supabase
      .from("punches")
      .select("id, profile_id, device_id, punched_at, direction, work_date")
      .gte("punched_at", fromIso)
      .lt("punched_at", toIso)
      .order("punched_at")
      .order("id")
      .range(offset, offset + 999);
    if (error) throw new Error(error.message);
    rows.push(...(data as Punch[]));
    if (data.length < 1000) break;
  }
  return rows;
}

if (revertAt >= 0) {
  const file = args[revertAt + 1];
  if (!file) throw new Error("--revert needs a backup file");
  const saved: { id: string; work_date: string }[] = JSON.parse(readFileSync(file, "utf8")).punches;
  console.log(`Restoring ${saved.length} punch dates from ${file}`);
  for (const row of saved) {
    const { error } = await supabase.from("punches").update({ work_date: row.work_date }).eq("id", row.id);
    if (error) console.error(`  ${row.id}: ${error.message}`);
  }
  console.log("Done. Run the repair again to rebuild the days.");
  process.exit(0);
}

if (!from || !to) {
  console.error("Usage: repair-open-check-ins.ts <from YYYY-MM-DD> <to YYYY-MM-DD> [--apply]");
  process.exit(1);
}

const { data: gates } = await supabase.from("devices").select("id, direction").neq("direction", "auto");
const gateIds = new Set((gates ?? []).map((g) => g.id));

// A day earlier, so a night that began before the range still finds its check-in.
const fromIso = new Date(new Date(`${from}T00:00:00+05:00`).getTime() - 86_400_000).toISOString();
const toIso = new Date(new Date(`${to}T00:00:00+05:00`).getTime() + 2 * 86_400_000).toISOString();
const all = (await pagePunches(fromIso, toIso)).filter(
  (p) => p.profile_id && p.device_id && gateIds.has(p.device_id) && p.direction !== "unknown",
);

// 1. Check-outs filed under a day other than the check-in they close.
const byPerson = new Map<string, Punch[]>();
for (const p of all) (byPerson.get(p.profile_id!) ?? byPerson.set(p.profile_id!, []).get(p.profile_id!)!).push(p);

const moves: { punch: Punch; to: string }[] = [];
for (const [, list] of byPerson) {
  for (const p of list) {
    if (p.direction !== "out") continue;
    const at = Date.parse(p.punched_at);
    const history = list
      .filter((q) => q.id !== p.id && Date.parse(q.punched_at) < at)
      .map((q) => ({ at: Date.parse(q.punched_at), direction: q.direction as "in" | "out", workDate: q.work_date }));
    const date = openCheckInDate(history, at);
    if (date && date !== p.work_date) moves.push({ punch: p, to: date });
  }
}

// Which days to look at again: where a punch moves from and to, and every day
// in range that holds punches (a double scan leaves no trace but the pairing).
const moved = new Map(moves.map((m) => [m.punch.id, m.to]));
const dayKeys = new Set<string>();
for (const p of all) {
  const date = moved.get(p.id) ?? p.work_date;
  if (date >= from && date <= to) dayKeys.add(`${p.profile_id}|${date}`);
  if (moved.has(p.id) && p.work_date >= from && p.work_date <= to) dayKeys.add(`${p.profile_id}|${p.work_date}`);
}

const [{ data: shiftRows }, { data: people }] = await Promise.all([
  supabase.from("shifts").select("id, code, name, starts_at, ends_at, overtime_until, grace_minutes"),
  supabase.from("profiles").select("id, site_id, shift_id, requires_attendance"),
]);
const shiftById = new Map((shiftRows ?? []).map((s) => [s.id, s]));
const personById = new Map((people ?? []).map((p) => [p.id, p]));

const { data: storedDays } = await supabase
  .from("attendance_days")
  .select("profile_id, work_date, first_in, last_out, is_manual, locked")
  .gte("work_date", from)
  .lte("work_date", to)
  .not("first_in", "is", null);
const stored = new Map((storedDays ?? []).map((d) => [`${d.profile_id}|${d.work_date}`, d]));

const changes: { key: string; before: string; after: string }[] = [];
const toRebuild: { profileId: string; workDate: string; siteId: string }[] = [];

for (const key of dayKeys) {
  const [profileId, workDate] = key.split("|") as [string, string];
  const person = personById.get(profileId);
  if (!person) continue;
  const day = stored.get(key);
  if (day?.is_manual || day?.locked) continue;

  const punches = all
    .filter((p) => p.profile_id === profileId && (moved.get(p.id) ?? p.work_date) === workDate)
    .map((p) => ({
      punchedAt: new Date(p.punched_at),
      direction: p.direction as "in" | "out",
      declared: true,
    }));
  const shift = person.shift_id ? shiftById.get(person.shift_id) : undefined;
  const window = shift
    ? presenceWindowHours({
        id: shift.id,
        code: shift.code,
        name: shift.name,
        startsAt: String(shift.starts_at),
        endsAt: String(shift.ends_at),
        overtimeUntil: shift.overtime_until ? String(shift.overtime_until) : null,
        graceMinutes: shift.grace_minutes ?? 0,
      })
    : undefined;
  const next = computeDayFromPunches(punches, "workday", window ? { sessionWindowHours: window } : {});

  const was = `${day?.first_in ?? "-"} → ${day?.last_out ?? "(open)"}`;
  const will = `${next.firstIn?.toISOString() ?? "-"} → ${next.lastOut ? "closed" : next.firstIn ? "(open)" : "no day"}`;
  const wasOpen = Boolean(day?.first_in && !day.last_out);
  const willOpen = Boolean(next.firstIn && !next.lastOut);
  const phantom = wasOpen && !willOpen;
  const lone = Boolean(day?.first_in) && !next.firstIn;
  if (phantom || lone || moved.size > 0) {
    if (phantom || lone) changes.push({ key, before: was, after: will });
  }
  if (phantom || lone || [...moves].some((m) => m.punch.profile_id === profileId && (m.to === workDate || m.punch.work_date === workDate))) {
    toRebuild.push({ profileId, workDate, siteId: person.site_id });
  }
}

console.log(`Range ${from} to ${to}`);
console.log(`Check-outs filed under the wrong day: ${moves.length}`);
console.log(`Days that stop showing somebody still in: ${changes.length}`);
console.log(`Days to rebuild: ${toRebuild.length}`);
for (const c of changes.slice(0, 15)) console.log(`  ${c.key}  ${c.before}  =>  ${c.after}`);

if (!apply) {
  console.log("\nDry run — nothing written. Add --apply to commit.");
  process.exit(0);
}

mkdirSync(BACKUP_DIR, { recursive: true });
const backup = new URL(`open-check-ins-${new Date().toISOString().replace(/[:.]/g, "-")}.json`, BACKUP_DIR);
writeFileSync(
  backup,
  JSON.stringify(
    {
      punches: moves.map((m) => ({ id: m.punch.id, work_date: m.punch.work_date })),
      days: toRebuild.map((d) => stored.get(`${d.profileId}|${d.workDate}`) ?? null).filter(Boolean),
    },
    null,
    2,
  ),
);
console.log(`Backup written: ${backup.pathname}`);

for (const m of moves) {
  const { error } = await supabase.from("punches").update({ work_date: m.to }).eq("id", m.punch.id);
  if (error) console.error(`  punch ${m.punch.id}: ${error.message}`);
}
for (const d of toRebuild) await recomputeAttendanceDay(d.profileId, d.workDate, d.siteId);
console.log("Done.");
