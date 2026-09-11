"use client";

import { createContext, useContext, type ReactNode } from "react";

/**
 * The handful of yes/no facts about the signed-in person that client
 * components all over the app need.
 *
 * Seeded once in the signed-in layout, where the session is already loaded, so
 * nothing below has to fetch anything or take another prop. The alternative
 * shapes were both worse: threading a boolean through eight screens to reach
 * an Ask button, or having each Ask button ask the server — which on the user
 * accounts screen would be four hundred round trips to answer one question.
 *
 * Deliberately tiny. This is not a mirror of the session: anything the server
 * can decide belongs on the server, and a growing bag of flags in the browser
 * is how permission checks end up being made in two places that disagree.
 */

export interface Capabilities {
  /** May ask Claude anything at all — the two leadership roles only. */
  assistant: boolean;
}

const CapabilitiesContext = createContext<Capabilities>({ assistant: false });

export function CapabilitiesProvider({
  value,
  children,
}: {
  value: Capabilities;
  children: ReactNode;
}) {
  return <CapabilitiesContext.Provider value={value}>{children}</CapabilitiesContext.Provider>;
}

export function useCapabilities(): Capabilities {
  return useContext(CapabilitiesContext);
}
