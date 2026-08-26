import { Mail, MapPin, MessageCircle } from "lucide-react";

import type { Session } from "@/lib/auth/session";

/**
 * The Antrosys attribution strip along the bottom of the staff portals.
 *
 * Shown to everyone who administers the system — admins, the CEO, operations,
 * managers, contractors — and withheld from the floor, whose screens are for
 * clocking in rather than for the vendor's contact details.
 */

/**
 * True for anyone above the shop floor.
 *
 * Framed as "not only an employee" rather than as a list of the roles that do
 * see it, so a role added later shows the strip by default. Erring that way
 * puts a support number in front of one person too many, while the opposite
 * error hides it from the manager who needs it.
 */
export function showsAntrosysRibbon(session: Session): boolean {
  if (session.roles.length === 0) return false;
  return !session.roles.every((role) => role.key === "employee");
}

export function AntrosysRibbon() {
  return (
    <footer
      /*
       * Pinned to the bottom on a laptop, but in normal flow on a phone.
       * Fixed on both, it lands on top of the mobile navigation and covers its
       * tap targets — the strip is z-40 and the nav z-30, so the buttons are
       * still there and simply cannot be pressed. The bottom margin is the
       * height of that nav, so the strip can be scrolled to above it.
       */
      className="w-full border-t border-charcoal/20 bg-charcoal text-charcoal-foreground mb-[76px] lg:mb-0 lg:fixed lg:inset-x-0 lg:bottom-0 lg:z-40"
      aria-label="Antrosys contact"
    >
      {/*
        Two rows on a phone, one on a laptop. The strip sits above the mobile
        navigation, so it has to stay short enough not to eat a tap target —
        hence the labels collapsing to icons rather than the text wrapping to a
        third line.
      */}
      <div className="mx-auto flex max-w-[1500px] flex-wrap items-center justify-center gap-x-3 gap-y-1 px-3 py-1.5 text-center text-[11px] leading-tight sm:gap-x-5 sm:py-1">
        <a
          href="https://www.antrosys.com"
          target="_blank"
          rel="noreferrer noopener"
          className="flex shrink-0 items-center gap-1.5 font-semibold underline-offset-2 hover:underline"
        >
          {/* Sized in ems so it tracks the strip's own text size. A plain img,
              not next/image: this is a two-kilobyte SVG in a fixed strip, so
              there is no layout shift to prevent and nothing to resize. */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/antrosys-logo.svg" alt="" aria-hidden className="h-[1.35em] w-auto shrink-0" />
          Antrosys
        </a>

        <span className="hidden text-charcoal-foreground/25 sm:inline" aria-hidden>
          |
        </span>

        <a
          href="https://www.antrosys.com"
          target="_blank"
          rel="noreferrer noopener"
          className="hidden opacity-75 underline-offset-2 hover:underline sm:inline"
        >
          www.antrosys.com
        </a>

        <span className="flex shrink-0 items-center gap-1 opacity-75">
          <MapPin className="size-3 shrink-0 sm:hidden" aria-hidden />
          <span className="sr-only sm:hidden">Offices</span>
          Denver CO / Pakistan
        </span>

        <span className="flex shrink-0 items-center gap-1 opacity-75">
          <MessageCircle className="size-3 shrink-0" aria-hidden />
          <span className="hidden sm:inline">WhatsApp</span>
          <a
            href="https://wa.me/923707353730"
            className="underline-offset-2 hover:underline"
            aria-label="WhatsApp 0370 7353730"
          >
            0370 7353730
          </a>
        </span>

        <span className="flex min-w-0 shrink items-center gap-1 opacity-75">
          <Mail className="size-3 shrink-0" aria-hidden />
          <span className="hidden sm:inline">Email</span>
          <a
            href="mailto:connect@antrosys.com"
            className="truncate underline-offset-2 hover:underline"
          >
            connect@antrosys.com
          </a>
        </span>
      </div>
    </footer>
  );
}
