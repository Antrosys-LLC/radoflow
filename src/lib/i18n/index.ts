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
