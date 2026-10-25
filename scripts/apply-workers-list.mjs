#!/usr/bin/env node
/**
 * Makes RadoFlow and the terminals follow the office's workers list, including
 * the rule for a number that two people have held.
 *
 * THE REUSED-NUMBER RULE
 *   Where the sheet gives one number to two people, the row WITH a joining date
 *   is the new joiner and the row WITHOUT one is the person who resigned on that
 *   date. Everything the number recorded before the date belongs to the old
 *   person; everything from the date on belongs to the new one. So for each such
 *   number this script
 *     - ends the old person (terminated, left_on = the date, no terminal number,
 *       employee code OLD-<LETTERS> so the number is free),
 *     - gives the number and the employee code to the new person,
 *     - moves punches, meals and enrolment mappings dated on or after the date
 *       from the old person to the new one,
 *     - removes the old person's attendance days from the date on and rebuilds
 *       the new person's (written to a file for scripts/recompute-days.ts).
 *   The terminals follow through the database triggers: the number is deleted
 *   and re-enrolled under the new name.
 *
 * NOBODY ABOVE 493
 *   Only Umar (10000) may hold a larger number on the machines. People the sheet
 *   gives no number to keep their RadoFlow profile, lose their terminal number
 *   and get an employee code with no digits (a digit would make the database
 *   derive a terminal number from it again). A final sweep queues a delete for
 *   every user above 493 that a terminal reports holding.
 *
 *   node scripts/apply-workers-list.mjs "WORKERS LIST 01.xlsx"            # dry run
 *   node scripts/apply-workers-list.mjs "WORKERS LIST 01.xlsx" --apply
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

import { readWorkers } from "./lib/read-workers-xlsx.mjs";

for (const line of readFileSync(new URL("../.env.local", import.meta.url), "utf8").split(/\r?\n/)) {
  const at = line.indexOf("=");
  if (at < 1 || line.trim().startsWith("#")) continue;
  const key = line.slice(0, at).trim();
  if (!process.env[key]) process.env[key] = line.slice(at + 1).trim().replace(/^["']|["']$/g, "");
}

const APPLY = process.argv.includes("--apply");
const path = process.argv.slice(2).find((a) => !a.startsWith("--"));
if (!path) {
  console.error('Usage: node scripts/apply-workers-list.mjs "WORKERS LIST.xlsx" [--apply]');
  process.exit(1);
}

const LIMIT = 493;
const KEEP_ABOVE = new Set(["10000"]);

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

const letters = (s) => String(s ?? "").toUpperCase().replace(/[^A-Z]/g, "");
const ALIASES = { ADMINISTRAION: "ADMIN", ACCOUNT: "ACCOUNTS", "WORK SHOP": "WORKSHOP", "JIGER DRAWING": "JIGGER DRAWING" };
const deptKey = (s) => {
  const k = String(s).toUpperCase().replace(/\s+/g, " ").trim();
  return ALIASES[k] ?? k;
};
const isoDate = (t) => {
  const m = /^(\d{1,2})\.(\d{1,2})\.(\d{4})$/.exec(String(t ?? "").trim());
  return m ? `${m[3]}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}` : null;
};
const rollOf = (p) => (/^[1-9]\d{0,8}$/.test(p.roll) ? String(Number(p.roll)) : null);

const { people: sheet } = readWorkers(path);
const departments = await all("departments", "id, name");
const deptByKey = new Map(departments.map((d) => [deptKey(d.name), d]));
const profiles = await all("profiles", "*");
const byId = new Map(profiles.map((p) => [p.id, p]));
const holderOf = (pin) => profiles.find((p) => p.device_pin === pin) ?? null;

const problems = [];
const plan = { handovers: [], updates: [], removeNumber: [], merge: [], deletions: [] };

/** What the sheet says about a person, as profile columns. */
function fieldsFor(row, dept) {
  const fixed = /^fixed$/i.test(row.rule);
  const contractor = fixed || !rollOf(row);
  const f = { full_name: row.name, department_id: dept.id, status: "active" };
  if (row.designation) f.designation = row.designation;
  if (row.salary !== null && !fixed) f.monthly_salary = row.salary;
  if (fixed) f.monthly_salary = 0;
  if (row.rule) {
    Object.assign(f, {
      worker_type: fixed ? "contractor" : row.workerType,
      duty_hours: row.dutyHours,
      sunday_policy: row.sundayPolicy,
      overtime_eligible: fixed ? false : row.overtimeEligible,
      flexible_hours: row.flexibleHours,
      requires_attendance: fixed ? false : row.requiresAttendance,
    });
  }
  const date = isoDate(row.joinedText);
  if (date) f.joined_on = date;
  return f;
}
const changed = (profile, fields) =>
  Object.fromEntries(
    Object.entries(fields).filter(([k, v]) => {
      const cur = profile[k];
      return typeof v === "number" ? Number(cur) !== v : cur !== v;
    }),
  );

// ---- Group the sheet by roll ------------------------------------------------
const groups = new Map();
for (const row of sheet) {
  const roll = rollOf(row);
  if (roll) groups.set(roll, [...(groups.get(roll) ?? []), row]);
}
const departmentOf = (row) => {
  const d = deptByKey.get(deptKey(row.department));
  if (!d) problems.push(`${row.name}: department "${row.department}" not found`);
  return d;
};

const taken = new Set(); // profile ids already claimed by a rule

for (const [roll, rows] of groups) {
  const dated = rows.filter((r) => isoDate(r.joinedText));
  const undated = rows.filter((r) => !isoDate(r.joinedText));

  if (rows.length === 1) {
    const row = rows[0];
    const dept = departmentOf(row);
    const holder = holderOf(roll);
    if (!dept) continue;
    if (!holder) {
      problems.push(`Roll ${roll} (${row.name}) has no profile`);
      continue;
    }
    if (letters(holder.full_name) !== letters(row.name))
      problems.push(`Roll ${roll}: RadoFlow has "${holder.full_name}", sheet has "${row.name}" (renamed to the sheet)`);
    plan.updates.push({ profile: holder, fields: changed(holder, fieldsFor(row, dept)) });
    taken.add(holder.id);
    continue;
  }

  // Roll 110: two undated rows. The office confirmed M RABEE keeps it and the
  // other row (Asif Hameed) is the person already enrolled as 115.
  if (dated.length === 0) {
    const holder = holderOf(roll);
    const mine = rows.find((r) => letters(r.name) === letters(holder?.full_name));
    const other = rows.find((r) => r !== mine);
    if (!holder || !mine) {
      problems.push(`Roll ${roll}: cannot tell who holds it`);
      continue;
    }
    plan.updates.push({ profile: holder, fields: changed(holder, fieldsFor(mine, departmentOf(mine))) });
    taken.add(holder.id);
    const asif = profiles.find((p) => p.device_pin === "115" && letters(p.full_name) === letters(other.name));
    if (asif) {
      plan.updates.push({ profile: asif, fields: changed(asif, fieldsFor(other, departmentOf(other))) });
      taken.add(asif.id);
    }
    continue;
  }

  if (dated.length !== 1 || undated.length !== 1) {
    problems.push(`Roll ${roll}: ${dated.length} dated and ${undated.length} undated rows, not handled`);
    continue;
  }

  // ---- A reused number ------------------------------------------------------
  const [N] = dated;
  const [O] = undated;
  const D = isoDate(N.joinedText);
  const holder = holderOf(roll);
  const high = (p) => Number(p.device_pin) > LIMIT;

  const newCandidates = profiles.filter(
    (p) => letters(p.full_name) === letters(N.name) && p.joined_on === D && (p.device_pin === roll || high(p)),
  );
  if (newCandidates.length !== 1) {
    problems.push(`Roll ${roll}: found ${newCandidates.length} profiles for new joiner ${N.name} (${D})`);
    continue;
  }
  const next = newCandidates[0];

  let old = holder && holder.id !== next.id ? holder : null;
  if (!old) {
    const olds = profiles.filter((p) => letters(p.full_name) === letters(O.name) && high(p) && p.status === "active" && p.id !== next.id);
    if (olds.length === 1) old = olds[0];
  }
  if (old && letters(old.full_name) !== letters(O.name))
    problems.push(`Roll ${roll}: current holder "${old.full_name}" is not the sheet's "${O.name}"`);

  const dept = departmentOf(N);
  if (!dept) continue;
  plan.handovers.push({ roll, date: D, next, old, nextFields: fieldsFor(N, dept), oldRow: O });
  taken.add(next.id);
  if (old) taken.add(old.id);
}

// ---- People the sheet gives no number to -----------------------------------
for (const row of sheet.filter((r) => !rollOf(r))) {
  const dept = departmentOf(row);
  if (!dept) continue;

  // SHEHROOZ KHAN's second line is his HOUSE RENT, not a second person.
  const holderPerson = profiles.find((p) => p.device_pin === "417");
  if (/house rent/i.test(row.designation) && holderPerson && letters(holderPerson.full_name) === letters(row.name)) {
    const extra = profiles.find((p) => p.id !== holderPerson.id && letters(p.full_name) === letters(row.name) && Number(p.device_pin) > LIMIT);
    plan.merge.push({ into: holderPerson, extra, rent: row.salary ?? 0 });
    if (extra) taken.add(extra.id);
    continue;
  }

  const found = profiles.filter(
    (p) => !taken.has(p.id) && letters(p.full_name) === letters(row.name) && p.department_id === dept.id && (Number(p.device_pin) > LIMIT || !p.device_pin) && p.status === "active",
  );
  if (found.length !== 1) {
    problems.push(`${row.name} (${row.department}): found ${found.length} profiles`);
    continue;
  }
  taken.add(found[0].id);
  plan.removeNumber.push({ profile: found[0], fields: fieldsFor(row, dept) });
}

// Everyone else above 493 who is active: no terminal number either.
for (const p of profiles) {
  if (taken.has(p.id) || !p.device_pin || KEEP_ABOVE.has(p.device_pin) || Number(p.device_pin) <= LIMIT) continue;
  if (p.status !== "active") continue;
  // A duplicate the last sync made for a number it could not give (Asif Hameed
  // 607, the person already enrolled as 115) is deleted if it holds no records.
  const dup = profiles.find((q) => q.id !== p.id && q.status === "active" && letters(q.full_name) === letters(p.full_name) && Number(q.device_pin) <= LIMIT);
  let records = 0;
  if (dup) {
    for (const t of ["punches", "attendance_days", "meal_claims", "payroll_items"]) {
      const { count } = await db.from(t).select("*", { count: "exact", head: true }).eq("profile_id", p.id);
      records += count ?? 0;
    }
  }
  if (dup && records === 0) plan.deletions.push({ profile: p, same: dup });
  else plan.removeNumber.push({ profile: p, fields: {} });
  taken.add(p.id);
}

// ---- Report ----------------------------------------------------------------
const nm = (p) => `${p.full_name} (${p.device_pin ?? "-"})`;
console.log(`Sheet people: ${sheet.length}`);
console.log(`\nHANDOVERS (${plan.handovers.length})`);
for (const h of plan.handovers)
  console.log(`  ${h.roll}: ${h.old ? nm(h.old) : "(nobody on it)"} leaves, ${nm(h.next)} takes it from ${h.date}`);
console.log(`\nREMOVED FROM THE MACHINES, KEPT IN RADOFLOW (${plan.removeNumber.length})`);
for (const r of plan.removeNumber) console.log(`  ${nm(r.profile)} ${r.profile.status}`);
console.log(`\nMERGE`);
for (const m of plan.merge)
  console.log(`  ${m.into.full_name}: salary ${m.into.monthly_salary} + house rent ${m.rent} = ${Number(m.into.monthly_salary) + m.rent}; delete ${m.extra ? nm(m.extra) : "(none)"}`);
const touched = plan.updates.filter((u) => Object.keys(u.fields).length);
console.log(`\nDETAILS UPDATED from the sheet: ${touched.length} people`);
for (const u of touched.slice(0, 40)) console.log(`  ${nm(u.profile)} ${JSON.stringify(u.fields)}`);
if (touched.length > 40) console.log(`  … and ${touched.length - 40} more`);
console.log(`\nPROBLEMS (${problems.length})`);
for (const p of problems) console.log(`  ! ${p}`);

if (!APPLY) {
  console.log("\nDry run. Re-run with --apply to write.");
  process.exit(0);
}
if (problems.some((p) => /found \d+ profiles|cannot tell|not handled|has no profile/.test(p))) {
  console.error("\nRefusing to apply with unresolved problems above.");
  process.exit(1);
}

// ---- Apply -----------------------------------------------------------------
mkdirSync(new URL("../backups/", import.meta.url), { recursive: true });
const stamp = new Date().toISOString().replace(/[:.]/g, "-");
writeFileSync(new URL(`../backups/profiles-before-workers-list-${stamp}.json`, import.meta.url), JSON.stringify(profiles, null, 1));

const failures = [];
const upd = async (id, fields, what) => {
  if (Object.keys(fields).length === 0) return true;
  const { error } = await db.from("profiles").update(fields).eq("id", id);
  if (error) {
    failures.push(`${what}: ${error.message}`);
    return false;
  }
  return true;
};
const usedCodes = new Set(profiles.map((p) => p.employee_code));
const freeCode = (prefix, name) => {
  let code = `${prefix}-${letters(name) || "X"}`;
  for (let suffix = "B"; usedCodes.has(code); suffix = String.fromCharCode(suffix.charCodeAt(0) + 1)) code = `${prefix}-${letters(name)}${suffix}`;
  usedCodes.add(code);
  return code;
};
const recompute = [];
const movedLog = [];

for (const h of plan.handovers) {
  const tag = `${h.roll} ${h.next.full_name}`;

  // 1. The old person goes first, freeing the number and the code.
  if (h.old) {
    const ok = await upd(
      h.old.id,
      { device_pin: null, employee_code: freeCode("OLD", h.old.full_name), status: "terminated", left_on: h.date },
      `${tag}: end ${h.old.full_name}`,
    );
    if (!ok) continue;
  }

  // 2. The new person takes the number.
  const biometric = await db.from("person_biometrics").select("id, payload").eq("profile_id", h.next.id);
  const was = h.next.device_pin;
  if (!(await upd(h.next.id, { ...h.nextFields, device_pin: h.roll, employee_code: h.roll }, `${tag}: new joiner`))) continue;
  // A template carries its owner's number inside it.
  for (const row of biometric.data ?? []) {
    if (!was || was === h.roll) continue;
    const fixed = row.payload.replace(new RegExp(`(PIN=)${was}\\b`, "i"), `$1${h.roll}`);
    if (fixed !== row.payload) await db.from("person_biometrics").update({ payload: fixed }).eq("id", row.id);
  }

  // 3. What the number recorded from the date on.
  if (h.old) {
    const { data: moved, error } = await db
      .from("punches")
      .update({ profile_id: h.next.id })
      .eq("device_user_id", h.roll)
      .eq("profile_id", h.old.id)
      .gte("work_date", h.date)
      .select("id, work_date");
    if (error) failures.push(`${tag}: punches: ${error.message}`);
    movedLog.push({ roll: h.roll, from: h.old.id, to: h.next.id, punchIds: (moved ?? []).map((r) => r.id) });
    for (const d of new Set((moved ?? []).map((r) => r.work_date))) {
      recompute.push({ profile_id: h.next.id, work_date: d });
    }
    // The old person's days from the date on are not theirs any more.
    const { error: dayError } = await db
      .from("attendance_days")
      .delete()
      .eq("profile_id", h.old.id)
      .gte("work_date", h.date)
      .eq("is_manual", false)
      .eq("locked", false);
    if (dayError) failures.push(`${tag}: old days: ${dayError.message}`);

    for (const [table, col, from] of [
      ["meal_claims", "served_on", h.date],
      ["meal_scan_log", "scanned_at", `${h.date}T00:00:00+05:00`],
    ]) {
      const { error: mealError } = await db
        .from(table)
        .update({ profile_id: h.next.id })
        .eq("device_user_id", h.roll)
        .eq("profile_id", h.old.id)
        .gte(col, from);
      if (mealError) failures.push(`${tag}: ${table}: ${mealError.message}`);
    }
    console.log(`  ${h.roll}: ${moved?.length ?? 0} punches moved to ${h.next.full_name}`);
  }

  // 4. Which person each terminal says the number is.
  await db.from("device_enrollments").delete().eq("device_user_id", h.roll);
  if (was && was !== h.roll) await db.from("device_enrollments").delete().eq("profile_id", h.next.id);
}

for (const m of plan.merge) {
  await upd(m.into.id, { monthly_salary: Number(m.into.monthly_salary) + m.rent }, `${m.into.full_name}: house rent`);
  if (m.extra) {
    const { error } = await db.auth.admin.deleteUser(m.extra.id);
    if (error) failures.push(`${m.extra.full_name}: delete: ${error.message}`);
  }
}

for (const d of plan.deletions) {
  const { error } = await db.auth.admin.deleteUser(d.profile.id);
  if (error) failures.push(`${d.profile.full_name}: delete: ${error.message}`);
  await db.from("device_enrollments").delete().eq("device_user_id", d.profile.device_pin);
}

for (const r of plan.removeNumber) {
  const was = r.profile.device_pin;
  const code = /^NA-/.test(r.profile.employee_code) ? r.profile.employee_code : freeCode("NA", r.profile.full_name);
  await upd(r.profile.id, { ...r.fields, device_pin: null, employee_code: code }, `${r.profile.full_name}: remove number`);
  if (was) await db.from("device_enrollments").delete().eq("device_user_id", was);
}

for (const u of plan.updates) await upd(u.profile.id, u.fields, `${u.profile.full_name}: details`);

writeFileSync(new URL(`../backups/days-to-recompute-${stamp}.json`, import.meta.url), JSON.stringify(recompute));
console.log(`\nDays to rebuild: ${recompute.length} (backups/days-to-recompute-${stamp}.json)`);

// ---- The machines: nobody above 493 but Umar --------------------------------
const devices = await all("devices", "id, name");
const inventory = await all("device_inventory", "device_id, pin, record_type");
const swept = new Map();
for (const row of inventory) {
  if (row.record_type !== "user" || Number(row.pin) <= LIMIT || KEEP_ABOVE.has(row.pin)) continue;
  swept.set(`${row.device_id}:${row.pin}`, row);
}
// Also the numbers just released, in case a terminal has not reported them.
for (const r of plan.removeNumber) {
  if (!r.profile.device_pin) continue;
  for (const d of devices) swept.set(`${d.id}:${r.profile.device_pin}`, { device_id: d.id, pin: r.profile.device_pin });
}
let queued = 0;
for (const { device_id, pin } of swept.values()) {
  const body = `DATA DELETE USERINFO PIN=${pin}`;
  const { error } = await db.from("device_commands").insert({ device_id, kind: "user.delete", body });
  if (error) failures.push(`machine ${pin}: ${error.message}`);
  else queued++;
}
console.log(`Queued ${queued} deletions on the terminals.`);
console.log(`\nFailures: ${failures.length}`);
for (const f of failures) console.log(`  ${f}`);
