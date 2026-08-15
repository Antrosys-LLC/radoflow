"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { NavIcon } from "@/components/nav-icons";
import { cn } from "@/lib/utils";
import type { NavSection } from "@/lib/navigation";

/** Marks the deepest matching entry so /devices/abc still highlights Devices. */
function isActive(pathname: string, href: string): boolean {
  if (href === "/") return pathname === "/";
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function SidebarNav({ sections }: { sections: NavSection[] }) {
  const pathname = usePathname();

  return (
    <nav className="flex flex-col gap-5">
      {sections.map((section) => (
        <div key={section.title}>
          <p className="px-4 pb-2 text-[11px] font-bold uppercase tracking-widest text-muted-foreground">
            {section.title}
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
                  {item.label}
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
export function MobileNav({ sections }: { sections: NavSection[] }) {
  const pathname = usePathname();
  const items = sections.flatMap((s) => s.items).slice(0, 5);

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-30 border-t border-border bg-card/95 px-2 py-2 backdrop-blur lg:hidden">
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
              <NavIcon name={item.icon} className="size-6 shrink-0" />
              <span className="w-full truncate text-center">{item.label}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
