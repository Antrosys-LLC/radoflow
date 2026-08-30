/**
 * Corrects terminal enrolment IDs, then re-attaches the punches they dropped.
 *
 * RadoFlow stored each person's terminal ID as their employee code — `RD-2070`.
 * A ZKTeco terminal holds the user ID as a number and cannot store letters or a
 * hyphen, so the device uploads `2070`, the lookup in `device_enrollments`
 * finds nothing, and the punch is written with no owner. The upload still
 * returns success and the terminal deletes its copy, so the loss is silent.
 *
 * This does three things, in order:
 *
 *   1. Rewrites every non-numeric `device_user_id` to the number the terminal
 *      actually sends.
 *   2. Attaches punches already stored with no owner to the person their
 *      device id now resolves to.
 *   3. Recomputes the attendance day behind each of those punches, through the
 *      same function ingestion uses, so hours and lateness match a clean run.
 *
 * Dry by default: it prints what it would change and writes nothing. Pass
 * --apply to commit. Every row it is about to touch is written to a timestamped
 * JSON backup first, and --revert <file> puts those rows back.
 *
 * Run through jiti so the @/ imports resolve as they do in the app. The alias
 * must be absolute:
 *
 *   JITI_ALIAS='{"@":"E:/radoflow/src"}' npx jiti scripts/fix-terminal-ids.ts
 *   JITI_ALIAS='{"@":"E:/radoflow/src"}' npx jiti scripts/fix-terminal-ids.ts --apply
 *   JITI_ALIAS='{"@":"E:/radoflow/src"}' npx jiti scripts/fix-terminal-ids.ts --revert <backup-file>
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";

// The service key lives in .env.local; nothing loads it outside Next.
function loadEnv(): void {
  if (!existsSync(".env.local")) throw new Error(".env.local not found — run from the repo root");

  for (const line of readFileSync(".env.local", "utf8").split(/\r?\n/)) {
    if (!line.includes("=") || line.trim().startsWith("#")) continue;
    const at = line.indexOf("=");
    const key = line.slice(0, at).trim();
    const value = line
      .slice(at + 1)
      .trim()
      .replace(/^["']|["']$/g, "");
    if (!process.env[key]) process.env[key] = value;
  }
}

loadEnv();

const { createServiceClient } = await import("@/lib/supabase/service");
const { recomputeAttendanceDay } = await import("@/lib/devices/ingest");

const APPLY = process.argv.includes("--apply");
const revertIndex = process.argv.indexOf("--revert");
const REVERT_FILE = revertIndex >= 0 ? process.argv[revertIndex + 1] : null;

const db = createServiceClient();

/**
 * The number the terminal sends for a given employee code.
 *
 * Verified against live traffic before this was written: the CEO is enrolled
 * as `1` against code `RD-0001` and maps correctly, and `RD-2070` arrives from
 * the terminal as `2070`. Leading zeros are dropped because the device stores
 * an integer, so `RD-0001` and `RD-1` are the same user to it.
 */
function terminalNumber(code: string): string {
  const digits = String(code ?? "").replace(/\D/g, "");
  return digits === "" ? "" : String(Number(digits));
}

interface EnrolmentRow {
  id?: string;
  device_id: string;
  device_user_id: string;
  profile_id: string;
}

async function revert(file: string): Promise<void> {
  const backup = JSON.parse(readFileSync(file, "utf8")) as {
    enrolments: EnrolmentRow[];
    punches: { id: number; profile_id: string | null }[];
  };

  console.log(`Restoring ${backup.enrolments.length} enrolment(s) from ${file}`);

  for (const row of backup.enrolments) {
    const { error } = await db
      .from("device_enrollments")
      .update({ device_user_id: row.device_user_id })
      .eq("device_id", row.device_id)
      .eq("profile_id", row.profile_id);
    if (error) console.log(`  ! ${row.profile_id}: ${error.message}`);
  }

  console.log(`Restoring ${backup.punches.length} punch owner(s)`);
  for (const punch of backup.punches) {
    const { error } = await db
      .from("punches")
      .update({ profile_id: punch.profile_id })
      .eq("id", punch.id);
    if (error) console.log(`  ! punch ${punch.id}: ${error.message}`);
  }

  console.log("Reverted. Attendance days are not rebuilt — rerun without --apply to inspect.");
}

async function main(): Promise<void> {
  if (REVERT_FILE) {
    await revert(REVERT_FILE);
    return;
  }

  const [{ data: profiles, error: profileError }, { data: enrolments, error: enrolError }] =
    await Promise.all([
      db.from("profiles").select("id, employee_code, full_name, site_id"),
      db.from("device_enrollments").select("device_id, device_user_id, profile_id"),
    ]);

  if (profileError) throw new Error(`profiles: ${profileError.message}`);
  if (enrolError) throw new Error(`device_enrollments: ${enrolError.message}`);

  const profileById = new Map((profiles ?? []).map((p) => [p.id, p]));

  const planned = (enrolments ?? [])
    .map((row) => {
      const profile = profileById.get(row.profile_id);
      const target = terminalNumber(profile?.employee_code ?? "");
      return { row, profile, target };
    })
    .filter((entry) => entry.target !== "" && entry.target !== entry.row.device_user_id);

  /*
   * A collision would silently pay one person for another's hours, so it stops
   * the run rather than letting the unique index reject rows halfway through.
   */
  const wanted = new Map<string, string[]>();
  for (const { row, target } of planned) {
    wanted.set(`${row.device_id}:${target}`, [
      ...(wanted.get(`${row.device_id}:${target}`) ?? []),
      row.profile_id,
    ]);
  }
  const untouched = new Map<string, string>();
  for (const row of enrolments ?? []) {
    if (!planned.some((p) => p.row.profile_id === row.profile_id)) {
      untouched.set(`${row.device_id}:${row.device_user_id}`, row.profile_id);
    }
  }

  const clashes = [...wanted.entries()].filter(
    ([key, owners]) => owners.length > 1 || untouched.has(key),
  );

  console.log(`Enrolments needing a new id : ${planned.length}`);
  console.log(`Already correct             : ${(enrolments ?? []).length - planned.length}`);
  console.log(`Collisions                  : ${clashes.length}`);

  if (clashes.length > 0) {
    for (const [key, owners] of clashes.slice(0, 10)) {
      const names = [...owners, untouched.get(key)]
        .filter(Boolean)
        .map((id) => profileById.get(id as string)?.full_name ?? id);
      console.log(`  ! ${key} wanted by ${names.join(" and ")}`);
    }
    throw new Error("Refusing to continue: two people would share a terminal id.");
  }

  // Punches with no owner whose device id resolves once the enrolments are right.
  const { data: orphans, error: orphanError } = await db
    .from("punches")
    .select("id, device_id, device_user_id, work_date, profile_id")
    .is("profile_id", null);

  if (orphanError) throw new Error(`punches: ${orphanError.message}`);

  const ownerFor = new Map<string, string>();
  for (const { row, target } of planned) ownerFor.set(`${row.device_id}:${target}`, row.profile_id);
  for (const [key, profileId] of untouched) ownerFor.set(key, profileId);

  const adoptable = (orphans ?? [])
    .map((punch) => ({
      punch,
      profileId: ownerFor.get(`${punch.device_id}:${punch.device_user_id}`),
    }))
    .filter((entry): entry is { punch: (typeof orphans)[number]; profileId: string } =>
      Boolean(entry.profileId),
    );

  const stillOrphan = (orphans ?? []).length - adoptable.length;

  console.log(`Punches with no owner       : ${(orphans ?? []).length}`);
  console.log(`  re-attachable             : ${adoptable.length}`);
  console.log(`  still unknown afterwards  : ${stillOrphan}`);

  const days = new Set(adoptable.map((a) => `${a.profileId}:${a.punch.work_date}`));
  console.log(`Attendance days to rebuild  : ${days.size}`);

  console.log("\nExamples:");
  for (const { row, profile, target } of planned.slice(0, 5)) {
    console.log(`  ${profile?.full_name}: ${row.device_user_id} -> ${target}`);
  }

  if (!APPLY) {
    console.log("\nDry run. Nothing was written. Pass --apply to commit.");
    return;
  }

  // ---- backup ------------------------------------------------------------
  if (!existsSync("backups")) mkdirSync("backups");
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const backupFile = `backups/terminal-ids-${stamp}.json`;

  writeFileSync(
    backupFile,
    JSON.stringify(
      {
        takenAt: new Date().toISOString(),
        enrolments: planned.map(({ row }) => row),
        punches: adoptable.map(({ punch }) => ({ id: punch.id, profile_id: null })),
      },
      null,
      1,
    ),
  );
  console.log(`\nBackup written to ${backupFile}`);

  // ---- 1. enrolments -----------------------------------------------------
  let fixed = 0;
  for (const { row, target } of planned) {
    const { error } = await db
      .from("device_enrollments")
      .update({ device_user_id: target })
      .eq("device_id", row.device_id)
      .eq("profile_id", row.profile_id);

    if (error) console.log(`  ! ${row.profile_id}: ${error.message}`);
    else fixed += 1;
  }
  console.log(`Enrolments corrected: ${fixed}`);

  // ---- 2. orphaned punches ----------------------------------------------
  let adopted = 0;
  for (const { punch, profileId } of adoptable) {
    const { error } = await db
      .from("punches")
      .update({ profile_id: profileId })
      .eq("id", punch.id);

    if (error) console.log(`  ! punch ${punch.id}: ${error.message}`);
    else adopted += 1;
  }
  console.log(`Punches re-attached: ${adopted}`);

  // ---- 3. rebuild the days ----------------------------------------------
  let rebuilt = 0;
  for (const key of days) {
    const [profileId, workDate] = key.split(":");
    const siteId = profileById.get(profileId as string)?.site_id;
    if (!profileId || !workDate || !siteId) continue;

    try {
      await recomputeAttendanceDay(profileId, workDate, siteId);
      rebuilt += 1;
    } catch (error) {
      console.log(`  ! ${key}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
  console.log(`Attendance days rebuilt: ${rebuilt}`);
  console.log("\nDone. To undo, from the repo root:");
  console.log(`  JITI_ALIAS='{"@":"E:/radoflow/src"}' npx jiti scripts/fix-terminal-ids.ts --revert ${backupFile}`);
}

await main();
