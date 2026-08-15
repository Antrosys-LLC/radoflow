import { cache } from "react";
import { redirect } from "next/navigation";

import { createClient } from "@/lib/supabase/server";

/**
 * Who is signed in, and what they may do.
 *
 * Wrapped in React's `cache` so a page, its layout and every server component
 * beneath share one round trip per request instead of each issuing their own.
 */

export interface SessionProfile {
  id: string;
  employeeCode: string;
  fullName: string;
  email: string | null;
  photoUrl: string | null;
  designation: string | null;
  siteId: string | null;
  departmentId: string | null;
  payClass: "monthly" | "hourly";
  requiresAttendance: boolean;
}

export interface SessionRole {
  key: string;
  name: string;
  isSuperuser: boolean;
  rank: number;
}

export interface Session {
  userId: string;
  profile: SessionProfile;
  roles: SessionRole[];
  /** Effective permission keys, superuser expansion already applied. */
  permissions: Set<string>;
  isSuperuser: boolean;
  /** The highest-ranking role, used to pick the default landing page. */
  primaryRole: SessionRole | null;
}

export const getSession = cache(async (): Promise<Session | null> => {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return null;

  const [profileResult, rolesResult, permissionsResult] = await Promise.all([
    supabase
      .from("profiles")
      .select(
        "id, employee_code, full_name, email, photo_url, designation, site_id, department_id, pay_class, requires_attendance",
      )
      .eq("id", user.id)
      .single(),
    supabase.rpc("my_roles"),
    supabase.rpc("my_permissions"),
  ]);

  const row = profileResult.data;
  if (!row) return null;

  const roles: SessionRole[] = (rolesResult.data ?? []).map((r) => ({
    key: r.key,
    name: r.name,
    isSuperuser: r.is_superuser,
    rank: r.rank,
  }));

  // my_permissions() returns a set of scalars; supabase-js surfaces those as
  // either bare strings or single-key objects depending on the driver path.
  const permissionKeys = (permissionsResult.data ?? []).map((entry) =>
    typeof entry === "string" ? entry : String((entry as { my_permissions?: string }).my_permissions),
  );

  return {
    userId: user.id,
    profile: {
      id: row.id,
      employeeCode: row.employee_code,
      fullName: row.full_name,
      email: row.email,
      photoUrl: row.photo_url,
      designation: row.designation,
      siteId: row.site_id,
      departmentId: row.department_id,
      payClass: row.pay_class,
      requiresAttendance: row.requires_attendance,
    },
    roles,
    permissions: new Set(permissionKeys),
    isSuperuser: roles.some((r) => r.isSuperuser),
    primaryRole: roles[0] ?? null,
  };
});

/** For pages that must not render without a session. */
export async function requireSession(): Promise<Session> {
  const session = await getSession();
  if (!session) redirect("/login");
  return session;
}

/**
 * Guards a page behind a permission.
 *
 * A second line of defence, not the only one — RLS still governs the data. The
 * point here is to show a clear "not for your role" page instead of an empty
 * table that looks broken.
 */
export async function requirePermission(permission: string): Promise<Session> {
  const session = await requireSession();
  if (!session.permissions.has(permission)) redirect("/denied");
  return session;
}

export function can(session: Session | null, permission: string): boolean {
  return session?.permissions.has(permission) ?? false;
}

export function canAny(session: Session | null, permissions: readonly string[]): boolean {
  return permissions.some((p) => can(session, p));
}
