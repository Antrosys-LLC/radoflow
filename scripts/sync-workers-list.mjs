#!/usr/bin/env node
/**
 * Makes RadoFlow follow the office's workers list ("Company Roll." edition).
 *
 * The sheet is the authority for the people on it: name, department,
 * designation, salary and duty rule are written over what RadoFlow holds, and
 * everyone on it is made active. People are matched on the company roll, which
 * is the enrolment number (`profiles.device_pin`) and, for people imported from
 * it, the employee code.
 *
 * Where the sheet gives two people the same roll, the one whose name is closer
 * to the person RadoFlow already holds under that roll keeps it; the other is
 * added without an enrolment number. Rows with no roll are contractors, as are
 * the sheet's FIXED rows — those are contract firms, and their amount is set on
 * the department (`departments.contract_amount`), not paid as a salary.
 *
 * Never touched: anyone not on the sheet, and BILAL (roll 14), who is kept as
 * he is. Antrosys is trimmed to Umar CEO and Anas Shahid, Umar's salary is
 * cleared, and the two others are moved to Resigned and suspended.
 *
 *   node scripts/sync-workers-list.mjs "C:/path/WORKERS LIST 01.xlsx" [report.json]
 *   node scripts/sync-workers-list.mjs "C:/path/WORKERS LIST 01.xlsx" --apply
 */
import { readFileSync, writeFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

import { readWorkers } from "./lib/read-workers-xlsx.mjs";

for (const line of readFileSync(new URL("../.env.local", import.meta.url), "utf8").split(/\r?\n/)) {
  const at = line.indexOf("=");
  if (at < 1 || line.trim().startsWith("#")) continue;
  const key = line.slice(0, at).trim();
  if (!process.env[key]) process.env[key] = line.slice(at + 1).trim().replace(/^["']|["']$/g, "");
}

const APPLY = process.argv.includes("--apply");
// --only-rolls=170,298: apply a held-back roll the office has confirmed is the same person, and nothing else.
const ONLY = process.argv.find((a) => a.startsWith("--only-rolls="))?.slice(13).split(",");
const [path, reportPath] = process.argv.slice(2).filter((a) => !a.startsWith("--"));
if (!path) {
  console.error('Usage: node scripts/sync-workers-list.mjs "WORKERS LIST.xlsx" [report.json] [--apply]');
  process.exit(1);
}

const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

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

const ALIASES = { ADMINISTRAION: "ADMIN", ACCOUNT: "ACCOUNTS", "WORK SHOP": "WORKSHOP", "JIGER DRAWING": "JIGGER DRAWING" };
const deptKey = (s) => {
  const k = String(s).toUpperCase().replace(/\s+/g, " ").trim();
  return ALIASES[k] ?? k;
};
const words = (s) => String(s ?? "").toUpperCase().replace(/[^A-Z ]/g, "").split(/\s+/).filter(Boolean);
function lev(a, b) {
  const d = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)]);
  for (let j = 1; j <= b.length; j++) d[0][j] = j;
  for (let i = 1; i <= a.length; i++)
    for (let j = 1; j <= b.length; j++)
      d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
  return d[a.length][b.length];
}
/** 0..1: the best spelling match between any word of one name and any of the other. */
function nameScore(a, b) {
  let best = 0;
  for (const u of words(a)) for (const v of words(b)) best = Math.max(best, 1 - lev(u, v) / Math.max(u.length, v.length));
  return best;
}

const { people: sheet } = readWorkers(path);
const departments = await all("departments", "id, name, code, site_id, contract_amount, default_worker_type");
const deptByKey = new Map(departments.map((d) => [deptKey(d.name), d]));
const profiles = await all("profiles", "id, full_name, employee_code, device_pin, department_id, status, monthly_salary");
const byPin = new Map(profiles.filter((p) => p.device_pin).map((p) => [p.device_pin, p]));
const byCode = new Map(profiles.map((p) => [p.employee_code, p]));
const resigned = deptByKey.get("RESIGNED");
const antrosys = deptByKey.get("ANTROSYS");
const { data: site } = await db.from("sites").select("id").limit(1).single();

const report = { updates: [], creates: [], contractAmounts: [], antrosys: [], skipped: [], held: [], warnings: [] };

/** A roll is a plain number; "0", "28+8" and blanks are not enrolment numbers. */
const rollOf = (p) => (/^[1-9]\d{0,8}$/.test(p.roll) ? String(Number(p.roll)) : null);
const FIXED = (p) => /^fixed$/i.test(p.rule);

// ---- Who holds each roll ---------------------------------------------------
const rowsByRoll = new Map();
for (const p of sheet) {
  const roll = rollOf(p);
  if (roll) rowsByRoll.set(roll, [...(rowsByRoll.get(roll) ?? []), p]);
}
const holder = new Map(); // roll -> the sheet row that keeps it
for (const [roll, rows] of rowsByRoll) {
  const existing = byPin.get(roll) ?? byCode.get(roll);
  if (rows.length === 1) holder.set(roll, rows[0]);
  else {
    const best = [...rows].sort((a, b) => nameScore(existing?.full_name, b.name) - nameScore(existing?.full_name, a.name))[0];
    holder.set(roll, best);
    report.warnings.push(
      `Roll ${roll} is on ${rows.length} rows (${rows.map((r) => r.name).join(" / ")}); kept by ${best.name}`,
    );
  }
}

let nextRd = Math.max(0, ...profiles.map((p) => Number(/^RD-(\d+)$/.exec(p.employee_code)?.[1] ?? 0))) + 1;
const departmentContract = new Map();

for (const p of sheet) {
  const dept = deptByKey.get(deptKey(p.department));
  if (!dept) {
    report.warnings.push(`${p.name}: department "${p.department}" not found, skipped`);
    continue;
  }
  const roll = rollOf(p);
  const keepsRoll = roll && holder.get(roll) === p;
  const fixed = FIXED(p);
  const contractor = fixed || (!roll && p.roll !== "28+8" ? true : false);

  if (fixed) {
    departmentContract.set(dept.id, (departmentContract.get(dept.id) ?? 0) + (p.salary ?? 0));
  }

  const fields = {
    full_name: p.name,
    department_id: dept.id,
    status: "active",
  };
  if (p.designation) fields.designation = p.designation;
  if (p.salary !== null && !fixed) fields.monthly_salary = p.salary;
  if (fixed) fields.monthly_salary = 0;
  if (p.rule || contractor) {
    Object.assign(fields, {
      worker_type: contractor ? "contractor" : p.workerType,
      duty_hours: p.dutyHours,
      sunday_policy: p.sundayPolicy,
      overtime_eligible: contractor ? false : p.overtimeEligible,
      flexible_hours: p.flexibleHours,
      requires_attendance: contractor ? false : p.requiresAttendance,
    });
  }

  if (ONLY && !(keepsRoll && ONLY.includes(roll))) continue;
  const existing = keepsRoll ? (byPin.get(roll) ?? byCode.get(roll)) : null;
  if (existing) {
    if (existing.employee_code === "14" || existing.device_pin === "14") {
      report.skipped.push(`${existing.full_name} (roll 14) kept as he is`);
      continue;
    }
    /*
     * A roll the sheet gives to somebody with no resemblance to the active
     * person RadoFlow holds under it is a different human, not a respelling.
     * Their fingerprints, punches and pay belong to the old record, so it is
     * held back for the office to decide rather than renamed underneath them.
     */
    if (!ONLY && existing.status === "active" && nameScore(existing.full_name, p.name) < 0.6) {
      report.held.push(`${roll}: RadoFlow "${existing.full_name}" vs sheet "${p.name}"`);
      continue;
    }
    report.updates.push({ id: existing.id, roll, was: existing.full_name, fields });
  } else {
    const pin = keepsRoll && !byCode.has(roll) ? roll : null;
    const code = pin ?? `RD-${String(nextRd++).padStart(4, "0")}`;
    report.creates.push({
      roll: p.roll || "(none)",
      employee_code: code,
      device_pin: pin,
      fields: { ...fields, employee_code: code, device_pin: pin, pay_class: "monthly", hourly_rate: 0, site_id: site.id },
    });
  }
}

for (const [deptId, amount] of ONLY ? [] : departmentContract) {
  const d = departments.find((x) => x.id === deptId);
  report.contractAmounts.push({ id: deptId, name: d.name, from: d.contract_amount, to: amount });
}

// ---- Antrosys: Umar CEO and Anas Shahid only --------------------------------
const antro = ONLY ? [] : profiles.filter((p) => p.department_id === antrosys.id);
for (const p of antro) {
  if (["RD-0001", "RD-4000"].includes(p.employee_code)) {
    if (p.employee_code === "RD-0001" && Number(p.monthly_salary) !== 0)
      report.antrosys.push({ id: p.id, name: p.full_name, set: { monthly_salary: 0 } });
  } else {
    report.antrosys.push({ id: p.id, name: p.full_name, set: { department_id: resigned.id, status: "suspended" } });
  }
}

console.log(
  `Sheet people: ${sheet.length}\nUpdate: ${report.updates.length}\nCreate: ${report.creates.length} ` +
    `(${report.creates.filter((c) => c.fields.worker_type === "contractor").length} contractors)\n` +
    `Contract amounts: ${report.contractAmounts.map((c) => `${c.name} ${c.from}->${c.to}`).join(", ")}\n` +
    `Antrosys: ${report.antrosys.map((a) => `${a.name} ${JSON.stringify(a.set)}`).join("; ")}\n` +
    `Skipped: ${report.skipped.join("; ")}
Held back (different person at that roll): ${report.held.length}`,
);
for (const w of report.warnings) console.log(`  ! ${w}`);
if (reportPath) writeFileSync(reportPath, JSON.stringify(report, null, 1));

if (!APPLY) {
  console.log("\nDry run. Re-run with --apply to write.");
  process.exit(0);
}

let done = 0;
const failures = [];
const note = (what, error) => failures.push(`${what}: ${error.message}`);

for (const u of report.updates) {
  const { error } = await db.from("profiles").update(u.fields).eq("id", u.id);
  if (error) note(u.was, error);
  else done++;
}
for (const c of report.creates) {
  const { data: auth, error: authError } = await db.auth.admin.createUser({
    email: `${c.employee_code.toLowerCase()}@staff.invalid`,
    email_confirm: true,
    user_metadata: { full_name: c.fields.full_name },
  });
  if (authError || !auth?.user) {
    note(c.fields.full_name, authError ?? new Error("no auth row"));
    continue;
  }
  const { error } = await db.from("profiles").insert({ id: auth.user.id, ...c.fields });
  if (error) {
    await db.auth.admin.deleteUser(auth.user.id);
    note(c.fields.full_name, error);
    continue;
  }
  // app.default_requires_attendance() resets monthly staff on insert.
  await db
    .from("profiles")
    .update({ requires_attendance: c.fields.requires_attendance ?? true, worker_type: c.fields.worker_type ?? "employee" })
    .eq("id", auth.user.id);
  done++;
}
for (const c of report.contractAmounts) {
  const { error } = await db
    .from("departments")
    .update({ contract_amount: c.to, default_worker_type: "contractor" })
    .eq("id", c.id);
  if (error) note(c.name, error);
}
for (const a of report.antrosys) {
  const { error } = await db.from("profiles").update(a.set).eq("id", a.id);
  if (error) note(a.name, error);
}
console.log(`\nWrote ${done} people. Failures: ${failures.length}`);
for (const f of failures.slice(0, 30)) console.log(`  ${f}`);
