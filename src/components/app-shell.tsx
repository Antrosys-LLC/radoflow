import Link from "next/link";
import { Building2, Fingerprint } from "lucide-react";

import { AntrosysRibbon, showsAntrosysRibbon } from "@/components/antrosys-ribbon";
import { LiveClock } from "@/components/live-clock";
import { ProfileMenu } from "@/components/profile-menu";
import { SidebarNav, MobileNav } from "@/components/sidebar-nav";
import { navigationFor } from "@/lib/navigation";
import type { Session } from "@/lib/auth/session";

/**
 * The signed-in application frame.
 *
 * A server component: the menu is built from the session's permissions before
 * anything reaches the browser, so a role never receives markup for modules it
 * cannot open.
 */
export function AppShell({ session, children }: { session: Session; children: React.ReactNode }) {
  const sections = navigationFor(session);
  const showRibbon = showsAntrosysRibbon(session);

  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-30 px-3 pt-3 sm:px-5 sm:pt-5">
        <div className="mx-auto flex max-w-[1500px] flex-wrap items-center gap-3 rounded-3xl border border-border bg-card/90 p-3 shadow-[0_1px_2px_rgb(0_0_0/0.04),0_8px_24px_rgb(0_0_0/0.05)] backdrop-blur">
          <Link href="/" className="flex items-center gap-3 pl-1 pr-2">
            <span className="flex size-11 items-center justify-center rounded-2xl bg-charcoal text-charcoal-foreground">
              <Building2 className="size-5" />
            </span>
            <div className="leading-tight">
              <p className="text-sm font-bold tracking-tight text-foreground">
                Rado Dyeing &amp; Textile
              </p>
              <p className="text-[11px] text-muted-foreground">Engineered by Antrosys</p>
            </div>
          </Link>

          <div className="ml-auto flex items-center gap-3">
            <span className="hidden items-center gap-2 rounded-2xl bg-success-soft px-3 py-2 text-xs font-semibold text-success lg:inline-flex">
              <Fingerprint className="size-4" />
              ZKTeco K50
            </span>
            <LiveClock />
            <ProfileMenu session={session} />
          </div>
        </div>
      </header>

      <div className="mx-auto flex max-w-[1500px] gap-5 px-3 py-5 sm:px-5">
        <aside className="sticky top-28 hidden h-fit w-64 shrink-0 rounded-3xl border border-border bg-card p-3 shadow-[0_1px_2px_rgb(0_0_0/0.04),0_8px_24px_rgb(0_0_0/0.05)] lg:block">
          <SidebarNav sections={sections} />
        </aside>

        <main className={`min-w-0 flex-1 pb-24 ${showRibbon ? "lg:pb-10" : "lg:pb-0"}`}>
          {children}
        </main>
      </div>

      <MobileNav sections={sections} />
      {showRibbon ? <AntrosysRibbon /> : null}
    </div>
  );
}
