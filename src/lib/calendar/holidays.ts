/**
 * Reading Claude's holiday suggestions back into something the screen trusts.
 *
 * The reply is asked to be a bare JSON array, but a model reply is text: it
 * may arrive wrapped in a sentence or a code fence, carry a date outside the
 * range asked for, or repeat a day. None of that should reach the calendar, so
 * everything is validated here and anything doubtful is dropped rather than
 * guessed at.
 */

export interface HolidaySuggestion {
  date: string;
  name: string;
  status: "announced" | "expected";
  note: string;
}

function isRealDate(value: unknown): value is string {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

export function parseHolidaySuggestions(
  reply: string,
  range: { from: string; to: string },
): HolidaySuggestion[] {
  const start = reply.indexOf("[");
  const end = reply.lastIndexOf("]");
  if (start < 0 || end <= start) return [];

  let parsed: unknown;
  try {
    parsed = JSON.parse(reply.slice(start, end + 1));
  } catch {
    return [];
  }
  if (!Array.isArray(parsed)) return [];

  const seen = new Set<string>();
  const out: HolidaySuggestion[] = [];

  for (const entry of parsed) {
    if (!entry || typeof entry !== "object") continue;
    const { date, name, status, note } = entry as Record<string, unknown>;
    if (!isRealDate(date) || date < range.from || date > range.to) continue;
    if (typeof name !== "string" || !name.trim()) continue;
    if (seen.has(date)) continue;
    seen.add(date);

    out.push({
      date,
      name: name.trim().slice(0, 120),
      status: status === "announced" ? "announced" : "expected",
      note: typeof note === "string" ? note.trim().slice(0, 240) : "",
    });
  }

  return out.sort((a, b) => a.date.localeCompare(b.date));
}
