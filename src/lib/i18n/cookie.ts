import { resolveLanguage, type LanguageCode } from "@/lib/i18n";

/**
 * The interface language, remembered on the device as well as on the profile.
 *
 * The profile is still where the preference belongs — it should follow a
 * person to whatever phone or terminal they sign in on — but it is not enough
 * on its own for two reasons that both showed up in practice:
 *
 *  - A profile write is a round trip and a full re-render before the screen
 *    changes. The cookie is read on the very next request, so the language
 *    changes on the tap.
 *  - A database whose `language` column has not been migrated yet refuses the
 *    write, and a toggle that answers with a PostgREST error is a toggle
 *    nobody trusts again. With the cookie the choice still takes effect, and
 *    the profile catches up the moment the column exists.
 *
 * The cookie wins when it is set, because it is only ever written by somebody
 * deliberately choosing a language on this device, and that is more recent
 * information than a column default. On a device that has never been used to
 * choose, there is no cookie and the profile decides — which is exactly the
 * "follows me to the next terminal" behaviour the column exists for.
 */

export const LANGUAGE_COOKIE = "radoflow-language";

/** A year: this is a preference, not a session, and it should outlive one. */
export const LANGUAGE_COOKIE_MAX_AGE = 60 * 60 * 24 * 365;

/**
 * The language to render, given the cookie and the profile.
 *
 * Takes `unknown` for both because one comes off a request header and the
 * other out of a database row — neither is trustworthy, and `resolveLanguage`
 * is what makes anything unrecognised English.
 */
export function preferredLanguage(cookie: unknown, profile: unknown): LanguageCode {
  const fromCookie = typeof cookie === "string" ? cookie : null;
  if (fromCookie === "en" || fromCookie === "ur" || fromCookie === "roman-ur") {
    return fromCookie;
  }
  return resolveLanguage(profile);
}
