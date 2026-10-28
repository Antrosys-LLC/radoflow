/**
 * The salary a new joiner usually gets, read from what people with the same
 * designation are paid today.
 *
 * The workers list pays by designation for most of the floor — 137 of 151
 * helpers are on 25,000 — so the add-user form can start from that figure. It
 * only does so where there is a real rate to offer: at least two people, and a
 * single amount shared by most of them. An operator can be anywhere from 31,200
 * to 66,000, and suggesting the commonest figure there would look like a rate
 * the office had set. The form leaves such designations blank.
 *
 * Pure: people in, one suggestion out.
 */

export interface SalaryPerson {
  designation: string | null;
  status: string;
  payClass: string;
  workerType: string;
  monthlySalary: number;
}

export interface SalarySuggestion {
  salary: number;
  /** How many people in the designation are paid exactly this. */
  people: number;
  /** How many people the suggestion was drawn from. */
  of: number;
}

/** Share of a designation that must be on one amount before it counts as its rate. */
export const RATE_SHARE = 0.6;

/** Case, spacing and a trailing full stop — "Asist." and "ASIST" are one designation. */
export function designationKey(designation: string | null | undefined): string {
  return (designation ?? "")
    .toUpperCase()
    .replace(/\s+/g, " ")
    .replace(/[.\s]+$/, "")
    .trim();
}

export function suggestSalary(
  designation: string | null | undefined,
  people: readonly SalaryPerson[],
): SalarySuggestion | null {
  const key = designationKey(designation);
  if (!key) return null;

  const counts = new Map<number, number>();
  let of = 0;
  for (const person of people) {
    if (designationKey(person.designation) !== key) continue;
    // Only people paid a monthly salary on the books; contract firms and
    // hourly staff say nothing about what a new employee is offered.
    if (person.status !== "active" || person.payClass !== "monthly") continue;
    if (person.workerType !== "employee" || !(person.monthlySalary > 0)) continue;
    of += 1;
    counts.set(person.monthlySalary, (counts.get(person.monthlySalary) ?? 0) + 1);
  }
  if (of < 2) return null;

  // Highest count wins; the lower salary breaks a tie so the answer is stable.
  const [salary, count] = [...counts].sort((a, b) => b[1] - a[1] || a[0] - b[0])[0]!;
  return count / of >= RATE_SHARE ? { salary, people: count, of } : null;
}
