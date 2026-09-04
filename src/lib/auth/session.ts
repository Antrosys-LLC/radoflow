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

/**
 * Shape of the one JSON document `session_bootstrap()` returns.
 *
 * Declared rather than inferred: the RPC is typed as `Json` on the generated
 * client, and reading fields off that directly is an error at every use site.
 */
interface BootstrapPayload {
  profile: {
    id: string;
    employee_code: string;
    full_name: string;
    email: string | null;
    photo_url: string | null;
    designation: string | null;
    site_id: string | null;
    department_id: string | null;
    pay_class: "monthly" | "hourly";
    requires_attendance: boolean;
    roles_changed_at: string | null;
  } | null;
  roles: { key: string; name: string; is_superuser: boolean; rank: number }[];
  permissions: string[];
}

/**
 * Set once if `session_bootstrap()` is missing, so a deployment whose code is
 * ahead of its migrations degrades to the old three-call path instead of
 * failing every page — and pays the cost of discovering that exactly once per
 * process rather than on every request.
 */
let bootstrapAvailable = true;

/** The pre-bootstrap path: profile, roles and permissions as three calls. */
async function loadTheLongWay(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string,
): Promise<BootstrapPayload> {
  const [profileResult, rolesResult, permissionsResult] = await Promise.all([
    supabase
      .from("profiles")
      .select(
        "id, employee_code, full_name, email, photo_url, designation, site_id, department_id, pay_class, requires_attendance, roles_changed_at",
      )
      .eq("id", userId)
      .single(),
    supabase.rpc("my_roles"),
    supabase.rpc("my_permissions"),
  ]);

  // my_permissions() returns a set of scalars; supabase-js surfaces those as
  // either bare strings or single-key objects depending on the driver path.
  const permissions = (permissionsResult.data ?? []).map((entry) =>
    typeof entry === "string"
      ? entry
      : String((entry as { my_permissions?: string }).my_permissions),
  );

  return {
    profile: profileResult.data as BootstrapPayload["profile"],
    roles: rolesResult.data ?? [],
    permissions,
  };
}

const loadSession = cache(async (): Promise<Session | typeof ACCESS_CHANGED | null> => {
  const supabase = await createClient();

  /*
   * The token is verified in-process, not at the auth server.
   *
   * This project signs with an asymmetric key, so getClaims() checks the
   * signature against the cached JWKS using WebCrypto and returns without a
   * network request. getUser() asked the auth server the same question over
   * the wire — roughly 600ms from Pakistan — on top of the identical call the
   * middleware had already made moments earlier for the same request.
   *
   * The claims are as trustworthy as getUser()'s answer: a cookie that was
   * tampered with fails the signature check and lands in the `!claims` branch.
   * `iat` and `sub` come from the verified payload, which also removes the
   * hand-rolled base64 decoding this function used to do.
   */
  const { data: verified } = await supabase.auth.getClaims();
  const claims = verified?.claims;

  if (!claims?.sub) return null;

  const payload = bootstrapAvailable
    ? await loadViaBootstrap(supabase, claims.sub)
    : await loadTheLongWay(supabase, claims.sub);

  const row = payload?.profile;
  if (!row) return null;

  /*
   * A token issued before this person's access last changed is stale: it was
   * minted under the old role and the permissions below would be resolved from
   * a set they no longer hold. Refuse it and make them sign in again.
   */
  const changedAt = row.roles_changed_at ? Date.parse(row.roles_changed_at) : null;
  const tokenIssuedAt = typeof claims.iat === "number" ? claims.iat * 1000 : null;

  if (changedAt !== null && tokenIssuedAt !== null && tokenIssuedAt < changedAt) {
    return ACCESS_CHANGED;
  }

  const roles: SessionRole[] = (payload.roles ?? []).map((r) => ({
    key: r.key,
    name: r.name,
    isSuperuser: r.is_superuser,
    rank: r.rank,
  }));

  return {
    userId: claims.sub,
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
    permissions: new Set(payload.permissions ?? []),
    isSuperuser: roles.some((r) => r.isSuperuser),
    primaryRole: roles[0] ?? null,
  };
});

/**
 * Profile, roles and permissions in one call, falling back permanently if the
 * function is not in the database yet.
 */
async function loadViaBootstrap(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string,
): Promise<BootstrapPayload> {
  const { data, error } = await supabase.rpc("session_bootstrap" as never);

  if (error) {
    /*
     * Only "no such function" retires the fast path for good.
     *
     * PGRST202 is PostgREST saying the function is not in the schema — the
     * database has not had the migration applied, and asking again on the next
     * request would waste a round trip on every request forever. Anything else
     * (a timeout, a blip, a connection reset) is transient: fall back for this
     * request only, or one bad second would leave the process on the slow path
     * until it happened to be restarted.
     */
    const missing = error.code === "PGRST202";

    if (missing) {
      bootstrapAvailable = false;
      console.warn(
        "[session] session_bootstrap() is not in the database; using the slower three-call " +
          "path. Apply supabase/migrations/20260902090000_session_bootstrap.sql to restore it.",
      );
    } else {
      console.warn(
        `[session] session_bootstrap() failed (${error.message}); retrying the long way.`,
      );
    }

    return loadTheLongWay(supabase, userId);
  }

  return data as unknown as BootstrapPayload;
}

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
