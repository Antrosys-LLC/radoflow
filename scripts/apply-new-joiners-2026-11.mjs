#!/usr/bin/env node
/**
 * Applies New_Joiners.xlsx (Nov 2026) to RadoFlow.
 *
 * The sheet mixes three different things under one "New Joiners" heading, sorted
 * out by hand against the current profiles before this file was written:
 *
 *   - CREATE:   a roll number nobody currently holds. A brand new profile.
 *   - HANDOVER: a roll number held by someone with a different name and a
 *     different salary/designation. The reused-number rule: the current holder
 *     is terminated (left_on = the new joiner's joining date), the new joiner
 *     gets the number and the employee code, and punches/meals/attendance from
 *     that date move across.
 *   - UPDATE:   the roll's current holder is the SAME person the sheet
 *     describes (name, designation or salary match closely enough, or the
 *     sheet says so directly — e.g. "Promoted from Helper"). Just fills in
 *     what the sheet adds (full name, CNIC, designation, salary). No
 *     termination, no record moving.
 *
 * Deliberately does NOT touch person_biometrics or queue a terminal delete: the
 * office asked to leave the fingerprint hardware alone. Clearing a handover's
 * device_enrollments row (not the biometric template) is the same mechanism
 * apply-workers-list.mjs uses so the corrected name reaches the terminal on the
 * next resync, without a re-enrolment.
 *
 *   node scripts/apply-new-joiners-2026-11.mjs            # dry run
 *   node scripts/apply-new-joiners-2026-11.mjs --apply
 *
 * Already run once (2026-11-14): the first pass correctly terminated every
 * handover's old holder and updated the four same-person profiles, but wrote
 * each new joiner's profile with `.update()`. This project's profiles row is
 * not auto-created from an auth.users trigger, so that silently matched zero
 * rows — `.insert()`, below, is the fix. Re-running now is a no-op: every roll
 * already has a holder, so the plan reports "already has a holder" for all of
 * them and refuses to apply.
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
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

const letters = (s) => String(s ?? "").toUpperCase().replace(/[^A-Z]/g, "");

/** Shared duty rule for every ordinary shift worker in this sheet (Helper/Fitter/Fanman/K-Man/Sweeper). */
const DUTY_DEFAULT = {
  worker_type: "employee",
  duty_hours: 8,
  sunday_policy: "off",
  overtime_eligible: true,
  flexible_hours: false,
  requires_attendance: true,
  status: "active",
};

// ---- CREATE: a roll number nobody currently holds ---------------------------
const CREATES = [
  {
    roll: "39",
    full_name: "Nadir",
    cnic: null,
    designation: "Sweeper",
    monthly_salary: 27500,
    deptCode: "SWEEP",
    joined_on: "2026-11-05",
  },
  {
    roll: "306",
    full_name: "Mukaram Hasnian",
    cnic: "35201-1809106-5",
    designation: "Helper",
    monthly_salary: 25000,
    deptCode: "AUTO2",
    joined_on: "2026-11-09",
  },
  {
    roll: "165",
    full_name: "Muhammad Ismail",
    cnic: "35102-4096660-1",
    designation: "Helper",
    monthly_salary: 25000,
    deptCode: "KARADR",
    joined_on: "2026-11-05",
  },
];

// ---- HANDOVER: a different person currently holds the number ----------------
// department is inherited from the current holder (the role/slot is department-specific).
const HANDOVERS = [
  { roll: "232", full_name: "Muhammad Asim", cnic: "33204-0541986-3", designation: "Helper", monthly_salary: 25000, joined_on: "2026-10-31" },
  { roll: "242", full_name: "Syed Safi Ullah", cnic: "21603-9343407-1", designation: "Helper", monthly_salary: 25000, joined_on: "2026-11-03" },
  { roll: "329", full_name: "Muhammad Bilal", cnic: "35201-4572236-7", designation: "Helper", monthly_salary: 25000, joined_on: "2026-10-31" },
  { roll: "87", full_name: "Muhammad Jamil", cnic: "35202-2270595-7", designation: "Fitter", monthly_salary: 44700, joined_on: "2026-11-01" },
  { roll: "366", full_name: "Gull Ameer", cnic: "14301-0385397-3", designation: "Helper", monthly_salary: 25000, joined_on: "2026-11-07" },
  { roll: "274", full_name: "Muhammad Ijaz", cnic: "36203-8721532-5", designation: "Fanman", monthly_salary: 30600, joined_on: "2026-11-05" },
  { roll: "381", full_name: "Sabir Rahman", cnic: "21508-0345236-5", designation: "Helper", monthly_salary: 25000, joined_on: "2026-11-11" },
  { roll: "384", full_name: "Bu Khan", cnic: "21508-8425341-3", designation: "Helper", monthly_salary: 25000, joined_on: "2026-11-11" },
  { roll: "125", full_name: "Muhammad Aslam Javed", cnic: "33203-1473549-9", designation: "K/Man", monthly_salary: 50000, joined_on: "2026-11-09" },
  { roll: "386", full_name: "Atif Rahman", cnic: "14101-4373240-1", designation: "Helper", monthly_salary: 25000, joined_on: "2026-11-01" },
];

// ---- UPDATE: same person already in RadoFlow, sheet just fills them in ------
// department is left untouched (set separately for 494, already correct for the rest).
const UPDATES = [
  { roll: "367", full_name: "Muhammad Farooq", cnic: "21602-1590208-1", designation: "Helper", monthly_salary: 25000 },
  { roll: "494", full_name: "Aaqib", cnic: "41803-0619351-7", designation: "Helper", monthly_salary: 25000, requires_attendance: true },
  { roll: "88", full_name: "Muhammad Imtiaz", cnic: "33102-4796953-7" },
  { roll: "451", full_name: "Muhammad Shaiq Ashraf", cnic: "31304-9965017-5", designation: "Assistant Operator", monthly_salary: 40500 },
];

async function all(table, select) {
  const rows = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await db.from(table).select(select).range(from, from + 999);
    if (error) throw new Error(`${table}: ${error.message}`);
    rows.push(...data);
    if (data.length < 1000) break;
  }
  return rows;
}

const departments = await all("departments", "id, name, code");
const deptByCode = new Map(departments.map((d) => [d.code, d]));
const profiles = await all("profiles", "*");
const holderOf = (pin) => profiles.find((p) => p.device_pin === pin) ?? null;

const usedCodes = new Set(profiles.map((p) => p.employee_code));
const freeOldCode = (name) => {
  let code = `OLD-${letters(name) || "X"}`;
  for (let suffix = "B"; usedCodes.has(code); suffix = String.fromCharCode(suffix.charCodeAt(0) + 1)) {
    code = `OLD-${letters(name)}${suffix}`;
  }
  usedCodes.add(code);
  return code;
};

const problems = [];
const plan = { creates: [], handovers: [], updates: [] };

for (const c of CREATES) {
  if (holderOf(c.roll)) {
    problems.push(`CREATE ${c.roll} (${c.full_name}): roll is already held — not a brand-new PIN`);
    continue;
  }
  const dept = deptByCode.get(c.deptCode);
  if (!dept) {
    problems.push(`CREATE ${c.roll}: department code "${c.deptCode}" not found`);
    continue;
  }
  plan.creates.push({ ...c, department_id: dept.id });
}

for (const h of HANDOVERS) {
  const old = holderOf(h.roll);
  if (!old) {
    problems.push(`HANDOVER ${h.roll} (${h.full_name}): nobody currently holds this roll`);
    continue;
  }
  if (old.status !== "active") {
    problems.push(`HANDOVER ${h.roll}: current holder ${old.full_name} is already ${old.status}`);
    continue;
  }
  plan.handovers.push({ ...h, old, department_id: old.department_id });
}

for (const u of UPDATES) {
  const profile = holderOf(u.roll);
  if (!profile) {
    problems.push(`UPDATE ${u.roll} (${u.full_name}): nobody currently holds this roll`);
    continue;
  }
  const { roll: _roll, ...fields } = u;
  plan.updates.push({ profile, fields });
}

// ---- Report ------------------------------------------------------------------
console.log(`CREATE (${plan.creates.length})`);
for (const c of plan.creates) {
  console.log(`  ${c.roll}: ${c.full_name} — ${c.designation}, Rs ${c.monthly_salary}, joined ${c.joined_on}`);
}
console.log(`\nHANDOVER (${plan.handovers.length})`);
for (const h of plan.handovers) {
  console.log(
    `  ${h.roll}: ${h.old.full_name} [terminated ${h.joined_on}] -> ${h.full_name} (${h.designation}, Rs ${h.monthly_salary}, joined ${h.joined_on})`,
  );
}
console.log(`\nUPDATE, same person (${plan.updates.length})`);
for (const u of plan.updates) {
  console.log(`  ${u.profile.device_pin}: ${u.profile.full_name} -> ${JSON.stringify(u.fields)}`);
}
console.log(`\nPROBLEMS (${problems.length})`);
for (const p of problems) console.log(`  ! ${p}`);

if (!APPLY) {
  console.log("\nDry run. Re-run with --apply to write.");
  process.exit(0);
}
if (problems.length) {
  console.error("\nRefusing to apply with unresolved problems above.");
  process.exit(1);
}

// ---- Apply ---------------------------------------------------------------
mkdirSync(new URL("../backups/", import.meta.url), { recursive: true });
const stamp = new Date().toISOString().replace(/[:.]/g, "-");
writeFileSync(
  new URL(`../backups/profiles-before-new-joiners-${stamp}.json`, import.meta.url),
  JSON.stringify(profiles, null, 1),
);

const failures = [];
const recompute = [];

const { data: oneExisting } = await db.from("profiles").select("site_id").limit(1).single();
const SITE_ID = oneExisting.site_id;

async function createProfile(fields) {
  const email = `new-joiner-${fields.employee_code}-${stamp}@radoflow.invalid`;
  const { data: created, error: authError } = await db.auth.admin.createUser({
    email,
    email_confirm: true,
    user_metadata: { full_name: fields.full_name },
  });
  if (authError || !created?.user) return { error: authError?.message ?? "no auth row" };

  const { error } = await db.from("profiles").insert({ id: created.user.id, site_id: SITE_ID, pay_class: "monthly", ...fields });
  if (error) {
    await db.auth.admin.deleteUser(created.user.id);
    return { error: error.message };
  }
  return { id: created.user.id };
}

for (const c of plan.creates) {
  const result = await createProfile({
    full_name: c.full_name,
    cnic: c.cnic,
    designation: c.designation,
    monthly_salary: c.monthly_salary,
    department_id: c.department_id,
    joined_on: c.joined_on,
    device_pin: c.roll,
    employee_code: c.roll,
    ...DUTY_DEFAULT,
  });
  if (result.error) failures.push(`CREATE ${c.roll}: ${result.error}`);
  else console.log(`CREATE ${c.roll}: ${c.full_name} created (${result.id})`);
}

for (const h of plan.handovers) {
  const tag = `${h.roll} ${h.full_name}`;

  const oldOk = await db
    .from("profiles")
    .update({ device_pin: null, employee_code: freeOldCode(h.old.full_name), status: "terminated", left_on: h.joined_on })
    .eq("id", h.old.id);
  if (oldOk.error) {
    failures.push(`${tag}: end ${h.old.full_name}: ${oldOk.error.message}`);
    continue;
  }

  const result = await createProfile({
    full_name: h.full_name,
    cnic: h.cnic,
    designation: h.designation,
    monthly_salary: h.monthly_salary,
    department_id: h.department_id,
    joined_on: h.joined_on,
    device_pin: h.roll,
    employee_code: h.roll,
    ...DUTY_DEFAULT,
  });
  if (result.error) {
    failures.push(`${tag}: ${result.error}`);
    continue;
  }
  const newId = result.id;

  // What the number recorded from the date on belongs to the new joiner.
  const { data: moved, error: punchError } = await db
    .from("punches")
    .update({ profile_id: newId })
    .eq("device_user_id", h.roll)
    .eq("profile_id", h.old.id)
    .gte("work_date", h.joined_on)
    .select("id, work_date");
  if (punchError) failures.push(`${tag}: punches: ${punchError.message}`);
  for (const d of new Set((moved ?? []).map((r) => r.work_date))) {
    recompute.push({ profile_id: newId, work_date: d });
  }

  const { error: dayError } = await db
    .from("attendance_days")
    .delete()
    .eq("profile_id", h.old.id)
    .gte("work_date", h.joined_on)
    .eq("is_manual", false)
    .eq("locked", false);
  if (dayError) failures.push(`${tag}: old days: ${dayError.message}`);

  for (const [table, col] of [
    ["meal_claims", "served_on"],
    ["meal_scan_log", "scanned_at"],
  ]) {
    const from = table === "meal_claims" ? h.joined_on : `${h.joined_on}T00:00:00+05:00`;
    const { error: mealError } = await db
      .from(table)
      .update({ profile_id: newId })
      .eq("device_user_id", h.roll)
      .eq("profile_id", h.old.id)
      .gte(col, from);
    if (mealError) failures.push(`${tag}: ${table}: ${mealError.message}`);
  }

  // Clears RadoFlow's own bookkeeping only, so the next resync pushes the new
  // name to the terminal. Does not touch person_biometrics (the fingerprint),
  // and queues no delete command to the terminal itself.
  await db.from("device_enrollments").delete().eq("device_user_id", h.roll);

  console.log(`${tag}: ${moved?.length ?? 0} punches moved, old holder terminated`);
}

for (const u of plan.updates) {
  const { error } = await db.from("profiles").update(u.fields).eq("id", u.profile.id);
  if (error) failures.push(`UPDATE ${u.profile.device_pin}: ${error.message}`);
  else console.log(`UPDATE ${u.profile.device_pin}: ${u.profile.full_name} -> ${JSON.stringify(u.fields)}`);
}

writeFileSync(new URL(`../backups/days-to-recompute-${stamp}.json`, import.meta.url), JSON.stringify(recompute));
console.log(`\nDays to rebuild: ${recompute.length} (backups/days-to-recompute-${stamp}.json)`);
console.log(`\nFailures: ${failures.length}`);
for (const f of failures) console.log(`  ${f}`);
