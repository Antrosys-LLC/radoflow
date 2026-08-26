#!/usr/bin/env node
/**
 * Creates — or repairs — the first Admin account on a RadoFlow database.
 *
 * A production database has no users: supabase/seed.sql must never run there,
 * because it creates demo logins with a password published in this repo. So
 * the very first account has to be made deliberately, once.
 *
 * Sign-in is by CNIC, so that is what this script takes. Supabase Auth is still
 * keyed on email underneath, and the address is derived from the digits rather
 * than asked for — floor staff have a national identity card and no mailbox.
 *
 * Everything goes through the Auth admin API rather than raw SQL. Writing to
 * auth.users by hand is what produced the opaque "Database error querying
 * schema" failure during development — GoTrue expects several columns to be
 * empty strings rather than NULL, and needs a matching auth.identities row.
 * The API gets all of that right.
 *
 * Re-running is safe. If the account already exists the password and CNIC are
 * brought back in line rather than the run failing, because the usual reason
 * for running this twice is that nobody can get in.
 *
 * Usage:
 *   NEXT_PUBLIC_SUPABASE_URL=https://<ref>.supabase.co \
 *   SUPABASE_SERVICE_ROLE_KEY=<service role key> \
 *   node scripts/create-admin.mjs "35201-1234567-8" "a-strong-password" "Full Name"
 */

import { createClient } from "@supabase/supabase-js";

/** Thrown to abort with a readable message rather than a stack trace. */
class SetupError extends Error {}

/*
 * These mirror src/lib/cnic.ts. They are duplicated rather than imported
 * because this script runs under plain node, which cannot load the TypeScript
 * module. Both must agree on the stored form or a CNIC typed at the login box
 * will not match the one written here.
 */

const CNIC_GROUPS = [5, 7, 1];
const CNIC_DIGITS = 13;

function cnicDigits(input) {
  return String(input ?? "")
    .replace(/\D/g, "")
    .slice(0, CNIC_DIGITS);
}

function formatCnic(input) {
  const digits = cnicDigits(input);
  if (!digits) return "";

  const parts = [];
  let offset = 0;

  for (const size of CNIC_GROUPS) {
    if (offset >= digits.length) break;
    parts.push(digits.slice(offset, offset + size));
    offset += size;
  }

  return parts.join("-");
}

/**
 * The synthetic login address for a CNIC. `.invalid` is reserved by RFC 2606
 * precisely so it can never collide with a real domain or receive mail.
 */
function cnicLoginEmail(input) {
  return `${cnicDigits(input)}@cnic.invalid`;
}

async function main() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  const [rawCnic, password, fullName = "Administrator", employeeCode = "RD-0001"] =
    process.argv.slice(2);

  if (!url || !serviceKey) {
    throw new SetupError(
      "Missing configuration.\n" +
        "  NEXT_PUBLIC_SUPABASE_URL   https://<ref>.supabase.co\n" +
        "  SUPABASE_SERVICE_ROLE_KEY  Settings -> API -> service_role / secret key",
    );
  }

  if (!rawCnic || !password) {
    throw new SetupError(
      'Usage: node scripts/create-admin.mjs "35201-1234567-8" "password" ["Full Name"] ["RD-0001"]',
    );
  }

  if (cnicDigits(rawCnic).length !== CNIC_DIGITS) {
    throw new SetupError(
      `"${rawCnic}" is not a CNIC. Thirteen digits, written XXXXX-XXXXXXX-X.\n` +
        "  Dashes are optional here — they are added for you.",
    );
  }

  if (password.length < 8) {
    throw new SetupError("Choose a password of at least 8 characters.");
  }

  const cnic = formatCnic(rawCnic);
  const email = cnicLoginEmail(cnic);

  const supabase = createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  console.log(`Creating the first Admin on ${url}\n`);

  // The migrations must have run: without them there is no roles table to grant.
  const { data: adminRole, error: roleError } = await supabase
    .from("roles")
    .select("id, name")
    .eq("key", "admin")
    .maybeSingle();

  if (roleError) {
    /*
     * These two failures look identical from the caller's side but need
     * opposite fixes, so they are named separately. Reporting a rejected key
     * as "the schema is missing" sends people off to re-run migrations that
     * already applied.
     */
    const message = roleError.message ?? "";
    const badKey = /invalid api key|jwt|unauthorized|permission denied/i.test(message);
    const noSchema = roleError.code === "PGRST205" || /could not find the table/i.test(message);

    if (badKey) {
      throw new SetupError(
        `Supabase rejected the key (${message}).\n` +
          `  SUPABASE_SERVICE_ROLE_KEY must be the Secret key from\n` +
          `  Settings -> API -> Secret keys (starts with "sb_secret_"), pasted in full.\n` +
          `  The publishable key will not work here — it cannot create users.`,
      );
    }

    if (noSchema) {
      throw new SetupError(
        `The database has no RadoFlow tables yet (${message}).\n` +
          `  Run "npx supabase db push" to apply the migrations.`,
      );
    }

    throw new SetupError(`Cannot read public.roles: ${message}`);
  }
  if (!adminRole) throw new SetupError('No "admin" role found. Did every migration apply?');

  console.log(`  ✓ schema present, found the ${adminRole.name} role`);

  /*
   * Sign-in reads profiles.cnic, so a database still on the pre-CNIC schema
   * would happily create an account that can never log in. Fail loudly here
   * instead, naming the migration that is missing.
   */
  const { error: cnicColumnError } = await supabase.from("profiles").select("cnic").limit(1);

  if (cnicColumnError && /cnic/i.test(cnicColumnError.message ?? "")) {
    throw new SetupError(
      `This database predates CNIC sign-in (${cnicColumnError.message}).\n` +
        `  Run "npx supabase db push" to apply 20260825120000_cnic_login.sql,\n` +
        `  then run this script again.`,
    );
  }

  // A person needs a factory to belong to; create one if this is a bare project.
  let { data: site } = await supabase.from("sites").select("id, name").limit(1).maybeSingle();

  if (!site) {
    const { data: created, error } = await supabase
      .from("sites")
      .insert({ code: "MAIN", name: "Factory 1", timezone: "Asia/Karachi" })
      .select("id, name")
      .single();
    if (error) throw new SetupError(`Could not create a factory: ${error.message}`);
    site = created;
    console.log(`  ✓ created factory "${site.name}"`);
  } else {
    console.log(`  ✓ using existing factory "${site.name}"`);
  }

  /*
   * An existing CNIC is treated as "fix this account", not as an error. The
   * reason someone runs this a second time is almost always that nobody can
   * sign in, and failing here would leave them exactly as stuck as before.
   */
  const { data: existingProfile } = await supabase
    .from("profiles")
    .select("id, full_name")
    .eq("cnic", cnic)
    .maybeSingle();

  if (existingProfile) {
    const { error: resetError } = await supabase.auth.admin.updateUserById(existingProfile.id, {
      password,
      email,
      email_confirm: true,
    });

    if (resetError) {
      throw new SetupError(`Could not reset the existing login: ${resetError.message}`);
    }

    console.log(`  ✓ ${existingProfile.full_name} already existed — password reset`);

    // The role may be missing if a previous run failed partway through.
    await supabase
      .from("user_roles")
      .upsert(
        { user_id: existingProfile.id, role_id: adminRole.id },
        { onConflict: "user_id,role_id", ignoreDuplicates: true },
      );

    console.log(`  ✓ ${adminRole.name} confirmed\n`);
    console.log(`Done. Sign in with CNIC ${cnic}.`);
    return;
  }

  const { data: created, error: authError } = await supabase.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { full_name: fullName },
  });

  if (authError || !created?.user) {
    throw new SetupError(`Could not create the login: ${authError?.message ?? "unknown error"}`);
  }

  console.log(`  ✓ login created for CNIC ${cnic}`);

  const { error: profileError } = await supabase.from("profiles").insert({
    id: created.user.id,
    employee_code: employeeCode,
    full_name: fullName,
    cnic,
    email,
    site_id: site.id,
    pay_class: "monthly",
    requires_attendance: false,
    monthly_salary: 0,
  });

  if (profileError) {
    // Roll the login back so a failed insert cannot strand an account that can
    // sign in but has no employee record behind it.
    await supabase.auth.admin.deleteUser(created.user.id);
    throw new SetupError(`Could not create the employee record: ${profileError.message}`);
  }

  console.log(`  ✓ employee record ${employeeCode}`);

  const { error: grantError } = await supabase
    .from("user_roles")
    .insert({ user_id: created.user.id, role_id: adminRole.id });

  if (grantError) {
    await supabase.auth.admin.deleteUser(created.user.id);
    throw new SetupError(`Could not assign the Admin role: ${grantError.message}`);
  }

  console.log(`  ✓ granted ${adminRole.name}\n`);
  console.log(`Done. Sign in at your deployment with CNIC ${cnic}.`);
  console.log("Change the password after the first sign-in, from My Profile.");
}

try {
  await main();
} catch (error) {
  // Setting exitCode rather than calling process.exit() lets in-flight
  // requests unwind; exiting mid-request trips a libuv assertion on Windows.
  process.exitCode = 1;
  console.error(`\n✗ ${error instanceof SetupError ? error.message : error}`);
}
