import type { Metadata } from "next";

import { requirePermission } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";

import { UsersManager, type PermissionOption, type UserRow } from "./users-manager";

export const metadata: Metadata = {
  title: { absolute: "User Accounts | Rado Dyeing and Textile" },
  description: "Add users, assign roles and grant individual access.",
};

export const dynamic = "force-dynamic";

export default async function UsersPage() {
  const session = await requirePermission("people.manage");
  const canManageAccess = session.permissions.has("access.manage");
  const supabase = await createClient();

  const [
    { data: profiles },
    { data: roles },
    { data: userRoles },
    { data: overrides },
    { data: sites },
    { data: departments },
    { data: shifts },
    { data: permissions },
    { data: payComponents },
  ] = await Promise.all([
    supabase
      .from("profiles")
      .select(
        "id, employee_code, full_name, cnic, email, phone, designation, status, worker_type, pay_class, monthly_salary, hourly_rate, duty_hours, sunday_policy, requires_attendance, flexible_hours, overtime_eligible, site_id, department_id, shift_id",
      )
      .order("full_name"),
    supabase.from("roles").select("id, name, is_superuser").order("rank"),
    supabase.from("user_roles").select("user_id, role_id"),
    supabase.from("user_permission_overrides").select("user_id, permission_id, effect"),
    supabase.from("sites").select("id, name").order("name"),
    supabase.from("departments").select("id, name, default_worker_type").order("name"),
    supabase.from("shifts").select("id, name").order("sort_order"),
    supabase.from("permissions").select("id, module, label").order("module"),
    supabase
      .from("profile_pay_components")
      .select("id, profile_id, label, kind, amount, effective_from, effective_to")
      .order("effective_from", { ascending: false }),
  ]);

  const roleById = new Map((roles ?? []).map((r) => [r.id, r]));
  const roleOfUser = new Map((userRoles ?? []).map((ur) => [ur.user_id, ur.role_id]));

  const overridesByUser = new Map<string, { permissionId: string; effect: string }[]>();
  for (const row of overrides ?? []) {
    const list = overridesByUser.get(row.user_id) ?? [];
    list.push({ permissionId: row.permission_id, effect: row.effect });
    overridesByUser.set(row.user_id, list);
  }

  // Per-person allowances and deductions, grouped so each card carries its own.
  const componentsByUser = new Map<string, UserRow["components"]>();
  for (const row of payComponents ?? []) {
    const list = componentsByUser.get(row.profile_id) ?? [];
    list.push({
      id: row.id,
      label: row.label,
      kind: row.kind,
      amount: Number(row.amount),
      effectiveFrom: row.effective_from,
      effectiveTo: row.effective_to,
    });
    componentsByUser.set(row.profile_id, list);
  }

  const users: UserRow[] = (profiles ?? []).map((profile) => {
    const roleId = roleOfUser.get(profile.id) ?? null;
    const role = roleId ? roleById.get(roleId) : undefined;
    return {
      id: profile.id,
      employee_code: profile.employee_code,
      cnic: profile.cnic,
      full_name: profile.full_name,
      email: profile.email,
      phone: profile.phone,
      designation: profile.designation,
      status: profile.status,
      roleId,
      roleName: role?.name ?? "No role",
      isSuperuser: role?.is_superuser ?? false,
      overrides: overridesByUser.get(profile.id) ?? [],
      workerType: profile.worker_type,
      payClass: profile.pay_class,
      monthlySalary: Number(profile.monthly_salary),
      hourlyRate: Number(profile.hourly_rate),
      dutyHours: Number(profile.duty_hours),
      sundayPolicy: profile.sunday_policy,
      requiresAttendance: profile.requires_attendance,
      flexibleHours: profile.flexible_hours,
      overtimeEligible: profile.overtime_eligible,
      siteId: profile.site_id,
      departmentId: profile.department_id,
      shiftId: profile.shift_id,
      components: componentsByUser.get(profile.id) ?? [],
    };
  });

  return (
    <UsersManager
      users={users}
      roles={(roles ?? []).map((r) => ({ id: r.id, name: r.name }))}
      sites={sites ?? []}
      departments={(departments ?? []).map((d) => ({
        id: d.id,
        name: d.name,
        defaultWorkerType: d.default_worker_type,
      }))}
      shifts={shifts ?? []}
      permissions={(permissions ?? []) as PermissionOption[]}
      canManageAccess={canManageAccess}
    />
  );
}
