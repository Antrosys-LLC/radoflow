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
      className="fixed inset-x-0 bottom-0 z-40 w-full border-t border-charcoal/20 bg-charcoal text-charcoal-foreground"
      // The mobile nav sits at the bottom too; the strip is thin enough to sit
      // beneath it without stealing a tap target.
      aria-label="Antrosys contact"
    >
      <div className="mx-auto flex max-w-[1500px] flex-wrap items-center justify-center gap-x-4 gap-y-0.5 px-3 py-1 text-center text-[11px] leading-tight tracking-tight">
        <a
          href="https://www.antrosys.com"
          target="_blank"
          rel="noreferrer noopener"
          className="font-semibold underline-offset-2 hover:underline"
        >
          www.antrosys.com
        </a>
        <span className="opacity-70">Denver CO / Pakistan</span>
        <span className="opacity-70">
          WhatsApp{" "}
          <a
            href="https://wa.me/923707353730"
            target="_blank"
            rel="noreferrer noopener"
            className="underline-offset-2 hover:underline"
          >
            0370 7353730
          </a>
        </span>
        <a
          href="mailto:connect@antrosys.com"
          className="opacity-70 underline-offset-2 hover:underline"
        >
          connect@antrosys.com
        </a>
      </div>
    </footer>
  );
}
