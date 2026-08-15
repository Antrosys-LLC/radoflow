"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { ChevronDown, LogOut, UserCircle } from "lucide-react";

import { signOut } from "@/app/login/actions";
import { cn } from "@/lib/utils";
import type { Session } from "@/lib/auth/session";

export function ProfileMenu({ session }: { session: Session }) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;

    function onPointerDown(event: MouseEvent) {
      if (!containerRef.current?.contains(event.target as Node)) setOpen(false);
    }
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }

    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  const initials = session.profile.fullName
    .split(" ")
    .map((part) => part[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();

  const roleLabel = session.roles.map((r) => r.name).join(" · ") || "No role assigned";

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-haspopup="menu"
        className="flex items-center gap-2 rounded-2xl bg-charcoal py-2 pl-2 pr-3 text-charcoal-foreground transition-all duration-300 ease-in-out hover:opacity-90 focus:outline-none focus:ring-2 focus:ring-primary"
      >
        <span className="flex size-8 items-center justify-center rounded-xl bg-primary text-xs font-bold text-primary-foreground">
          {initials}
        </span>
        <span className="hidden text-left leading-tight sm:block">
          <span className="block text-xs font-bold">{session.profile.fullName}</span>
          <span className="block text-[10px] opacity-70">{roleLabel}</span>
        </span>
        <ChevronDown className={cn("size-4 transition-transform", open && "rotate-180")} />
      </button>

      {open ? (
        <div
          role="menu"
          className="absolute right-0 z-50 mt-2 w-64 overflow-hidden rounded-2xl border border-border bg-card shadow-[0_18px_40px_rgb(0_0_0/0.18)]"
        >
          <div className="border-b border-border px-4 py-3">
            <p className="text-sm font-bold text-foreground">{session.profile.fullName}</p>
            <p className="truncate text-xs text-muted-foreground">{session.profile.email}</p>
            <p className="mt-1 inline-flex rounded-full bg-primary-soft px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-primary">
              {roleLabel}
            </p>
          </div>

          <Link
            href="/me/profile"
            onClick={() => setOpen(false)}
            role="menuitem"
            className="flex items-center gap-3 px-4 py-3 text-sm font-semibold text-foreground transition-colors hover:bg-secondary"
          >
            <UserCircle className="size-4" />
            My profile
          </Link>

          <form action={signOut}>
            <button
              type="submit"
              role="menuitem"
              className="flex w-full items-center gap-3 px-4 py-3 text-sm font-semibold text-danger transition-colors hover:bg-danger-soft"
            >
              <LogOut className="size-4" />
              Sign out
            </button>
          </form>
        </div>
      ) : null}
    </div>
  );
}
