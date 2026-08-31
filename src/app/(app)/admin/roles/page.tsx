import type { Metadata } from "next";

import { requirePermission } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";

import { RolesManager, type PermissionRow, type RoleRow } from "./roles-manager";

export const metadata: Metadata = {
  title: { absolute: "Roles & Access | Rado Dyeing and Textile" },
  description: "Create roles and choose exactly what each one can do.",
};

export const dynamic = "force-dynamic";

export default async function RolesPage() {
  await requirePermission("access.manage");
  const supabase = await createClient();

  const [{ data: roles }, { data: permissions }, { data: rolePerms }, { data: userRoles }] =
    await Promise.all([
      supabase.from("roles").select("*").order("rank"),
      supabase.from("permissions").select("id, key, module, label, description").order("module"),
      supabase.from("role_permissions").select("role_id, permission_id"),
      supabase.from("user_roles").select("role_id"),
    ]);

  const holderCount = new Map<string, number>();
  for (const row of userRoles ?? []) {
    holderCount.set(row.role_id, (holderCount.get(row.role_id) ?? 0) + 1);
  }

  const permsByRole = new Map<string, string[]>();
  for (const row of rolePerms ?? []) {
    const list = permsByRole.get(row.role_id) ?? [];
    list.push(row.permission_id);
    permsByRole.set(row.role_id, list);
  }

  const roleRows: RoleRow[] = (roles ?? []).map((role) => ({
    id: role.id,
    key: role.key,
    name: role.name,
    description: role.description,
    is_system: role.is_system,
    is_superuser: role.is_superuser,
    holders: holderCount.get(role.id) ?? 0,
    permissionIds: permsByRole.get(role.id) ?? [],
  }));

  return <RolesManager roles={roleRows} permissions={(permissions ?? []) as PermissionRow[]} />;
}
