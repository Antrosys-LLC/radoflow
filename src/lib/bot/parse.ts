/**
 * What somebody typed into the WhatsApp group, as a command.
 *
 * Kept pure so it can be tested without WhatsApp, a database or a clock: the
 * date it needs is passed in. The words are English with a few Roman Urdu
 * aliases, because that is how the office actually writes to each other.
 */

export type ReportFormat = "pdf" | "xlsx" | "both";

export type Command =
  | { kind: "help" }
  | { kind: "attendance"; date: string; query: string }
  | { kind: "checkins"; date: string; query: string }
  | { kind: "canteen"; date: string; to: string; format: ReportFormat; file: boolean }
  | {
      kind: "report";
      from: string;
      to: string;
      till: boolean;
      query: string;
      format: ReportFormat;
    }
  | { kind: "payroll" }
  | { kind: "unknown"; text: string };

const COMMANDS: Record<string, Command["kind"]> = {
  help: "help",
  menu: "help",
  "?": "help",
  attendance: "attendance",
  att: "attendance",
  haazri: "attendance",
  hazri: "attendance",
  checkins: "checkins",
  checkin: "checkins",
  "check-ins": "checkins",
  "check-in": "checkins",
  in: "checkins",
  canteen: "canteen",
  meals: "canteen",
  meal: "canteen",
  khana: "canteen",
  report: "report",
  download: "report",
  file: "report",
  payroll: "payroll",
  salary: "payroll",
};

/** Words that carry no meaning of their own in "report for dyeing for today". */
const FILLER = new Set([
  "for",
  "of",
  "the",
  "in",
  "dept",
  "department",
  "ka",
  "ki",
  "ke",
  "to",
  "-",
]);

function addDays(date: string, days: number): string {
  const parsed = new Date(`${date}T00:00:00Z`);
  parsed.setUTCDate(parsed.getUTCDate() + days);
  return parsed.toISOString().slice(0, 10);
}

/** A real calendar date as `YYYY-MM-DD`, or null. */
function isoOrNull(year: number, month: number, day: number): string | null {
  const iso = `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
  const check = new Date(`${iso}T00:00:00Z`);
  return Number.isNaN(check.getTime()) || check.toISOString().slice(0, 10) !== iso ? null : iso;
}

/**
 * A date written as the office writes it: `today`, `yesterday`, `2026-11-13`,
 * `13-11-2026`, `13/11`. A day and month without a year means this year.
 */
export function parseDate(word: string, today: string): string | null {
  const w = word.toLowerCase();
  if (w === "today" || w === "aaj") return today;
  if (w === "yesterday" || w === "kal") return addDays(today, -1);

  const iso = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(w);
  if (iso) return isoOrNull(Number(iso[1]), Number(iso[2]), Number(iso[3]));

  const dmy = /^(\d{1,2})[-/.](\d{1,2})(?:[-/.](\d{4}))?$/.exec(w);
  if (dmy) return isoOrNull(Number(dmy[3] ?? today.slice(0, 4)), Number(dmy[2]), Number(dmy[1]));

  return null;
}

export function parseCommand(text: string, today: string): Command {
  const words = text
    .trim()
    .replace(/^[/!.]+/, "")
    .split(/\s+/)
    .filter(Boolean);

  const head = words.shift()?.toLowerCase() ?? "";
  const kind = COMMANDS[head];
  if (!kind) return { kind: "unknown", text: text.trim() };

  let format: ReportFormat = "both";
  let formatGiven = false;
  let till = false;
  let wantsFile = false;
  const dates: string[] = [];
  const rest: string[] = [];

  for (const word of words) {
    const w = word.toLowerCase();
    if (w === "pdf") {
      format = "pdf";
      formatGiven = true;
    } else if (w === "xlsx" || w === "excel" || w === "xls") {
      format = "xlsx";
      formatGiven = true;
    } else if (w === "till" || w === "now" || w === "tak" || w === "abhi") till = true;
    else if (w === "file" || w === "history" || w === "download") wantsFile = true;
    else if (parseDate(w, today)) dates.push(parseDate(w, today)!);
    else if (!FILLER.has(w)) rest.push(word);
  }

  const query = rest.join(" ").trim();
  const date = dates[0] ?? today;

  switch (kind) {
    case "help":
      return { kind: "help" };
    case "attendance":
      return { kind: "attendance", date, query };
    case "checkins":
      return { kind: "checkins", date, query };
    case "canteen": {
      const to = dates[1] ?? date;
      const file = wantsFile || formatGiven || dates.length > 1;
      return { kind: "canteen", date, to: to < date ? date : to, format, file };
    }
    case "payroll":
      return { kind: "payroll" };
    case "report": {
      // "Till now" runs from the first of the month, or from the date given.
      const from = till ? (dates[0] ?? `${today.slice(0, 7)}-01`) : date;
      const to = till ? today : (dates[1] ?? date);
      return { kind: "report", from, to: to < from ? from : to, till, query, format };
    }
    default:
      return { kind: "unknown", text: text.trim() };
  }
}

export const HELP_TEXT = [
  "*RadoFlow bot*",
  "",
  "*attendance* [date] [department] — who came in, absent, late",
  "*checkins* <department> [date] — each person's in and out times",
  "*canteen* [date] — meals served",
  "*canteen file* [from] [to] [pdf|excel] — the canteen history file",
  "*report* [department or name] [date] [pdf|excel] — the check-in/out file",
  "*report till now* [department or name] — everything from the 1st until this moment",
  "*payroll* — the latest pay run and its salary register (private chat or payroll group only)",
  "",
  "Dates: today, yesterday, 2026-11-13, 13-11-2026. Leave the date out for today.",
].join("\n");
