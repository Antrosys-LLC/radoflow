"use server";

import { revalidatePath } from "next/cache";

import { requirePermission } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";

export interface RoleResult {
  ok: boolean;
  message: string;
}

function slug(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

/**
 * Creates a role.
 *
 * New roles are never superusers. Unrestricted access has to be granted
 * deliberately by editing the role afterwards, so a typo in this form cannot
 * mint a second account with the CEO's reach.
 */
export async function createRole(_prev: RoleResult, form: FormData): Promise<RoleResult> {
  await requirePermission("access.manage");

  const name = String(form.get("name") ?? "").trim();
  if (!name) return { ok: false, message: "Give the role a name." };

  const key = slug(name);
  if (!key) return { ok: false, message: "Use letters or numbers in the role name." };

  const supabase = await createClient();
  const { error } = await supabase.from("roles").insert({
    key,
    name,
    description: String(form.get("description") ?? "").trim() || null,
    is_system: false,
    is_superuser: false,
    rank: Number(String(form.get("rank") ?? "60")) || 60,
  });

  if (error) {
    if (error.code === "23505")
      return { ok: false, message: `A role called ${name} already exists.` };
    return { ok: false, message: error.message };
  }

  revalidatePath("/admin/roles");
  return { ok: true, message: `Role "${name}" created. Now choose what it can do.` };
}

/** Turns one capability on or off for a role. */
export async function toggleRolePermission(
  roleId: string,
  permissionId: string,
  grant: boolean,
): Promise<RoleResult> {
  await requirePermission("access.manage");

  const supabase = await createClient();

  const { error } = grant
    ? await supabase
        .from("role_permissions")
        .upsert(
          { role_id: roleId, permission_id: permissionId },
          { onConflict: "role_id,permission_id" },
        )
    : await supabase
        .from("role_permissions")
        .delete()
        .eq("role_id", roleId)
        .eq("permission_id", permissionId);

  if (error) return { ok: false, message: error.message };

  revalidatePath("/admin/roles");
  return { ok: true, message: grant ? "Capability granted." : "Capability removed." };
}

export async function deleteRole(roleId: string): Promise<RoleResult> {
  await requirePermission("access.manage");

  const supabase = await createClient();

  const { data: role } = await supabase
    .from("roles")
    .select("is_system, name")
    .eq("id", roleId)
    .single();

  if (role?.is_system) {
    return { ok: false, message: `${role.name} is a built-in role and cannot be deleted.` };
  }

  const { count } = await supabase
    .from("user_roles")
    .select("*", { count: "exact", head: true })
    .eq("role_id", roleId);

  if (count && count > 0) {
    return {
      ok: false,
      message: `${count} person(s) still hold this role. Move them to another role first.`,
    };
  }

  const { error } = await supabase.from("roles").delete().eq("id", roleId);
  if (error) return { ok: false, message: error.message };

  revalidatePath("/admin/roles");
  return { ok: true, message: "Role deleted." };
}
