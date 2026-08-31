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

/**
 * When the current access token was issued, in milliseconds.
 *
 * Read from the token's own `iat` claim rather than from the cookie's age. The
 * claim is signed, so it cannot be back-dated by a client hoping to keep a
 * session that an access change should have ended. Returns null when the claim
 * cannot be read, which is treated as "do not force a sign-out" — a malformed
 * token is already going to fail the real auth check.
 */
function issuedAt(accessToken: string | undefined): number | null {
  if (!accessToken) return null;

  const payload = accessToken.split(".")[1];
  if (!payload) return null;

  try {
    const decoded = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as {
      iat?: number;
    };
    return typeof decoded.iat === "number" ? decoded.iat * 1000 : null;
  } catch {
    return null;
  }
}

/**
 * Marks a session that is authentic but out of date: the person's roles or
 * permissions changed after their token was issued.
 *
 * Distinguished from "not signed in" because the two need opposite handling —
 * an anonymous visitor goes to the login box, while this person still holds a
 * valid cookie and must be signed out first or the middleware will bounce them
 * straight back off /login.
 */
export const ACCESS_CHANGED = "access-changed" as const;

export const getSession = cache(async (): Promise<Session | null> => {
  const result = await loadSession();
  return result === ACCESS_CHANGED ? null : result;
});

const loadSession = cache(async (): Promise<Session | typeof ACCESS_CHANGED | null> => {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return null;

  const [profileResult, rolesResult, permissionsResult] = await Promise.all([
    supabase
      .from("profiles")
      .select(
        "id, employee_code, full_name, email, photo_url, designation, site_id, department_id, pay_class, requires_attendance, roles_changed_at",
      )
      .eq("id", user.id)
      .single(),
    supabase.rpc("my_roles"),
    supabase.rpc("my_permissions"),
  ]);

  const row = profileResult.data;
  if (!row) return null;

  /*
   * A token issued before this person's access last changed is stale: it was
   * minted under the old role and the permissions below would be resolved from
   * a set they no longer hold. Refuse it and make them sign in again.
   */
  const changedAt = row.roles_changed_at ? Date.parse(row.roles_changed_at) : null;
  const tokenIssuedAt = issuedAt((await supabase.auth.getSession()).data.session?.access_token);

  if (changedAt !== null && tokenIssuedAt !== null && tokenIssuedAt < changedAt) {
    return ACCESS_CHANGED;
  }

  const roles: SessionRole[] = (rolesResult.data ?? []).map((r) => ({
    key: r.key,
    name: r.name,
    isSuperuser: r.is_superuser,
    rank: r.rank,
  }));

  // my_permissions() returns a set of scalars; supabase-js surfaces those as
  // either bare strings or single-key objects depending on the driver path.
  const permissionKeys = (permissionsResult.data ?? []).map((entry) =>
    typeof entry === "string"
      ? entry
      : String((entry as { my_permissions?: string }).my_permissions),
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
  const session = await loadSession();

  /*
   * Sent to /auth/reauth rather than straight to /login: the cookie is still
   * valid, and the middleware redirects anyone holding a valid cookie away
   * from the login page. That route signs them out first, which breaks the
   * loop the direct redirect would create.
   */
  if (session === ACCESS_CHANGED) redirect("/auth/reauth");
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

/**
 * Guards a page behind *any* of several permissions.
 *
 * The menu already works this way — a nav entry lists every capability that
 * should reveal it — so a page guarded by only the first of those keys is
 * reachable in the menu and refused on arrival. That is how the Operations
 * role came to see Attendance in its sidebar and land on /denied: it holds
 * `attendance.view.all` company-wide but not the narrower `attendance.view`,
 * and the page asked for the narrow one.
 *
 * Pages whose nav entry lists more than one permission must use this, so the
 * two cannot drift apart again.
 */
export async function requireAnyPermission(permissions: readonly string[]): Promise<Session> {
  const session = await requireSession();
  if (!permissions.some((permission) => session.permissions.has(permission))) redirect("/denied");
  return session;
}

export function can(session: Session | null, permission: string): boolean {
  return session?.permissions.has(permission) ?? false;
}

export function canAny(session: Session | null, permissions: readonly string[]): boolean {
  return permissions.some((p) => can(session, p));
}
