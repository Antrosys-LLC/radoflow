#!/usr/bin/env node
/**
 * Creates the first Admin account on a fresh RadoFlow database.
 *
 * A production database has no users: supabase/seed.sql must never run there,
 * because it creates demo logins with a password published in this repo. So
 * the very first account has to be made deliberately, once.
 *
 * Everything goes through the Auth admin API rather than raw SQL. Writing to
 * auth.users by hand is what produced the opaque "Database error querying
 * schema" failure during development — GoTrue expects several columns to be
 * empty strings rather than NULL, and needs a matching auth.identities row.
 * The API gets all of that right.
 *
 * Usage:
 *   NEXT_PUBLIC_SUPABASE_URL=https://<ref>.supabase.co \
 *   SUPABASE_SERVICE_ROLE_KEY=<service role key> \
 *   node scripts/create-admin.mjs "admin@yourcompany.com" "a-strong-password" "Full Name"
 */

import { createClient } from "@supabase/supabase-js";

/** Thrown to abort with a readable message rather than a stack trace. */
class SetupError extends Error {}

async function main() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  const [email, password, fullName = "Administrator", employeeCode = "RD-0001"] =
    process.argv.slice(2);

  if (!url || !serviceKey) {
    throw new SetupError(
      "Missing configuration.\n" +
        "  NEXT_PUBLIC_SUPABASE_URL   https://<ref>.supabase.co\n" +
        "  SUPABASE_SERVICE_ROLE_KEY  Settings -> API -> service_role / secret key",
    );
  }

  if (!email || !password) {
    throw new SetupError(
      'Usage: node scripts/create-admin.mjs "email" "password" ["Full Name"] ["RD-0001"]',
    );
  }

  if (password.length < 8) {
    throw new SetupError("Choose a password of at least 8 characters.");
  }

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

  const { data: created, error: authError } = await supabase.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { full_name: fullName },
  });

  if (authError || !created?.user) {
    throw new SetupError(`Could not create the login: ${authError?.message ?? "unknown error"}`);
  }

  console.log(`  ✓ login created for ${email}`);

  const { error: profileError } = await supabase.from("profiles").insert({
    id: created.user.id,
    employee_code: employeeCode,
    full_name: fullName,
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
  console.log(`Done. Sign in at your deployment with ${email}.`);
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
