#!/usr/bin/env node
/**
 * Applies the three-page NEW JOINER REGISTER (October 2026) to RadoFlow.
 *
 * Department is whatever department the roll already sits in; it is never
 * taken from the sheet. For every row the sheet's name, designation and joining
 * date win. Salary stays what the roll was paid.
 *
 *   KIND "same"  the roll is held by this person: rename, designation, joined_on.
 *   KIND "swap"  the roll is held by somebody else: that person resigns on the
 *                new joiner's joining date (terminated, left_on, code OLD-<LETTERS>,
 *                no terminal number) and a new profile takes the roll, the
 *                code, the department and the salary. Punches and meals dated
 *                from that day move to the new person; the old person's days
 *                from then on are dropped. Rebuild with scripts/recompute-days.ts.
 *   KIND "new"   nobody holds the roll: a profile is created from a template.
 *
 *   node scripts/apply-new-joiners-oct26.mjs            # dry run
 *   node scripts/apply-new-joiners-oct26.mjs --apply
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

// roll, kind, name, designation, day of October, salary, template roll — read off the register.
// swap/new carry the salary: null = keep what the roll was paid.
const ROWS = [
  [54, "same", "M ARSLAN", "LOADER", 16],
  [88, "same", "IMTIAZ", "FITTER", 22],
  [96, "same", "FAIZAN", "DESIGNER", 19],
  [122, "same", "DAWOOD", "C-LOADER", 20],
  [128, "same", "YASIR", "C-LOADER", 20],
  [129, "swap", "FARHAN", "HELPER", 23, 25000],
  [130, "swap", "M HAYAT", "HELPER", 26],
  [132, "new", "ZUBAIR ULLAH", "HELPER", 26, 25000, 130],
  [137, "same", "FAIDULLAH", "HELPER", 13],
  [145, "same", "BILAL", "OPERATOR", 13],
  [151, "same", "ABDUL REHMAN", "OPERATOR", 7],
  [154, "same", "SAHAR", "HELPER", 20],
  [163, "same", "ISMAIL", "HELPER", 15],
  [164, "same", "FAIZ", "HELPER", 15],
  [174, "same", "JUNAID", "HELPER", 14],
  [176, "same", "MUZAMIL", "HELPER", 8],
  [177, "swap", "ALLAH NAWAZ", "HELPER", 26],
  [181, "swap", "TAHSIN", "HELPER", 28],
  [182, "swap", "USMAN", "HELPER", 28],
  [183, "same", "TANVEER", "HELPER", 17],
  [199, "same", "BOTTA", "HELPER", 7],
  [203, "same", "NASIR", "ASIST", 17],
  [204, "same", "MUSTAFA", "HELPER", 6],
  [206, "same", "SULTAN", "ASIST", 26],
  [207, "new", "RIZWAN", "CHECKER", 6, null, 208],
  [208, "same", "BILAL", "CHECKER", 15],
  [222, "same", "ASIF", "HELPER", 15],
  [258, "same", "SASHAN", "HELPER", 13],
  [259, "same", "UMAID", "OPERATOR", 9],
  [273, "same", "RASHID", "HELPER", 14],
  [291, "swap", "NASEER", "SUPERVISOR", 15],
  [305, "swap", "QAMAR ABBAS", "HELPER", 7],
  [318, "same", "ARMANALI", "HELPER", 13],
  [319, "same", "ABDUL REHMAN", "OPERATOR", 5],
  [322, "new", "M RIAZ", "HELPER", 26, 25000, 327],
  [324, "same", "ISRAR", "ASIST", 5],
  [327, "swap", "M RAMZAN", "OPERATOR", 27],
  [329, "swap", "KHAN GUL", "HELPER", 22],
  [339, "same", "SHAHJAHAN", "HELPER", 13],
  [349, "same", "AZIZ", "P MAN", 6],
  [350, "same", "AZEEM", "HELPER", 21],
  [367, "swap", "FAROOQ", "HELPER", 24],
  [368, "swap", "M YOUNAS", "HELPER", 24],
  [370, "same", "SAIFULLAH", "HELPER", 14],
  [371, "same", "YASIR KHAN", "HELPER", 22],
  [372, "same", "MASHAHZEEB", "HELPER", 26],
  [376, "same", "HAMID", "HELPER", 7],
].map(([roll, kind, name, designation, day, salary = null, template = null]) => ({
  roll: String(roll), kind, name, designation, salary, template: template ? String(template) : null,
  date: `2026-10-${String(day).padStart(2, "0")}`,
}));

// Pay settings a new profile inherits from the person who held (or neighbours) the roll.
const COPY = [
  "site_id", "department_id", "pay_class", "worker_type", "duty_hours", "sunday_policy", "overtime_eligible",
  "flexible_hours", "requires_attendance", "shift_id", "shift_follows_attendance", "hourly_rate",
  "ot_hourly_rate", "weekend_hourly_rate", "holiday_hourly_rate", "meals_per_day",
];

const letters = (s) => String(s ?? "").toUpperCase().replace(/[^A-Z]/g, "");
const profiles = [];
for (let from = 0; ; from += 1000) {
  const { data, error } = await db.from("profiles").select("*").range(from, from + 999);
  if (error) throw new Error(error.message);
  profiles.push(...data);
  if (data.length < 1000) break;
}
const { data: departments } = await db.from("departments").select("id, name");
const dept = (p) => departments.find((d) => d.id === p.department_id)?.name ?? "-";
const holderOf = (pin) => profiles.find((p) => p.device_pin === pin) ?? null;

const authEmails = new Set();
for (let page = 1; ; page++) {
  const { data } = await db.auth.admin.listUsers({ page, perPage: 1000 });
  for (const u of data?.users ?? []) authEmails.add(u.email);
  if ((data?.users ?? []).length < 1000) break;
}

const usedCodes = new Set(profiles.map((p) => p.employee_code));
const freeCode = (name) => {
  let code = `OLD-${letters(name) || "X"}`;
  for (let s = "B"; usedCodes.has(code); s = String.fromCharCode(s.charCodeAt(0) + 1)) code = `OLD-${letters(name)}${s}`;
  usedCodes.add(code);
  return code;
};

const problems = [];
const plan = [];
for (const r of ROWS) {
  const holder = holderOf(r.roll);
  const template = r.template ? holderOf(r.template) : holder;
  if (r.kind === "same") {
    if (!holder) { problems.push(`${r.roll}: nobody holds it`); continue; }
    const fields = { full_name: r.name, designation: r.designation, joined_on: r.date };
    const diff = Object.fromEntries(Object.entries(fields).filter(([k, v]) => holder[k] !== v));
    plan.push({ ...r, holder, diff });
  } else {
    if (r.kind === "swap" && !holder) { problems.push(`${r.roll}: swap but nobody holds it`); continue; }
    if (r.kind === "new" && holder) { problems.push(`${r.roll}: new but ${holder.full_name} holds it`); continue; }
    if (!template) { problems.push(`${r.roll}: no template profile`); continue; }
        const salary = r.salary ?? Number(template.monthly_salary);
    // An earlier holder may already own <roll>@staff.invalid (a login is a placeholder, not an identity).
    const email = authEmails.has(`${r.roll}@staff.invalid`) ? `${r.roll}.2@staff.invalid` : `${r.roll}@staff.invalid`;
    plan.push({ ...r, holder, template, salary, email });
  }
}

// ---- Report ------------------------------------------------------------------
const show = (p) => `${p.full_name} [${dept(p)}, ${p.designation}, ${p.monthly_salary}, joined ${p.joined_on}]`;
for (const kind of ["swap", "new", "same"]) {
  const rows = plan.filter((p) => p.kind === kind);
  console.log(`\n${kind.toUpperCase()} (${rows.length})`);
  for (const p of rows) {
    if (kind === "same") console.log(`  ${p.roll} ${show(p.holder)}\n       -> ${JSON.stringify(p.diff)}`);
    else if (kind === "swap")
      console.log(`  ${p.roll} ${show(p.holder)} RESIGNS ${p.date}\n       -> ${p.name} | ${dept(p.template)} | ${p.designation} | ${p.salary} | joined ${p.date}`);
    else console.log(`  ${p.roll} ${p.name} | ${dept(p.template)} | ${p.designation} | ${p.salary} | joined ${p.date}  (like ${p.template.full_name})`);
  }
}
console.log(`\nPROBLEMS (${problems.length})`);
for (const x of problems) console.log(`  ! ${x}`);
if (!APPLY) {
  console.log("\nDry run. Re-run with --apply to write.");
  process.exit(0);
}
if (problems.length) {
  console.error("\nRefusing to apply with problems above.");
  process.exit(1);
}

// ---- Apply -------------------------------------------------------------------
mkdirSync(new URL("../backups/", import.meta.url), { recursive: true });
const stamp = new Date().toISOString().replace(/[:.]/g, "-");
writeFileSync(new URL(`../backups/profiles-before-new-joiners-${stamp}.json`, import.meta.url), JSON.stringify(profiles, null, 1));

const failures = [];
const recompute = [];
const upd = async (id, fields, what) => {
  if (!Object.keys(fields).length) return true;
  const { error } = await db.from("profiles").update(fields).eq("id", id);
  if (error) failures.push(`${what}: ${error.message}`);
  return !error;
};

for (const p of plan.filter((x) => x.kind === "same")) await upd(p.holder.id, p.diff, `${p.roll} ${p.name}`);

for (const p of plan.filter((x) => x.kind !== "same")) {
  const tag = `${p.roll} ${p.name}`;

  // 1. The old person resigns on the new joiner's joining date and frees the number.
  if (p.holder) {
    const ok = await upd(
      p.holder.id,
      { device_pin: null, employee_code: freeCode(p.holder.full_name), status: "terminated", left_on: p.date },
      `${tag}: end ${p.holder.full_name}`,
    );
    if (!ok) continue;
  }

  // 2. The new person: a login, then a profile that carries the roll.
  const { data: auth, error: authError } = await db.auth.admin.createUser({
    email: p.email,
    email_confirm: true,
    user_metadata: { full_name: p.name },
  });
  if (authError || !auth?.user) {
    failures.push(`${tag}: login: ${authError?.message}`);
    continue;
  }
  const row = {
    id: auth.user.id,
    employee_code: p.roll,
    device_pin: p.roll,
    full_name: p.name,
    designation: p.designation,
    joined_on: p.date,
    salary_from: p.date,
    status: "active",
    monthly_salary: p.salary,
  };
  for (const c of COPY) if (p.template[c] !== undefined) row[c] = p.template[c];
  const { error } = await db.from("profiles").insert(row);
  if (error) {
    await db.auth.admin.deleteUser(auth.user.id);
    failures.push(`${tag}: profile: ${error.message}`);
    continue;
  }

  // 3. What the number recorded from that day on is the new person's.
  if (p.holder) {
    const { data: moved, error: punchError } = await db
      .from("punches")
      .update({ profile_id: auth.user.id })
      .eq("device_user_id", p.roll)
      .eq("profile_id", p.holder.id)
      .gte("work_date", p.date)
      .select("id, work_date");
    if (punchError) failures.push(`${tag}: punches: ${punchError.message}`);
    for (const d of new Set((moved ?? []).map((m) => m.work_date))) recompute.push({ profile_id: auth.user.id, work_date: d });
    const { error: dayError } = await db
      .from("attendance_days")
      .delete()
      .eq("profile_id", p.holder.id)
      .gte("work_date", p.date)
      .eq("is_manual", false)
      .eq("locked", false);
    if (dayError) failures.push(`${tag}: old days: ${dayError.message}`);
    for (const [table, col, from] of [
      ["meal_claims", "served_on", p.date],
      ["meal_scan_log", "scanned_at", `${p.date}T00:00:00+05:00`],
    ]) {
      const { error: mealError } = await db
        .from(table)
        .update({ profile_id: auth.user.id })
        .eq("device_user_id", p.roll)
        .eq("profile_id", p.holder.id)
        .gte(col, from);
      if (mealError) failures.push(`${tag}: ${table}: ${mealError.message}`);
    }
    console.log(`  ${p.roll}: ${moved?.length ?? 0} punches moved to ${p.name}`);
  }
  // 4. The terminals re-learn who the number is.
  await db.from("device_enrollments").delete().eq("device_user_id", p.roll);
}

writeFileSync(new URL(`../backups/days-to-recompute-${stamp}.json`, import.meta.url), JSON.stringify(recompute));
console.log(`\nDays to rebuild: ${recompute.length} (backups/days-to-recompute-${stamp}.json)`);
console.log(`Failures: ${failures.length}`);
for (const f of failures) console.log(`  ${f}`);
