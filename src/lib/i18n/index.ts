import en from "./en";
import roman from "./roman-ur";
import ur from "./ur";

/**
 * The three languages, using the codes the Ask assistant already defines in
 * `src/components/assistant/assistant-conversation.tsx`. One set of codes for
 * one set of languages — two would drift.
 */
export type LanguageCode = "en" | "ur" | "roman-ur";

/** The shape every dictionary must have. English is the source of truth. */
export type Dictionary = typeof en;

const DICTIONARIES: Record<LanguageCode, Dictionary> = { en, ur, "roman-ur": roman };

/** Each language named in its own script, for the picker. */
export const LANGUAGE_LABELS: Record<LanguageCode, string> = {
  en: "English",
  ur: "اردو",
  "roman-ur": "Roman Urdu",
};

/**
 * The language to actually use, given whatever was stored or submitted.
 *
 * Takes `unknown` because it is reached from two untrusted places: a profiles
 * row written before the column was constrained, and the browser at the
 * toggle. Anything unrecognised is English — the safe default, since English
 * is what the app was written in, and because the two translations are still
 * awaiting review by a native speaker.
 */
export function resolveLanguage(value: unknown): LanguageCode {
  return value === "ur" || value === "roman-ur" || value === "en" ? value : "en";
}

export function dictionaryFor(language: LanguageCode): Dictionary {
  return DICTIONARIES[language];
}

/**
 * Urdu script reads right to left. Roman Urdu does not — it is Urdu written
 * in Latin letters, and flipping it would be wrong.
 */
export function directionFor(language: LanguageCode): "ltr" | "rtl" {
  return language === "ur" ? "rtl" : "ltr";
}

/**
 * The plain-string sibling of `<Latin>` (`src/components/latin.tsx`), for the
 * places `<Latin>` cannot reach: a server action returns `message: string` for
 * a toast, and a string has no JSX to render through.
 *
 * The problem is the same one `<Latin>` solves. Inside a right-to-left
 * sentence, a Latin run with no strong RTL character of its own — a serial
 * number, a firmware string, a quoted name — is fair game for the Unicode
 * bidirectional algorithm to reorder on display. Wrapping it in U+2066
 * (LEFT-TO-RIGHT ISOLATE) and U+2069 (POP DIRECTIONAL ISOLATE) tells the
 * algorithm to leave the run alone, the same way `<bdi dir="ltr">` does for
 * React children. Nothing about the value changes; only the two invisible
 * control characters are added around it.
 */
const LEFT_TO_RIGHT_ISOLATE = "\u2066";
const POP_DIRECTIONAL_ISOLATE = "\u2069";

export function isolate(value: string): string {
  return `${LEFT_TO_RIGHT_ISOLATE}${value}${POP_DIRECTIONAL_ISOLATE}`;
}
