"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { formatCnic, isValidCnic } from "@/lib/cnic";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";

export interface LoginState {
  error: null | string;
}

/**
 * The message shown for every failed sign-in.
 *
 * Deliberately vague: distinguishing "no such CNIC" from "wrong password"
 * turns the login box into a tool for discovering who works here.
 */
const REJECTED = "CNIC or password is incorrect.";

/**
 * Resolves a CNIC to the address Supabase Auth knows the person by.
 *
 * Runs with the service key because an unauthenticated visitor cannot be
 * allowed to read the profiles table directly — the lookup happens on the
 * server and only ever yields an address the caller already proved they know
 * the password for.
 */
async function authEmailForCnic(cnic: string): Promise<string | null> {
  const admin = createServiceClient();

  const { data: profile } = await admin
    .from("profiles")
    .select("id")
    .eq("cnic", cnic)
    .maybeSingle<{ id: string }>();

  if (!profile) return null;

  // Read the address from auth rather than from the profile: the profile copy
  // is a convenience field and can drift, while this one is what the password
  // check is actually keyed on.
  const { data: user } = await admin.auth.admin.getUserById(profile.id);
  return user.user?.email ?? null;
}

export async function signIn(_prev: LoginState, formData: FormData): Promise<LoginState> {
  const cnic = formatCnic(String(formData.get("cnic") ?? ""));
  const password = String(formData.get("password") ?? "");
  const next = String(formData.get("next") ?? "/");

  if (!cnic || !password) {
    return { error: "Enter your CNIC and password." };
  }
  if (!isValidCnic(cnic)) {
    // A short number is a typo rather than a wrong guess, so say so plainly.
    // It reveals nothing: the number was never long enough to match anyone.
    return { error: "A CNIC is 13 digits — XXXXX-XXXXXXX-X." };
  }

  const email = await authEmailForCnic(cnic);
  if (!email) return { error: REJECTED };

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({ email, password });

  if (error) return { error: REJECTED };

  revalidatePath("/", "layout");
  // Only allow relative targets, so ?next= cannot bounce anyone off-site.
  redirect(next.startsWith("/") && !next.startsWith("//") ? next : "/");
}

export async function signOut() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  revalidatePath("/", "layout");
  redirect("/login");
}
