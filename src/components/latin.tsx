import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

/**
 * Content that stays Latin whatever the interface language — a person's name,
 * an employee code, a CNIC, money, a time, a date.
 *
 * Two problems, and the second corrupts what the screen says.
 *
 * The font: Nastaliq is a Perso-Arabic face whose Latin coverage is not its
 * purpose, so `RD-1042` set in it would look nothing like the same code on the
 * payslip or the terminal display it is being checked against.
 *
 * The direction: inside a right-to-left paragraph, digits are weak-directional
 * and hyphens are neutral under the Unicode bidirectional algorithm, so
 * `RD-1042` can be reordered **on display** to `1042-RD`. Nothing in the
 * database changes; the screen simply shows a different code from the one
 * stored. `<bdi>` isolates the run so the surrounding direction cannot reach
 * it, and `dir="ltr"` states the direction outright rather than leaving it to
 * be inferred from a first strong character a number does not have.
 */
export function Latin({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <bdi dir="ltr" className={cn("font-latin", className)}>
      {children}
    </bdi>
  );
}
