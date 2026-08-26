/**
 * Free-text matching for a person.
 *
 * Deliberately not in filter-bar.tsx. That file is a `"use client"` module, and
 * everything it exports crosses the client boundary — a server component that
 * imports a helper from it gets a reference it cannot call, which fails at
 * request time with "attempted to call X from the server" while typecheck and
 * build both stay green. The filter UI is a client thing; deciding whether a
 * row matches is not, and both sides need it.
 */

/**
 * Matches name, employee code and CNIC.
 *
 * All three, because the office searches by whichever is in front of them: a
 * card, a payslip, or the number on the terminal display.
 */
export function matchesPerson(
  person: { full_name: string; employee_code: string; cnic?: string | null },
  query: string,
): boolean {
  const needle = query.trim().toLowerCase();
  if (!needle) return true;

  // Digits only, so "3520112345678" finds a CNIC stored with dashes.
  const digits = needle.replace(/\D/g, "");

  return (
    person.full_name.toLowerCase().includes(needle) ||
    person.employee_code.toLowerCase().includes(needle) ||
    (digits.length > 0 && (person.cnic ?? "").replace(/\D/g, "").includes(digits))
  );
}
