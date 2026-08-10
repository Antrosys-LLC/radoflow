import { Link, useRouterState } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import {
  Building2,
  CalendarClock,
  Fingerprint,
  LayoutDashboard,
  ShieldCheck,
  Wallet,
  ChevronDown,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { FACTORIES, ROLES } from "@/data/demo";
import { useApp } from "@/lib/app-context";

const NAV = [
  { to: "/", label: "Dashboard", icon: LayoutDashboard },
  { to: "/attendance", label: "Attendance", icon: CalendarClock },
  { to: "/payroll", label: "Payroll", icon: Wallet },
  { to: "/admin", label: "Control Center", icon: ShieldCheck },
] as const;

function LiveClock() {
  const [now, setNow] = useState<Date | null>(null);
  useEffect(() => {
    setNow(new Date());
    const t = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(t);
  }, []);
  return (
    <div className="hidden rounded-2xl bg-secondary px-4 py-2 text-right md:block">
      <p className="text-sm font-semibold tabular-nums text-foreground">
        {now ? now.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" }) : "--:--:--"}
      </p>
      <p className="text-[11px] text-muted-foreground">
        {now ? now.toLocaleDateString([], { weekday: "short", day: "numeric", month: "short" }) : "\u00a0"}
      </p>
    </div>
  );
}

export function AppShell({ children }: { children: React.ReactNode }) {
  const { role, setRole, factory, setFactory, canAdmin } = useApp();
  const pathname = useRouterState({ select: (s) => s.location.pathname });

  const nav = NAV.filter((n) => n.to !== "/admin" || canAdmin);

  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-30 px-3 pt-3 sm:px-5 sm:pt-5">
        <div className="mx-auto flex max-w-[1500px] flex-wrap items-center gap-3 rounded-3xl border border-border bg-card/90 p-3 shadow-[0_1px_2px_rgb(0_0_0/0.04),0_8px_24px_rgb(0_0_0/0.05)] backdrop-blur">
          <div className="flex items-center gap-3 pl-1 pr-2">
            <span className="flex size-11 items-center justify-center rounded-2xl bg-charcoal text-charcoal-foreground">
              <Building2 className="size-5" />
            </span>
            <div className="leading-tight">
              <p className="text-sm font-bold tracking-tight text-foreground">Rado Dyeing &amp; Textile</p>
              <p className="text-[11px] text-muted-foreground">Engineered by Antrosys</p>
            </div>
          </div>

          <div className="flex items-center gap-1 rounded-2xl bg-secondary p-1">
            {FACTORIES.map((f) => (
              <button
                key={f.id}
                onClick={() => setFactory(f.id)}
                className={cn(
                  "rounded-xl px-3 py-2 text-xs font-semibold transition-all duration-300 ease-in-out",
                  factory === f.id
                    ? "bg-card text-primary shadow-[0_4px_14px_rgb(0_0_0/0.08)]"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                {f.short}
              </button>
            ))}
          </div>

          <div className="ml-auto flex items-center gap-3">
            <span className="hidden items-center gap-2 rounded-2xl bg-success-soft px-3 py-2 text-xs font-semibold text-success sm:inline-flex">
              <Fingerprint className="size-4" />
              ZKTeco K50
              <span className="relative flex size-2">
                <span className="absolute inline-flex size-full animate-ping rounded-full bg-success opacity-75" />
                <span className="relative inline-flex size-2 rounded-full bg-success" />
              </span>
              Online
            </span>
            <LiveClock />
            <div className="relative">
              <select
                value={role}
                onChange={(e) => setRole(e.target.value as (typeof ROLES)[number])}
                aria-label="Switch role"
                className="appearance-none rounded-2xl bg-charcoal py-3 pl-4 pr-10 text-xs font-semibold text-charcoal-foreground transition-all duration-300 ease-in-out hover:opacity-90 focus:outline-none focus:ring-2 focus:ring-primary"
              >
                {ROLES.map((r) => (
                  <option key={r} value={r}>
                    {r}
                  </option>
                ))}
              </select>
              <ChevronDown className="pointer-events-none absolute right-3 top-1/2 size-4 -translate-y-1/2 text-charcoal-foreground" />
            </div>
          </div>
        </div>
      </header>

      <div className="mx-auto flex max-w-[1500px] gap-5 px-3 py-5 sm:px-5">
        <aside className="sticky top-28 hidden h-fit w-60 shrink-0 rounded-3xl border border-border bg-card p-3 shadow-[0_1px_2px_rgb(0_0_0/0.04),0_8px_24px_rgb(0_0_0/0.05)] lg:block">
          <nav className="flex flex-col gap-1">
            {nav.map((item) => {
              const active = pathname === item.to;
              return (
                <Link
                  key={item.to}
                  to={item.to}
                  className={cn(
                    "flex items-center gap-3 rounded-2xl px-4 py-3 text-sm font-semibold transition-all duration-300 ease-in-out",
                    active
                      ? "bg-primary text-primary-foreground shadow-[0_12px_30px_rgb(239_86_25/0.28)]"
                      : "text-muted-foreground hover:bg-secondary hover:text-foreground",
                  )}
                >
                  <item.icon className="size-5" />
                  {item.label}
                </Link>
              );
            })}
          </nav>
        </aside>

        <main className="min-w-0 flex-1">{children}</main>
      </div>

      <nav className="sticky bottom-0 z-30 border-t border-border bg-card/95 px-3 py-2 backdrop-blur lg:hidden">
        <div className="flex items-center justify-around">
          {nav.map((item) => {
            const active = pathname === item.to;
            return (
              <Link
                key={item.to}
                to={item.to}
                className={cn(
                  "flex flex-col items-center gap-1 rounded-2xl px-4 py-2 text-[11px] font-semibold transition-all duration-300 ease-in-out",
                  active ? "bg-primary-soft text-primary" : "text-muted-foreground",
                )}
              >
                <item.icon className="size-5" />
                {item.label}
              </Link>
            );
          })}
        </div>
      </nav>
    </div>
  );
}
