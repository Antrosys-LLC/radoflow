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
 * Re-running is safe. People are matched on the sheet's EMPLOYEE ID and updated
 * in place, so a corrected spreadsheet can be imported over an earlier run. A
 * blank salary cell is left alone rather than written as zero.
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

  /*
   * The sheet's EMPLOYEE ID is the match key and doubles as the terminal
   * enrolment number, so two rows sharing one would silently merge two people
   * into a single record — and one of them would scan as the other. Fifty-seven
   * names in this list belong to more than one person, which is exactly how a
   * lookup-by-name fills this column with duplicates. Refuse rather than guess.
   */
  const rowsByCode = new Map();
  for (const person of people) {
    if (!person.employeeCode) continue;
    rowsByCode.set(person.employeeCode, [...(rowsByCode.get(person.employeeCode) ?? []), person]);
  }
  const duplicated = [...rowsByCode].filter(([, rows]) => rows.length > 1);
  const missing = people.filter((p) => !p.employeeCode);

  if (duplicated.length > 0) {
    console.error(`${duplicated.length} EMPLOYEE IDs are used by more than one row:`);
    for (const [code, rows] of duplicated) {
      console.error(`  ${code}: ${rows.map((p) => `${p.name} (${p.department})`).join(" / ")}`);
    }
    throw new Error("Give every row its own EMPLOYEE ID, then import again.");
  }

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

  let created = 0;
  let updated = 0;
  let failed = 0;
  const problems = missing.map((p) => `${p.name} (${p.department}): no EMPLOYEE ID, skipped`);

  for (const person of people) {
    if (!person.employeeCode) continue;

    const code = person.employeeCode;
    const existing = byCode.get(code);
    const profile = {
      employee_code: code,
      full_name: person.name,
      site_id: site.id,
      department_id: deptId.get(person.department) ?? null,
      pay_class: "monthly",
      hourly_rate: 0,
      worker_type: person.workerType,
      duty_hours: person.dutyHours,
      sunday_policy: person.sundayPolicy,
      overtime_eligible: person.overtimeEligible,
      flexible_hours: person.flexibleHours,
      requires_attendance: person.requiresAttendance,
    };
    if (person.designation) profile.designation = person.designation;
    if (person.salary !== null) profile.monthly_salary = person.salary;
    else if (!existing) profile.monthly_salary = 0;
    if (/^[0-9]{1,9}$/.test(person.terminalId))
      profile.device_pin = String(Number(person.terminalId));

    if (dryRun) {
      if (existing) updated++;
      else created++;
      continue;
    }

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

    // app.default_requires_attendance() resets monthly staff to false on insert.
    await db
      .from("profiles")
      .update({ requires_attendance: person.requiresAttendance, worker_type: person.workerType })
      .eq("id", authUser.user.id);

    created++;
    if (created % 50 === 0) console.log(`  … ${created} created`);
  }

  console.log(`\nPeople: ${created} created, ${updated} updated, ${failed} failed.`);

  if (problems.length > 0) {
    console.log("\nProblems:");
    for (const p of problems.slice(0, 20)) console.log(`  ${p}`);
    if (problems.length > 20) console.log(`  … ${problems.length - 20} more`);
  }

  const totalSalary = people.reduce((t, p) => t + (p.salary ?? 0), 0);
  console.log(`\nMonthly salary across the sheet: Rs ${totalSalary.toLocaleString("en-PK")}`);
  console.log(`Rows with no salary filled in: ${people.filter((p) => p.salary === null).length}`);
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
