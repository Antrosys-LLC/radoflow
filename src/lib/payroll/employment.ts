/**
 * How many days of a calendar month somebody was on the books.
 *
 * A fixed salary is the month's salary, so it is cut for a month the person
 * did not stay: a joiner is paid from the day they joined, and a resigner up to
 * the day before they left. That last edge is the rule the workers list uses
 * for a number two people have held — everything before the date belongs to the
 * person who resigned, everything from it to the person who joined — so the two
 * together always add up to exactly one month, never a day twice or not at all.
 *
 * Dates are `YYYY-MM-DD`. `joinedOn` is the date the office entered for the new
 * joiner, not the profile's creation date, which for most of the factory is
 * only the day the records were imported.
 */

const DAY_MS = 86_400_000;

const dayNumber = (date: string): number => Date.parse(`${date}T00:00:00Z`) / DAY_MS;

export function employedDaysInMonth(
  monthStart: string,
  daysInMonth: number,
  joinedOn: string | null | undefined,
  leftOn: string | null | undefined,
): number {
  const first = dayNumber(monthStart);
  const last = first + daysInMonth - 1;

  const from = joinedOn ? Math.max(first, dayNumber(joinedOn)) : first;
  // The leaving date is the first day that belongs to somebody else.
  const to = leftOn ? Math.min(last, dayNumber(leftOn) - 1) : last;

  return Math.max(0, Math.min(daysInMonth, to - from + 1));
}
