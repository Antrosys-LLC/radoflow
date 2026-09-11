#!/usr/bin/env node
/**
 * Prices a range of demo attendance, using the factory's own payroll engine.
 *
 * The companion to seed-demo-attendance.mjs: that writes the days, this turns
 * them into money. It does not calculate anything itself — it opens (or
 * reuses) a pay period and hands it to `runPayrollForPeriod`, the same
 * function the Run button on the payroll screen calls. A second, script-shaped
 * implementation of payroll that drifted from the real one by a few rupees
 * would be worse than having no script.
 *
 * Usage:
 *   node scripts/seed-demo-payroll.mjs 2026-09-01 2026-09-09
 *   node scripts/seed-demo-payroll.mjs 2026-09-01 2026-09-09 --label="1 to 9 September"
 *   node scripts/seed-demo-payroll.mjs 2026-09-01 2026-09-09 --dry-run
 *   node scripts/seed-demo-payroll.mjs 2026-09-01 2026-09-09 --remove
 *
 * `--remove` deletes the period covering exactly that range along with its
 * lines, so demo figures can be cleared the same day they were shown. It
 * refuses a period that has been approved, locked or paid: those are records
 * of a decision somebody made, not scaffolding, whatever the dates say.
 */

import { existsSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

import { enableAppImports } from "./lib/load-ts.mjs";

const envFile = new URL("../.env.local", import.meta.url);
if (existsSync(envFile)) process.loadEnvFile(envFile);

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

const [from, to] = process.argv.slice(2).filter((a) => !a.startsWith("--"));
const dryRun = process.argv.includes("--dry-run");
const remove = process.argv.includes("--remove");
const labelArg = process.argv.find((a) => a.startsWith("--label="));
const siteArg = process.argv.find((a) => a.startsWith("--site="));

if (!url || !serviceKey) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY.");
  process.exit(1);
}
if (!isDate(from) || !isDate(to) || from > to) {
  console.error("Usage: node scripts/seed-demo-payroll.mjs <from YYYY-MM-DD> <to YYYY-MM-DD>");
  process.exit(1);
}

const db = createClient(url, serviceKey, { auth: { persistSession: false } });

function isDate(value) {
  return typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value);
}

const money = new Intl.NumberFormat("en-PK", {
  style: "currency",
  currency: "PKR",
  maximumFractionDigits: 0,
});

/** The site to price. One factory needs no flag; two would. */
async function resolveSite() {
  const { data: sites, error } = await db.from("sites").select("id, name").order("name");
  if (error) throw new Error(`Could not read sites: ${error.message}`);
  if (!sites || sites.length === 0) throw new Error("No sites on this database.");

  if (siteArg) {
    const wanted = siteArg.split("=")[1];
    const site = sites.find((s) => s.id === wanted || s.name === wanted);
    if (!site) throw new Error(`No site called "${wanted}".`);
    return site;
  }

  if (sites.length > 1) {
    throw new Error(`More than one site — name one with --site=, e.g. --site="${sites[0].name}".`);
  }
  return sites[0];
}

const site = await resolveSite();

const { data: existing, error: existingError } = await db
  .from("payroll_periods")
  .select("id, label, status, locked, headcount, total_net, approved_at, paid_at")
  .eq("site_id", site.id)
  .eq("period_start", from)
  .eq("period_end", to)
  .maybeSingle();

if (existingError) {
  console.error(`Could not read pay periods: ${existingError.message}`);
  process.exit(1);
}

// ------------------------------------------------------------------ removal

if (remove) {
  if (!existing) {
    console.log(`No pay period for ${from} to ${to} at ${site.name}. Nothing to remove.`);
    process.exit(0);
  }
  /*
   * A period somebody approved, locked or paid is a record of a decision. The
   * dates matching a demo range is not enough to justify deleting one, and a
   * script that quietly did would be the wrong thing to have written.
   */
  if (existing.locked || existing.approved_at || existing.paid_at) {
    console.error(
      `Refusing to remove "${existing.label}" — it has been ${
        existing.paid_at ? "paid" : existing.approved_at ? "approved" : "locked"
      }. Unlock or unapprove it first if that is really what you want.`,
    );
    process.exit(1);
  }

  if (dryRun) {
    console.log(`Would remove "${existing.label}" (${existing.headcount} line(s)) and its items.`);
    process.exit(0);
  }

  // The lines first: the period is what the screens read, so a half-removed
  // period is better left as a period with no lines than as orphaned lines.
  for (const table of ["payroll_items", "payroll_contract_items"]) {
    const { error } = await db.from(table).delete().eq("period_id", existing.id);
    // A database that has not had the contract-items migration is not a
    // reason to leave the rest of the demo data behind.
    if (error && !/does not exist|schema cache/i.test(error.message)) {
      console.error(`Could not remove ${table}: ${error.message}`);
      process.exit(1);
    }
  }

  const { error: periodError } = await db.from("payroll_periods").delete().eq("id", existing.id);
  if (periodError) {
    console.error(`Could not remove the pay period: ${periodError.message}`);
    process.exit(1);
  }

  console.log(`Removed "${existing.label}" and its lines.`);
  process.exit(0);
}

// ------------------------------------------------------------------ the run

if (existing?.locked) {
  console.error(`"${existing.label}" is locked and cannot be recalculated.`);
  process.exit(1);
}

const label = labelArg ? labelArg.slice("--label=".length) : `${from} to ${to}`;

const { count: days } = await db
  .from("attendance_days")
  .select("*", { count: "exact", head: true })
  .gte("work_date", from)
  .lte("work_date", to);

console.log(`${site.name}: ${from} to ${to}`);
console.log(`${days ?? 0} attendance day(s) in range.`);
console.log(
  existing ? `Reusing pay period "${existing.label}".` : `Creating pay period "${label}".`,
);

if (dryRun) {
  console.log("Dry run — nothing written.");
  process.exit(0);
}

let periodId = existing?.id ?? null;

if (!periodId) {
  const { data: created, error } = await db
    .from("payroll_periods")
    .insert({ site_id: site.id, label, period_start: from, period_end: to, status: "draft" })
    .select("id")
    .single();

  if (error) {
    console.error(`Could not create the pay period: ${error.message}`);
    process.exit(1);
  }
  periodId = created.id;
}

/*
 * The app's own engine, imported rather than reimplemented. See
 * scripts/lib/load-ts.mjs for why a plain `node` can read it.
 */
enableAppImports();
const { runPayrollForPeriod } = await import("../src/lib/payroll/run.ts");

const summary = await runPayrollForPeriod(periodId);

console.log("");
console.log(`Calculated ${summary.headcount} line(s).`);
console.log(`  Gross      ${money.format(summary.gross)}`);
console.log(`  Deductions ${money.format(summary.deductions)}`);
console.log(`  Tax        ${money.format(summary.tax)}`);
console.log(`  Net        ${money.format(summary.net)}`);

if (summary.skipped.length > 0) {
  console.log(`\n${summary.skipped.length} skipped:`);
  for (const person of summary.skipped.slice(0, 10)) {
    console.log(`  ${person.name} — ${person.reason}`);
  }
  if (summary.skipped.length > 10) console.log(`  …and ${summary.skipped.length - 10} more.`);
}

if (summary.flagged.length > 0) {
  console.log(`\n${summary.flagged.length} flagged for a look before approval:`);
  for (const person of summary.flagged.slice(0, 10)) {
    console.log(`  ${person.name} — ${person.hours}h on ${person.dates.join(", ")}`);
  }
}

console.log(`\nUndo with: node scripts/seed-demo-payroll.mjs ${from} ${to} --remove`);
