import type { Session } from "@/lib/auth/session";

/**
 * The one rank above every other.
 *
 * Admin — Antrosys maintains the system; the CEO runs the company. Until now
 * the two were indistinguishable to the code — both are `is_superuser`, and a
 * superuser resolves to the whole permission catalogue, so there was no
 * capability one held and the other did not.
 *
 * That is fine for almost everything and wrong for two kinds of thing:
 *
 *  - What the *system* costs to run. The Anthropic bill, the rupee rate it is
 *    converted at, the monthly ceiling on it: these are Antrosys's own
 *    operating figures, not the factory's, and putting them in front of the
 *    people who are billed for them invites a conversation about a number they
 *    cannot act on.
 *  - Who signs off a change. Everybody else's corrections queue for approval,
 *    including the CEO's; Antrosys is the one who fixes what the approval
 *    workflow itself gets wrong, and cannot be made to wait for it.
 *
 * Deliberately keyed on the role rather than on a permission. A permission can
 * be granted to another role from the access screen, which would quietly
 * recreate the equivalence this exists to break — the role key cannot.
 */

export const ANTROSYS_ROLE = "admin-antrosys";

export function isAntrosys(session: Session | null): boolean {
  return session?.roles.some((role) => role.key === ANTROSYS_ROLE) ?? false;
}

/**
 * The owners of the business — Arham Sethi and Ghaffar Sethi.
 *
 * Unrestricted, and the only people besides Antrosys who decide who gets
 * access to anything, other C-Levels included. The database holds the same
 * line in `app.guard_leadership_roles`; this is the courtesy in the screen.
 */
export const OWNER_ROLE = "owner";

/**
 * C-Level. The key stays `ceo` so nothing reading the key has to change; the
 * role is named "C-Level" everywhere a person sees it.
 */
export const C_LEVEL_ROLE = "ceo";

export function isOwner(session: Session | null): boolean {
  return session?.roles.some((role) => role.key === OWNER_ROLE) ?? false;
}

/** An owner or any other C-Level. */
export function isCLevel(session: Session | null): boolean {
  return (
    session?.roles.some((role) => role.key === OWNER_ROLE || role.key === C_LEVEL_ROLE) ?? false
  );
}

/** May give or take away leadership roles: an owner, or Antrosys. */
export function canGrantLeadership(session: Session | null): boolean {
  return isOwner(session) || isAntrosys(session);
}

/** The roles that run the business and the system, and answer for their cost. */
export const LEADERSHIP_ROLES = [ANTROSYS_ROLE, OWNER_ROLE, C_LEVEL_ROLE] as const;

export function isLeadership(session: Session | null): boolean {
  return session?.roles.some((role) => LEADERSHIP_ROLES.includes(role.key as never)) ?? false;
}

/**
 * Who may ask Claude anything.
 *
 * Keyed on the role, not on `assistant.ask`, and that is the point. Every
 * question costs real money against a monthly ceiling, and the two roles here
 * are the two that answer for that spend. A permission can be granted to
 * another role from the access screen in two clicks — which is how Operations
 * and Manager came to hold it when the assistant was a reporting convenience,
 * long before it appeared on every record in the app.
 *
 * The permission still exists and the migration still revokes the old grants;
 * this is the belt to that braces, so re-granting the key by accident does not
 * quietly reopen a bill to four hundred people.
 */
export function canUseAssistant(session: Session | null): boolean {
  return session?.roles.some((role) => LEADERSHIP_ROLES.includes(role.key as never)) ?? false;
}
