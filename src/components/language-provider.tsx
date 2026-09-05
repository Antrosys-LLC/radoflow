"use client";

import { createContext, useContext, type ReactNode } from "react";

import { dictionaryFor, type Dictionary, type LanguageCode } from "@/lib/i18n";

/**
 * The language, for client components.
 *
 * Server components call `dictionaryFor` directly — they already hold the
 * session. This exists for the 62 client components that do not, and is a
 * context rather than a prop because a prop every component needs is a
 * context wearing a disguise.
 */
const LanguageContext = createContext<LanguageCode>("en");

export function LanguageProvider({
  language,
  children,
}: {
  language: LanguageCode;
  children: ReactNode;
}) {
  return <LanguageContext.Provider value={language}>{children}</LanguageContext.Provider>;
}

export function useLanguage(): LanguageCode {
  return useContext(LanguageContext);
}

export function useDictionary(): Dictionary {
  return dictionaryFor(useContext(LanguageContext));
}
