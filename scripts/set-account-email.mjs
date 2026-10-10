#!/usr/bin/env node
/**
 * Changes a person's sign-in email — the Supabase Auth address and the copy on
 * their profile — without touching their password, CNIC, role or PIN.
 *
 *   node scripts/set-account-email.mjs <profile-id> <new-email>
 *
 * Sign-in is by CNIC; the auth email is read off the auth row after the person
 * is found, so changing it does not change how they sign in.
 */
import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";

for (const line of readFileSync(new URL("../.env.local", import.meta.url), "utf8").split(/\r?\n/)) {
  const at = line.indexOf("=");
  if (at < 1 || line.trim().startsWith("#")) continue;
  const k = line.slice(0, at).trim();
  if (!process.env[k]) process.env[k] = line.slice(at + 1).trim().replace(/^["']|["']$/g, "");
}

const [id, email] = process.argv.slice(2);
if (!id || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email ?? "")) {
  console.error("Usage: node scripts/set-account-email.mjs <profile-id> <new-email>");
  process.exit(1);
}

const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

const before = await db.auth.admin.getUserById(id);
console.log("before:", before.data?.user?.email);

const auth = await db.auth.admin.updateUserById(id, { email, email_confirm: true });
if (auth.error) throw new Error(`Auth: ${auth.error.message}`);

const profile = await db.from("profiles").update({ email }).eq("id", id).select("full_name, email");
if (profile.error) {
  // Put the login back so the two copies of the address never disagree.
  await db.auth.admin.updateUserById(id, { email: before.data.user.email, email_confirm: true });
  throw new Error(`Profile: ${profile.error.message}`);
}

console.log("after: ", auth.data.user.email, "/", profile.data?.[0]?.email);
