#!/usr/bin/env node
/**
 * Imports the factory's workers list into RadoFlow.
 *
 * Reads the same spreadsheet the office keeps by hand, and creates the
 * departments and the people in it, with each person's pay arrangement read
 * out of the sheet's free-text duty column.
 *
 * Every person gets an auth row, because profiles.id is a foreign key to it and
 * thirty row-level-security policies resolve identity through that join —
 * decoupling them is a change to production security, not an import detail.
 * Those rows are created WITHOUT a password and WITHOUT a CNIC, so neither
 * sign-in path can reach them: they are employee records, not accounts. To give
 * someone access later, set their CNIC and a password from the people screen.
 *
 * Re-running is safe. People are matched on employee code and updated in place,
 * so a corrected spreadsheet can be imported over the top of an earlier run.
 *
 * Usage:
 *   node scripts/import-workers.mjs "C:/path/WORKERS LIST.xlsx" [--dry-run]
 */

import { existsSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

import { readWorkers } from "./lib/read-workers-xlsx.mjs";

const envFile = new URL("../.env.local", import.meta.url);
if (existsSync(envFile)) process.loadEnvFile(envFile);

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

const [path] = process.argv.slice(2).filter((a) => !a.startsWith("--"));
const dryRun = process.argv.includes("--dry-run");

if (!url || !serviceKey) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY.");
  process.exit(1);
}
if (!path) {
  console.error('Usage: node scripts/import-workers.mjs "path/to/WORKERS LIST.xlsx" [--dry-run]');
  process.exit(1);
}

const db = createClient(url, serviceKey, { auth: { persistSession: false } });

/**
 * Sheet spellings that mean a department already in the database.
 *
 * The workbook is typed by hand and carries its own spellings — "Administraion",
 * "Jiger Drawing". Importing those verbatim would create a second department
 * beside each existing one, splitting a single team's headcount and payroll in
 * two. The database spelling wins; this only decides which row to file into.
 */
const DEPARTMENT_ALIASES = new Map([
  ["administraion", "Admin"],
  ["account", "Accounts"],
  ["work shop", "Workshop"],
  ["jiger drawing", "Jigger Drawing"],
]);

/** A department code from its name: first letters, uppercase, at most 8. */
function codeFor(name, taken) {
  const base =
    name
      .replace(/[^A-Za-z0-9 ]/g, "")
      .split(/\s+/)
      .map((w) => w.slice(0, 4))
      .join("")
      .toUpperCase()
      .slice(0, 8) || "DEPT";

  let code = base;
  let n = 2;
  while (taken.has(code)) code = `${base.slice(0, 6)}${n++}`;
  taken.add(code);
  return code;
}

async function main() {
  const { people, departments } = readWorkers(path);
  console.log(
    `Read ${people.length} people in ${departments.length} departments from the sheet.\n`,
  );

  const { data: site } = await db.from("sites").select("id, name").limit(1).maybeSingle();
  if (!site) throw new Error("No factory exists yet. Run create-admin first.");
  console.log(`Importing into "${site.name}".`);

  // ---- Departments -------------------------------------------------------
  const { data: existingDepts } = await db
    .from("departments")
    .select("id, code, name")
    .eq("site_id", site.id);

  const byName = new Map((existingDepts ?? []).map((d) => [d.name.toLowerCase(), d]));
  const takenCodes = new Set((existingDepts ?? []).map((d) => d.code));
  const deptId = new Map();
  let createdDepts = 0;

  for (const dept of departments) {
    const alias = DEPARTMENT_ALIASES.get(dept.name.toLowerCase());
    const target = alias ?? dept.name;
    const found = byName.get(target.toLowerCase());

    if (found) {
      deptId.set(dept.name, found.id);
      if (alias) console.log(`  "${dept.name}" filed into the existing "${found.name}"`);
      continue;
    }

    if (dryRun) {
      deptId.set(dept.name, "dry-run");
      createdDepts++;
      continue;
    }

    const { data, error } = await db
      .from("departments")
      .insert({ site_id: site.id, code: codeFor(target, takenCodes), name: target })
      .select("id")
      .single();

    if (error) throw new Error(`Could not create department ${target}: ${error.message}`);
    deptId.set(dept.name, data.id);
    createdDepts++;
  }

  console.log(
    `Departments: ${createdDepts} created, ${departments.length - createdDepts} already present.\n`,
  );

  // ---- People ------------------------------------------------------------
  const { data: existingPeople } = await db.from("profiles").select("id, employee_code, full_name");

  const byCode = new Map((existingPeople ?? []).map((p) => [p.employee_code, p]));

  /*
   * Employee codes are assigned by position in the sheet, not derived from the
   * name: fifty-seven names in this list are shared by two or more people, so
   * a name-based code would collide and silently merge their records. The code
   * doubles as the terminal enrolment id, so it has to be stable and unique.
   */
  let created = 0;
  let updated = 0;
  let failed = 0;
  const problems = [];

  for (const [index, person] of people.entries()) {
    const code = `RD-${String(2000 + index).padStart(4, "0")}`;
    const profile = {
      employee_code: code,
      full_name: person.name,
      designation: person.designation || null,
      site_id: site.id,
      department_id: deptId.get(person.department) ?? null,
      pay_class: "monthly",
      monthly_salary: person.salary,
      hourly_rate: 0,
      worker_type: person.workerType,
      duty_hours: person.dutyHours,
      sunday_policy: person.sundayPolicy,
      overtime_eligible: person.overtimeEligible,
      flexible_hours: person.flexibleHours,
      requires_attendance: person.requiresAttendance,
    };

    if (dryRun) {
      created++;
      continue;
    }

    const existing = byCode.get(code);

    if (existing) {
      const { error } = await db.from("profiles").update(profile).eq("id", existing.id);
      if (error) {
        failed++;
        problems.push(`${code} ${person.name}: ${error.message}`);
      } else {
        updated++;
      }
      continue;
    }

    /*
     * No password: an account with none cannot be signed into, which is the
     * intent. The address is synthetic and undeliverable by design — .invalid
     * is reserved by RFC 2606 precisely so it can never reach anyone.
     */
    const { data: authUser, error: authError } = await db.auth.admin.createUser({
      email: `${code.toLowerCase()}@staff.invalid`,
      email_confirm: true,
      user_metadata: { full_name: person.name },
    });

    if (authError || !authUser?.user) {
      failed++;
      problems.push(`${code} ${person.name}: ${authError?.message ?? "no auth row"}`);
      continue;
    }

    const { error } = await db.from("profiles").insert({ id: authUser.user.id, ...profile });

    if (error) {
      // Roll the login back rather than strand an auth row with no employee.
      await db.auth.admin.deleteUser(authUser.user.id);
      failed++;
      problems.push(`${code} ${person.name}: ${error.message}`);
      continue;
    }

    created++;
    if (created % 50 === 0) console.log(`  … ${created} created`);
  }

  console.log(`\nPeople: ${created} created, ${updated} updated, ${failed} failed.`);

  if (problems.length > 0) {
    console.log("\nProblems:");
    for (const p of problems.slice(0, 20)) console.log(`  ${p}`);
    if (problems.length > 20) console.log(`  … ${problems.length - 20} more`);
  }

  const totalSalary = people.reduce((t, p) => t + p.salary, 0);
  console.log(`\nMonthly salary across the sheet: Rs ${totalSalary.toLocaleString("en-PK")}`);
  console.log(`People on no overtime: ${people.filter((p) => !p.overtimeEligible).length}`);
  console.log(`Contractors: ${people.filter((p) => p.workerType === "contractor").length}`);
  console.log(`Not paid from attendance: ${people.filter((p) => !p.requiresAttendance).length}`);
  console.log(`Twelve-hour duty: ${people.filter((p) => p.dutyHours === 12).length}`);

  if (dryRun) console.log("\nDRY RUN — nothing was written.");
  else console.log("\nNobody imported here can sign in: they have no CNIC and no password.");
}

try {
  await main();
} catch (error) {
  process.exitCode = 1;
  console.error(`\n✗ ${error instanceof Error ? error.message : error}`);
}
