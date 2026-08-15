"use server";

import { revalidatePath } from "next/cache";

import { requirePermission } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";

export interface UserResult {
  ok: boolean;
  message: string;
}

function text(form: FormData, key: string): string {
  return String(form.get(key) ?? "").trim();
}

/**
 * Creates a login and its employee record together.
 *
 * Uses the admin API rather than public sign-up so the account is confirmed
 * immediately and no invitation email is required — factory staff are enrolled
 * in person, at the office.
 *
 * The employee code doubles as the ZKTeco enrolment id: a trigger creates the
 * terminal mapping automatically, so the number typed into the K50 is the same
 * one the ERP knows.
 */
export async function createUser(_prev: UserResult, form: FormData): Promise<UserResult> {
  await requirePermission("people.manage");

  const email = text(form, "email").toLowerCase();
  const password = text(form, "password");
  const fullName = text(form, "full_name");
  const employeeCode = text(form, "employee_code");
  const roleId = text(form, "role_id");
  const siteId = text(form, "site_id");

  if (!email || !fullName || !employeeCode) {
    return { ok: false, message: "Name, employee code and email are required." };
  }
  if (password.length < 8) {
    return { ok: false, message: "The password must be at least 8 characters." };
  }

  const admin = createServiceClient();

  const { data: created, error: authError } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { full_name: fullName },
  });

  if (authError || !created.user) {
    return { ok: false, message: authError?.message ?? "Could not create the login." };
  }

  const payClass = (text(form, "pay_class") || "hourly") as "monthly" | "hourly";

  const { error: profileError } = await admin.from("profiles").insert({
    id: created.user.id,
    employee_code: employeeCode,
    full_name: fullName,
    email,
    phone: text(form, "phone") || null,
    site_id: siteId || null,
    department_id: text(form, "department_id") || null,
    shift_id: text(form, "shift_id") || null,
    designation: text(form, "designation") || null,
    pay_class: payClass,
    monthly_salary: Number(text(form, "monthly_salary") || 0),
    hourly_rate: Number(text(form, "hourly_rate") || 0),
    requires_attendance: form.get("requires_attendance") !== null,
  });

  if (profileError) {
    // Roll the login back so a failed insert cannot strand an orphan account
    // that can sign in but has no employee record.
    await admin.auth.admin.deleteUser(created.user.id);
    if (profileError.code === "23505") {
      return { ok: false, message: `Employee code ${employeeCode} is already in use.` };
    }
    return { ok: false, message: profileError.message };
  }

  if (roleId) {
    await admin.from("user_roles").insert({ user_id: created.user.id, role_id: roleId });
  }

  revalidatePath("/admin/users");
  return { ok: true, message: `${fullName} can now sign in as ${email}.` };
}

/** Replaces a person's role. */
export async function setUserRole(_prev: UserResult, form: FormData): Promise<UserResult> {
  await requirePermission("access.manage");

  const userId = text(form, "user_id");
  const roleId = text(form, "role_id");
  if (!userId) return { ok: false, message: "No user selected." };

  const supabase = await createClient();
  await supabase.from("user_roles").delete().eq("user_id", userId);

  if (roleId) {
    const { error } = await supabase.from("user_roles").insert({ user_id: userId, role_id: roleId });
    if (error) return { ok: false, message: error.message };
  }

  revalidatePath("/admin/users");
  revalidatePath("/admin/roles");
  return { ok: true, message: "Role updated." };
}

/**
 * Grants or revokes one capability for one person, on top of their role.
 *
 * A deny always beats a role grant, which is how a single person can be shut
 * out of something their role otherwise allows without inventing a new role.
 */
export async function setUserOverride(
  userId: string,
  permissionId: string,
  effect: "grant" | "deny" | "clear",
): Promise<UserResult> {
  await requirePermission("access.manage");

  const supabase = await createClient();

  if (effect === "clear") {
    const { error } = await supabase
      .from("user_permission_overrides")
      .delete()
      .eq("user_id", userId)
      .eq("permission_id", permissionId);
    if (error) return { ok: false, message: error.message };
  } else {
    const { error } = await supabase.from("user_permission_overrides").upsert(
      { user_id: userId, permission_id: permissionId, effect },
      { onConflict: "user_id,permission_id,site_id" },
    );
    if (error) return { ok: false, message: error.message };
  }

  revalidatePath("/admin/users");
  return { ok: true, message: "Access updated." };
}

export async function setUserStatus(
  userId: string,
  status: "active" | "suspended",
): Promise<UserResult> {
  await requirePermission("people.manage");

  const supabase = await createClient();
  const { error } = await supabase.from("profiles").update({ status }).eq("id", userId);
  if (error) return { ok: false, message: error.message };

  revalidatePath("/admin/users");
  return { ok: true, message: status === "active" ? "Account reactivated." : "Account suspended." };
}
