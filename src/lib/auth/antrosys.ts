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
