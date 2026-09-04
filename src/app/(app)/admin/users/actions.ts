"use server";

import { revalidatePath } from "next/cache";

import { requirePermission, type Session } from "@/lib/auth/session";
import { cnicLoginEmail, formatCnic, isValidCnic } from "@/lib/cnic";
import { trackingFlags } from "@/lib/people/tracking";
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
 *
 * Enrolling someone and deciding what they may do are two different jobs, held
 * by two different capabilities — `setUserRole` has always required
 * `access.manage` to change an existing person's role. The same rule has to
 * apply on the way in: without it, `people.manage` alone could create an
 * account, attach the Admin role to it, and set its password, which is a
 * complete route from "may enrol staff" to superuser. Creating someone with no
 * role at all stays open to `people.manage`, because that is the ordinary case.
 */
export async function createUser(_prev: UserResult, form: FormData): Promise<UserResult> {
  const session = await requirePermission("people.manage");

  const cnic = formatCnic(text(form, "cnic"));
  const password = text(form, "password");
  const fullName = text(form, "full_name");
  const employeeCode = text(form, "employee_code");
  const roleId = text(form, "role_id");
  const siteId = text(form, "site_id");

  if (!fullName || !employeeCode || !cnic) {
    return { ok: false, message: "Name, employee code and CNIC are required." };
  }
  if (!isValidCnic(cnic)) {
    return { ok: false, message: "A CNIC is 13 digits — XXXXX-XXXXXXX-X." };
  }
  if (password.length < 8) {
    return { ok: false, message: "The password must be at least 8 characters." };
  }

  /*
   * Refused before the login is created, not after: a half-made account that
   * exists but was never given the role the operator asked for is worse than
   * a plain refusal, because nothing on the screen would say so.
   */
  if (roleId && !session.isSuperuser && !session.permissions.has("access.manage")) {
    return {
      ok: false,
      message:
        "You can add people but not decide what they may do. Create them with no role, then ask someone who manages access to assign one.",
    };
  }

  // The CNIC is what the person types to sign in. Auth still needs an address,
  // so an optional real email is kept for correspondence while the derived one
  // carries the login.
  const contactEmail = text(form, "email").toLowerCase();
  const email = contactEmail || cnicLoginEmail(cnic);

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
    cnic,
    email: contactEmail || null,
    phone: text(form, "phone") || null,
    site_id: siteId || null,
    department_id: text(form, "department_id") || null,
    shift_id: text(form, "shift_id") || null,
    designation: text(form, "designation") || null,
    pay_class: payClass,
    monthly_salary: Number(text(form, "monthly_salary") || 0),
    hourly_rate: Number(text(form, "hourly_rate") || 0),
    ...trackingFlags(text(form, "tracking")),
    // An empty shift selection is the no-shift option, and someone with no
    // shift has no in or out time to keep.
    flexible_hours: text(form, "shift_id") === "",
    // Left unset, a trigger fills this from the department's default.
    worker_type: (text(form, "worker_type") || "employee") as "employee" | "contractor",
    duty_hours: Number(text(form, "duty_hours") || 8),
    sunday_policy: (text(form, "sunday_policy") || "off") as "off" | "optional" | "compulsory",
  });

  if (profileError) {
    // Roll the login back so a failed insert cannot strand an orphan account
    // that can sign in but has no employee record.
    await admin.auth.admin.deleteUser(created.user.id);
    if (profileError.code === "23505") {
      // Either unique column can collide, and telling the operator which one
      // saves them re-typing the whole form to find out.
      const field = profileError.message.includes("cnic")
        ? `CNIC ${cnic}`
        : `Employee code ${employeeCode}`;
      return { ok: false, message: `${field} is already in use.` };
    }
    return { ok: false, message: profileError.message };
  }

  if (roleId) {
    await admin.from("user_roles").insert({ user_id: created.user.id, role_id: roleId });
  }

  revalidatePath("/admin/users");
  return { ok: true, message: `${fullName} can now sign in with CNIC ${cnic}.` };
}

/**
 * Whether the caller may administer `targetId`'s account.
 *
 * `people.manage` exists so the office can enrol, correct and suspend workers.
 * Two of the things it reaches stop being staff administration when pointed at
 * an administrator:
 *
 *  - setting a password hands the account over — whoever types the new one can
 *    sign in as that person and do everything they can do;
 *  - suspending an account takes it offline, and because a payroll run reads
 *    only `status = 'active'` profiles, drops that person from their own pay.
 *
 * So the question is not "may this person administer staff" — `people.manage`
 * already answered that — but "does reaching this account get them something
 * they do not already hold".
 *
 * The line is drawn at `access.manage`, the capability to grant any other
 * capability to anyone, including oneself. Reaching an account that holds it is
 * not a lateral move into someone else's job; it is a route to every job.
 * Superusers need no separate check because `permissions_of()` resolves them to
 * the whole catalogue, so they hold `access.manage` like everything else — one
 * condition covers both Admin/CEO and any runtime role granted the key.
 *
 * Everything below that line stays open, and has to: the office resetting a
 * loom operator's password is the reason this feature exists, and a clerk does
 * not hold `leave.request` or `dashboard.employee` themselves. Refusing
 * anything the clerk cannot personally do would block the only case that
 * matters while adding nothing — those keys cannot be parlayed into more.
 *
 * Status changes have a second line of defence in the database
 * (`profiles_guard_privileged_status`). Password resets do not and cannot: they
 * go through the GoTrue admin API under the service key, which no policy or
 * trigger ever sees. There, uniquely in this system, this check *is* the
 * protection.
 */
async function mayAdministerAccount(
  session: Session,
  targetId: string,
  /** What is being attempted, for the refusal: "reset its password". */
  act: string,
): Promise<{ ok: true } | { ok: false; message: string }> {
  if (session.permissions.has("access.manage")) return { ok: true };

  // Acting on your own account gains you nothing you did not have.
  if (targetId === session.userId) return { ok: true };

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("permissions_of", { p_user: targetId });

  /*
   * A failure here refuses rather than waving through. The whole point is to
   * establish that the account is safe to reach, and an unanswered question is
   * not a yes.
   */
  if (error) {
    return { ok: false, message: `Could not check that account's access: ${error.message}` };
  }

  const holdsAccessManage = (data ?? []).some((key) =>
    typeof key === "string"
      ? key === "access.manage"
      : String((key as { permissions_of?: string }).permissions_of) === "access.manage",
  );

  if (holdsAccessManage) {
    return {
      ok: false,
      message: `That account can grant access to anyone, so only someone who manages access may ${act}.`,
    };
  }

  return { ok: true };
}

/**
 * Sets someone's password to a value the administrator chooses.
 *
 * Workers forget passwords and have no mailbox to receive a reset link, so the
 * office sets a new one and tells them in person. The value is written to the
 * auth record and never stored anywhere readable — it is echoed back to the
 * administrator once, in the response, so they can pass it on.
 *
 * Guarded by {@link mayAdministerAccount}: `people.manage` is what lets someone
 * reset a worker's password, not what lets them reset an administrator's.
 */
export async function setUserPassword(userId: string, password: string): Promise<UserResult> {
  const session = await requirePermission("people.manage");

  if (!userId) return { ok: false, message: "No user selected." };
  if (password.length < 8) {
    return { ok: false, message: "The password must be at least 8 characters." };
  }

  const allowed = await mayAdministerAccount(session, userId, "reset its password");
  if (!allowed.ok) return { ok: false, message: allowed.message };

  const admin = createServiceClient();
  const { error } = await admin.auth.admin.updateUserById(userId, { password });

  if (error) return { ok: false, message: error.message };

  revalidatePath("/admin/users");
  return { ok: true, message: `Password set to ${password} — tell them before you close this.` };
}

/**
 * Replaces a person's role.
 *
 * The change takes effect on their next request, not on their next sign-out: a
 * database trigger stamps `profiles.roles_changed_at`, and the session loader
 * refuses any token issued before it. Someone demoted while signed in is sent
 * back to the login box rather than keeping the access they had a minute ago.
 */
export async function setUserRole(_prev: UserResult, form: FormData): Promise<UserResult> {
  await requirePermission("access.manage");

  const userId = text(form, "user_id");
  const roleId = text(form, "role_id");
  if (!userId) return { ok: false, message: "No user selected." };

  const supabase = await createClient();
  await supabase.from("user_roles").delete().eq("user_id", userId);

  if (roleId) {
    const { error } = await supabase
      .from("user_roles")
      .insert({ user_id: userId, role_id: roleId });
    if (error) return { ok: false, message: error.message };
  }

  revalidatePath("/admin/users");
  revalidatePath("/admin/roles");
  return { ok: true, message: "Role updated. They must sign in again for it to take effect." };
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
    const { error } = await supabase
      .from("user_permission_overrides")
      .upsert(
        { user_id: userId, permission_id: permissionId, effect },
        { onConflict: "user_id,permission_id,site_id" },
      );
    if (error) return { ok: false, message: error.message };
  }

  revalidatePath("/admin/users");
  return { ok: true, message: "Access updated." };
}

/**
 * Edits the identity/placement fields on an existing profile.
 *
 * Deliberately separate from `createUser` (which also provisions the auth
 * login) and from `updateUserPay` (rates and duty terms) — this is the one
 * place that changes who someone is and where they sit, without touching
 * their money settings or their access.
 */
export async function updateUserProfile(_prev: UserResult, form: FormData): Promise<UserResult> {
  await requirePermission("people.manage");

  const userId = text(form, "user_id");
  if (!userId) return { ok: false, message: "No user selected." };

  const fullName = text(form, "full_name");
  const employeeCode = text(form, "employee_code");
  const cnicRaw = text(form, "cnic");

  if (!fullName || !employeeCode) {
    return { ok: false, message: "Name and employee code are required." };
  }

  const cnic = cnicRaw ? formatCnic(cnicRaw) : null;
  if (cnic && !isValidCnic(cnic)) {
    return { ok: false, message: "A CNIC is 13 digits — XXXXX-XXXXXXX-X." };
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from("profiles")
    .update({
      full_name: fullName,
      employee_code: employeeCode,
      cnic,
      email: text(form, "email").toLowerCase() || null,
      phone: text(form, "phone") || null,
      designation: text(form, "designation") || null,
      site_id: text(form, "site_id") || null,
      department_id: text(form, "department_id") || null,
      shift_id: text(form, "shift_id") || null,
    })
    .eq("id", userId);

  if (error) {
    if (error.code === "23505") {
      const field = error.message.includes("cnic")
        ? `CNIC ${cnic}`
        : `Employee code ${employeeCode}`;
      return { ok: false, message: `${field} is already in use by someone else.` };
    }
    return { ok: false, message: error.message };
  }

  revalidatePath("/admin/users");
  return { ok: true, message: `${fullName}'s profile updated.` };
}

/**
 * Suspends an account, or brings a suspended one back.
 *
 * Guarded by {@link mayAdministerAccount} for the same reason the password
 * reset is: suspension is not only a lockout. A payroll run reads profiles with
 * `status = 'active'`, so suspending someone also removes them from their own
 * pay — and pointed at the CEO by a clerk holding nothing but `people.manage`,
 * that is neither staff administration nor anything the office intended to
 * authorise.
 *
 * The database refuses this too, via `profiles_guard_privileged_status`. The
 * check here exists so the refusal arrives as a sentence someone can act on
 * rather than a raw Postgres error.
 */
export async function setUserStatus(
  userId: string,
  status: "active" | "suspended",
): Promise<UserResult> {
  const session = await requirePermission("people.manage");

  if (!userId) return { ok: false, message: "No user selected." };

  const act = status === "active" ? "reactivate it" : "suspend it";
  const allowed = await mayAdministerAccount(session, userId, act);
  if (!allowed.ok) return { ok: false, message: allowed.message };

  const supabase = await createClient();

  /*
   * `.select()` so a row the policy filtered out is not reported as a change.
   * An UPDATE refused by a USING clause matches nothing and raises nothing,
   * which would otherwise leave an operator certain they had suspended
   * somebody who is still able to sign in.
   */
  const { data, error } = await supabase
    .from("profiles")
    .update({ status })
    .eq("id", userId)
    .select("id");

  if (error) return { ok: false, message: error.message };
  if (!data || data.length === 0) {
    return { ok: false, message: "Nothing changed — that account is not yours to administer." };
  }

  revalidatePath("/admin/users");
  return { ok: true, message: status === "active" ? "Account reactivated." : "Account suspended." };
}
