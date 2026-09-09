import Link from "next/link";
import { Building2, CreditCard, Fingerprint, KeyRound, ScanFace } from "lucide-react";

import { AntrosysRibbon, showsAntrosysRibbon } from "@/components/antrosys-ribbon";
import { AssistantWidget } from "@/components/assistant/assistant-widget";
import { Fill } from "@/components/fill";
import { LanguageSwitch } from "@/components/language-switch";
import { Latin } from "@/components/latin";
import { ClockAndDate } from "@/components/clock-and-date";
import { ProfileMenu } from "@/components/profile-menu";
import { SidebarNav, MobileNav } from "@/components/sidebar-nav";
import { ThemeSwitch } from "@/components/theme-switch";
import { canUseAssistant } from "@/lib/auth/antrosys";
import { dictionaryFor } from "@/lib/i18n";
import { navigationFor } from "@/lib/navigation";
import type { Session } from "@/lib/auth/session";
import type { ThemeChoice } from "@/lib/theme";

/**
 * The signed-in application frame.
 *
 * A server component: the menu is built from the session's permissions before
 * anything reaches the browser, so a role never receives markup for modules it
 * cannot open.
 */
export function AppShell({
  session,
  theme,
  pendingApprovals,
  children,
}: {
  session: Session;
  /** The stored theme choice, so the switch opens on the right option. */
  theme: ThemeChoice;
  /** Requests waiting on this person, for the badge on the menu entry. */
  pendingApprovals: number;
  children: React.ReactNode;
}) {
  const t = dictionaryFor(session.profile.language);
  const sections = navigationFor(session);
  const showRibbon = showsAntrosysRibbon(session);
  // Same gate as the /assistant page and the API route, so the button is
  // never rendered for somebody whose question would be refused anyway.
  const showAssistant = canUseAssistant(session);

  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-30 px-3 pt-3 sm:px-5 sm:pt-5">
        <div className="mx-auto flex max-w-[1500px] flex-wrap items-center gap-3 rounded-3xl border border-border bg-card/90 p-3 shadow-[0_1px_2px_rgb(0_0_0/0.04),0_8px_24px_rgb(0_0_0/0.05)] backdrop-blur">
          <Link href="/" className="flex items-center gap-3 ps-1 pe-2">
            <span className="flex size-11 items-center justify-center rounded-2xl bg-charcoal text-charcoal-foreground">
              <Building2 className="size-5" />
            </span>
            <div className="leading-tight">
              <p className="text-sm font-bold tracking-tight text-foreground">
                <Latin>Rado Dyeing &amp; Textile</Latin>
              </p>
              <p className="text-[11px] text-muted-foreground">
                <Fill template={t.common.engineeredBy} values={{ company: "Antrosys" }} />
              </p>
            </div>
          </Link>

          <div className="ms-auto flex items-center gap-3">
            {/* How staff can identify themselves at a terminal. The model name
                meant nothing to anyone on the floor; the four methods do. */}
            <span
              className="hidden items-center gap-2 rounded-2xl bg-success-soft px-3 py-2 text-success lg:inline-flex"
              title={t.common.identifyMethods}
            >
              <Fingerprint className="size-4" aria-hidden />
              <CreditCard className="size-4" aria-hidden />
              <ScanFace className="size-4" aria-hidden />
              <KeyRound className="size-4" aria-hidden />
              <span className="sr-only">{t.common.identifyMethodsHint}</span>
            </span>
            <ClockAndDate />
            <ThemeSwitch initial={theme} />
            <LanguageSwitch />
            <ProfileMenu session={session} />
          </div>
        </div>
      </header>

      <div className="mx-auto flex max-w-[1500px] gap-5 px-3 py-5 sm:px-5">
        <aside className="sticky top-28 hidden max-h-[calc(100vh-8rem)] w-64 shrink-0 overflow-y-auto overscroll-contain rounded-3xl border border-border bg-card p-3 shadow-[0_1px_2px_rgb(0_0_0/0.04),0_8px_24px_rgb(0_0_0/0.05)] lg:block">
          <SidebarNav sections={sections} pendingApprovals={pendingApprovals} />
        </aside>

        <main className={`min-w-0 flex-1 pb-24 ${showRibbon ? "lg:pb-10" : "lg:pb-0"}`}>
          {children}
        </main>
      </div>

      {showRibbon ? <AntrosysRibbon /> : null}
      <MobileNav sections={sections} pendingApprovals={pendingApprovals} />

      {showAssistant ? (
        <AssistantWidget
          firstName={session.profile.fullName.split(" ")[0] ?? t.common.nameFallback}
          hasRibbon={showRibbon}
        />
      ) : null}
    </div>
  );
}
