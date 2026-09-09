"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { useDictionary } from "@/components/language-provider";
import { Latin } from "@/components/latin";
import { NavIcon } from "@/components/nav-icons";
import { cn } from "@/lib/utils";
import type { NavSection } from "@/lib/navigation";

/** Marks the deepest matching entry so /devices/abc still highlights Devices. */
function isActive(pathname: string, href: string): boolean {
  if (href === "/") return pathname === "/";
  return pathname === href || pathname.startsWith(`${href}/`);
}

/**
 * How many requests are waiting on this person, as a badge.
 *
 * Only ever on Approvals, and only when there is something there: a zero on a
 * menu entry is a number to read and dismiss every time the page loads, which
 * is worse than no number at all.
 */
function PendingBadge({ count }: { count: number }) {
  if (count <= 0) return null;

  return (
    <span className="ms-auto inline-flex min-w-5 items-center justify-center rounded-full bg-danger px-1.5 py-0.5 text-[10px] font-bold tabular-nums text-white">
      <Latin>{count}</Latin>
    </span>
  );
}

export function SidebarNav({
  sections,
  pendingApprovals = 0,
}: {
  sections: NavSection[];
  pendingApprovals?: number;
}) {
  const pathname = usePathname();
  const t = useDictionary();

  return (
    <nav className="flex flex-col gap-5">
      {sections.map((section) => (
        <div key={section.titleKey}>
          <p className="px-4 pb-2 text-[11px] font-bold uppercase tracking-widest text-muted-foreground">
            {t.nav[section.titleKey]}
          </p>
          <div className="flex flex-col gap-1">
            {section.items.map((item) => {
              const active = isActive(pathname, item.href);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  aria-current={active ? "page" : undefined}
                  className={cn(
                    "flex items-center gap-3 rounded-2xl px-4 py-3 text-sm font-semibold transition-all duration-300 ease-in-out",
                    active
                      ? "bg-primary text-primary-foreground shadow-[0_12px_30px_rgb(239_86_25/0.28)]"
                      : "text-muted-foreground hover:bg-secondary hover:text-foreground",
                  )}
                >
                  <NavIcon name={item.icon} className="size-5 shrink-0" />
                  {t.nav[item.labelKey]}
                  {item.href === "/approvals" ? <PendingBadge count={pendingApprovals} /> : null}
                </Link>
              );
            })}
          </div>
        </div>
      ))}
    </nav>
  );
}

/**
 * Bottom bar for the factory floor.
 *
 * Capped at five destinations: workers use this on a phone, one-handed, and a
 * scrolling strip of tiny targets is unusable in that setting.
 */
export function MobileNav({
  sections,
  pendingApprovals = 0,
}: {
  sections: NavSection[];
  pendingApprovals?: number;
}) {
  const pathname = usePathname();
  const t = useDictionary();
  const items = sections.flatMap((s) => s.items).slice(0, 5);

  return (
    <nav className="fixed inset-x-0 bottom-0 z-30 border-t border-border bg-card/95 px-2 py-2 backdrop-blur lg:hidden">
      <div className="flex items-stretch justify-around gap-1">
        {items.map((item) => {
          const active = isActive(pathname, item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              aria-current={active ? "page" : undefined}
              className={cn(
                "flex min-w-0 flex-1 flex-col items-center gap-1 rounded-2xl px-1 py-2 text-[10px] font-semibold transition-all duration-300 ease-in-out",
                active ? "bg-primary-soft text-primary" : "text-muted-foreground",
              )}
            >
              <span className="relative">
                <NavIcon name={item.icon} className="size-6 shrink-0" />
                {/* On the icon rather than beside the label: the bottom bar's
                    labels are already truncated at five destinations. */}
                {item.href === "/approvals" && pendingApprovals > 0 ? (
                  <span className="absolute -end-2 -top-1 inline-flex min-w-4 items-center justify-center rounded-full bg-danger px-1 text-[9px] font-bold tabular-nums text-white">
                    <Latin>{pendingApprovals}</Latin>
                  </span>
                ) : null}
              </span>
              <span className="w-full truncate text-center">{t.nav[item.labelKey]}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
