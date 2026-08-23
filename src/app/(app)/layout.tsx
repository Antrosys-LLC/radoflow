import type { ReactNode } from "react";

import { AppShell } from "@/components/app-shell";
import { requireSession } from "@/lib/auth/session";

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
  const session = await requireSession();
  return <AppShell session={session}>{children}</AppShell>;
}
