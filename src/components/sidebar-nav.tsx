"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { Menu, X } from "lucide-react";

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
 * Four destinations stay one tap away, one-handed on a phone; a fifth button,
 * More, opens a sheet with every page the person can open, grouped as in the
 * sidebar. Before it, everything past the fifth entry (the canteen among them)
 * could not be reached from a phone at all.
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
  const [open, setOpen] = useState(false);
  const all = sections.flatMap((s) => s.items);
  const primary = all.length > 5 ? all.slice(0, 4) : all;
  const hasMore = all.length > 5;
  const moreActive = hasMore && !primary.some((item) => isActive(pathname, item.href)) && pathname !== "/";

  useEffect(() => {
    if (!open) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previous;
    };
  }, [open]);

  const badge = (count: number) =>
    count > 0 ? (
      <span className="absolute -end-2 -top-1 inline-flex min-w-4 items-center justify-center rounded-full bg-danger px-1 text-[9px] font-bold tabular-nums text-white">
        <Latin>{count}</Latin>
      </span>
    ) : null;

  return (
    <>
      {open ? (
        <div className="fixed inset-0 z-40 lg:hidden">
          <button
            type="button"
            aria-label={t.common.close}
            onClick={() => setOpen(false)}
            className="absolute inset-0 bg-black/40"
          />
          <div className="absolute inset-x-0 bottom-0 flex max-h-[85vh] flex-col rounded-t-3xl border-t border-border bg-card shadow-2xl">
            <div className="flex items-center justify-between px-5 pb-2 pt-4">
              <p className="text-sm font-bold text-foreground">{t.common.more}</p>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="rounded-xl p-2 text-muted-foreground hover:bg-secondary"
                aria-label={t.common.close}
              >
                <X className="size-5" />
              </button>
            </div>
            {/* Choosing a page closes the sheet; left open it would cover the page. */}
            <div
              className="overflow-y-auto overscroll-contain px-3 pb-24"
              onClick={(event) => {
                if ((event.target as HTMLElement).closest("a")) setOpen(false);
              }}
            >
              <SidebarNav sections={sections} pendingApprovals={pendingApprovals} />
            </div>
          </div>
        </div>
      ) : null}

      <nav className="fixed inset-x-0 bottom-0 z-50 border-t border-border bg-card/95 px-2 py-2 lg:hidden">
        <div className="flex items-stretch justify-around gap-1">
          {primary.map((item) => {
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
                  {item.href === "/approvals" ? badge(pendingApprovals) : null}
                </span>
                <span className="w-full truncate text-center">{t.nav[item.labelKey]}</span>
              </Link>
            );
          })}
          {hasMore ? (
            <button
              type="button"
              onClick={() => setOpen((now) => !now)}
              aria-expanded={open}
              className={cn(
                "flex min-w-0 flex-1 flex-col items-center gap-1 rounded-2xl px-1 py-2 text-[10px] font-semibold transition-all duration-300 ease-in-out",
                open || moreActive ? "bg-primary-soft text-primary" : "text-muted-foreground",
              )}
            >
              <span className="relative">
                <Menu className="size-6 shrink-0" />
                {pendingApprovals > 0 && !primary.some((i) => i.href === "/approvals")
                  ? badge(pendingApprovals)
                  : null}
              </span>
              <span className="w-full truncate text-center">{t.common.more}</span>
            </button>
          ) : null}
        </div>
      </nav>
    </>
  );
}
