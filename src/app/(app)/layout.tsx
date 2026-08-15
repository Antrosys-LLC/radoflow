import type { ReactNode } from "react";

import { AppShell } from "@/components/app-shell";
import { requireSession } from "@/lib/auth/session";
// Still required by the not-yet-rebuilt demo screens (dashboard, payroll,
// admin). Remove once each of those reads from Supabase.
import { AppProvider } from "@/lib/app-context";

/**
 * Every route in this group requires a session. The middleware already
 * redirects anonymous requests; this is the second gate, so a missing session
 * can never render a page with an empty shell.
 */
export default async function AppLayout({ children }: { children: ReactNode }) {
  const session = await requireSession();
  return (
    <AppShell session={session}>
      <AppProvider>{children}</AppProvider>
    </AppShell>
  );
}
