import type { ReactNode } from "react";

import { AppShell } from "@/components/app-shell";
import { CapabilitiesProvider } from "@/components/capabilities";
import { LanguageProvider } from "@/components/language-provider";
import { cookies } from "next/headers";

import { requireSession } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { canUseAssistant } from "@/lib/auth/antrosys";
import { resolveThemeChoice, THEME_COOKIE } from "@/lib/theme";

/**
 * Nothing in this group can be prerendered: every route reads the session
 * cookie. Declaring it here rather than page by page means a new screen cannot
 * be added without it and quietly break the production build — which is how
 * `/denied` came to fail a build that was otherwise green.
 */
export const dynamic = "force-dynamic";

/**
 * Every route in this group requires a session. The middleware already
 * redirects anonymous requests; this is the second gate, so a missing session
 * can never render a page with an empty shell.
 */
export default async function AppLayout({ children }: { children: ReactNode }) {
  const [session, store] = await Promise.all([requireSession(), cookies()]);

  /*
   * Requests waiting on this person, for the badge.
   *
   * A `head` count rather than a read: the number is all the menu needs, and
   * this runs on every navigation. The row policy already limits it to what
   * they may see, so an ordinary employee counts nothing.
   */
  const supabase = await createClient();
  const { count: pendingApprovals } = await supabase
    .from("change_requests")
    .select("id", { count: "exact", head: true })
    .eq("status", "pending");
  const theme = resolveThemeChoice(store.get(THEME_COOKIE)?.value);

  /*
   * The provider is seeded here rather than in the root layout because this is
   * the first point at which the session — and so the person's language — is
   * known. Server components below read `session.profile.language` directly;
   * this is the same value, handed to the client components that cannot.
   */
  return (
    <LanguageProvider language={session.profile.language}>
      <CapabilitiesProvider value={{ assistant: canUseAssistant(session) }}>
        <AppShell session={session} theme={theme} pendingApprovals={pendingApprovals ?? 0}>
          {children}
        </AppShell>
      </CapabilitiesProvider>
    </LanguageProvider>
  );
}
