/**
 * Reads the factory's "WORKERS LIST" workbook.
 *
 * An .xlsx is a zip of XML parts and node ships the inflate half already, so
 * this needs no dependency. It is deliberately narrow: it understands this one
 * sheet's shape rather than trying to be a spreadsheet library.
 *
 * The sheet is a printout, not a database export. Department headings sit on
 * their own row — sometimes in column A, sometimes in column C — the header
 * row repeats after every page break, and so do some headings. All three are
 * handled here so the caller sees a flat list of people.
 */

import { readFileSync } from "node:fs";
import { inflateRawSync } from "node:zlib";

/** Inflates every entry of a zip into a name → Buffer map. */
function unzip(b) {
  let eocd = -1;
  for (let i = b.length - 22; i >= 0; i--) {
    if (b.readUInt32LE(i) === 0x06054b50) {
      eocd = i;
      break;
    }
  }
  if (eocd < 0) throw new Error("not a zip file");

  const count = b.readUInt16LE(eocd + 10);
  let off = b.readUInt32LE(eocd + 16);
  const files = new Map();

  for (let n = 0; n < count; n++) {
    if (b.readUInt32LE(off) !== 0x02014b50) break;
    const method = b.readUInt16LE(off + 10);
    const compSize = b.readUInt32LE(off + 20);
    const nameLen = b.readUInt16LE(off + 28);
    const extraLen = b.readUInt16LE(off + 30);
    const commentLen = b.readUInt16LE(off + 32);
    const localOff = b.readUInt32LE(off + 42);
    const name = b.toString("utf8", off + 46, off + 46 + nameLen);

    // The local header repeats these lengths and they can differ from the
    // central directory's, so they must be re-read rather than reused.
    const lNameLen = b.readUInt16LE(localOff + 26);
    const lExtraLen = b.readUInt16LE(localOff + 28);
    const start = localOff + 30 + lNameLen + lExtraLen;
    const raw = b.subarray(start, start + compSize);

    files.set(name, method === 0 ? raw : inflateRawSync(raw));
    off += 46 + nameLen + extraLen + commentLen;
  }
  return files;
}

const decode = (s) =>
  s
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, d) => String.fromCharCode(Number(d)))
    // Ampersand last, or "&amp;lt;" would decode twice.
    .replace(/&amp;/g, "&");

function sheetRows(files, index, shared) {
  const part = files.get(`xl/worksheets/sheet${index}.xml`);
  if (!part) return [];

  const xml = part.toString("utf8");
  const rows = [];

  for (const rowXml of xml.match(/<row[^>]*>[\s\S]*?<\/row>/g) ?? []) {
    const cells = {};
    for (const c of rowXml.match(/<c[^>]*(?:\/>|>[\s\S]*?<\/c>)/g) ?? []) {
      const ref = c.match(/r="([A-Z]+\d+)"/)?.[1];
      if (!ref) continue;

      const type = c.match(/t="([^"]+)"/)?.[1];
      let value = "";

      if (type === "inlineStr") {
        value = [...c.matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g)].map((m) => decode(m[1])).join("");
      } else {
        const v = c.match(/<v>([\s\S]*?)<\/v>/)?.[1];
        if (v !== undefined) value = type === "s" ? (shared[Number(v)] ?? "") : decode(v);
      }

      if (value !== "") cells[ref.replace(/\d+/g, "")] = value.trim();
    }
    if (Object.keys(cells).length > 0) rows.push(cells);
  }
  return rows;
}

/**
 * A department heading: a row with one populated cell that starts with the
 * department's number. Checked in A and C because the sheet uses both.
 */
function headingOf(cells) {
  const keys = Object.keys(cells);
  if (keys.length !== 1) return null;

  const value = cells[keys[0]];
  return /^\d{1,2}\s*-/.test(value) ? value : null;
}

/**
 * Turns a heading like "02- ACCOUNT" into a stable code and a readable name.
 *
 * The leading number is the factory's own ordering and is kept as the sort
 * key, but stripped from the name — "02- ACCOUNT" is a line on a printout,
 * "Accounts" is what a person is in.
 */
export function parseHeading(heading) {
  const match = heading.match(/^(\d{1,2})\s*-\s*(.*)$/);
  const order = match ? Number(match[1]) : 999;
  const rawName = (match ? match[2] : heading).trim();

  /*
   * Title case, except for the words that are acronyms on the floor. "Ppc" and
   * "Gm" are not names anyone would recognise on their own payslip.
   */
  const ACRONYMS = new Set(["ppc", "gm", "cp", "01", "02"]);

  const name = rawName
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean)
    .map((word) =>
      ACRONYMS.has(word) ? word.toUpperCase() : word.charAt(0).toUpperCase() + word.slice(1),
    )
    .join(" ");

  return { order, name, raw: heading };
}

/**
 * Reads column O — the free-text duty rule — into the fields payroll needs.
 *
 * The column is handwritten English with inconsistent spelling and casing, so
 * every test here is a loose match on a keyword rather than an equality check.
 * Anything unrecognised falls back to the commonest arrangement on the floor
 * (eight hours with overtime) and is reported, rather than silently guessed at.
 */
export function parseDutyRule(rule) {
  const text = (rule ?? "").toLowerCase();

  const contractor = /contractor/.test(text) || /^fixed amount$/.test(text.trim());
  const noAttendance = /no attend/.test(text) || /fixed salary/.test(text);
  const flexible = /no\s*time\s*limit/.test(text) || /no in out/.test(text);
  const twelve = /12\s*hour/.test(text);

  /*
   * Overtime is refused only where the sheet says so. "8 Hours Duty" on its
   * own is one of those: every other eight-hour line spells out "+ Over time",
   * so the bare form is a deliberate distinction rather than an abbreviation.
   */
  const saysNoOvertime = /no over\s*time/.test(text) || /no extra days/.test(text);
  const saysOvertime = /over\s*time/.test(text) && !saysNoOvertime;
  const bareDuty = /^0?8\s*hours?\s*duty\.?$/.test(text.trim());

  const sundayAdjust = /sunday adjust/.test(text);
  const sundayOvertime = /holiday over\s*time|sunday ect/.test(text);

  return {
    workerType: contractor ? "contractor" : "employee",
    dutyHours: twelve ? 12 : 8,
    overtimeEligible: contractor ? false : saysOvertime || (!saysNoOvertime && !bareDuty),
    flexibleHours: flexible,
    requiresAttendance: !(contractor || noAttendance),
    sundayPolicy: sundayAdjust ? "adjust_in_leave" : sundayOvertime ? "optional" : "off",
    recognised: text.trim().length > 0,
  };
}

/** Every person in the workbook, in sheet order, with their department. */
export function readWorkers(path) {
  const files = unzip(readFileSync(path));

  const shared = [];
  const ss = files.get("xl/sharedStrings.xml");
  if (ss) {
    for (const si of ss.toString("utf8").match(/<si>[\s\S]*?<\/si>/g) ?? []) {
      shared.push([...si.matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g)].map((m) => decode(m[1])).join(""));
    }
  }

  // Sheet 2 is the per-person list; sheet 1 is a department summary.
  const rows = sheetRows(files, 2, shared);

  const people = [];
  const departments = new Map();
  let current = null;

  for (const cells of rows) {
    const heading = headingOf(cells);
    if (heading) {
      const parsed = parseHeading(heading);
      // A heading repeats after a page break; the first occurrence wins.
      if (!departments.has(parsed.name)) departments.set(parsed.name, parsed);
      current = parsed;
      continue;
    }

    // The header row repeats after every page break too.
    if (cells.A === "Sr. No." || cells.B === "NAME") continue;

    const serial = String(cells.A ?? "").trim();
    if (!/^\d+$/.test(serial)) continue;

    const name = String(cells.B ?? "").trim();
    if (!name || name === "0") continue;

    people.push({
      serial: Number(serial),
      department: current?.name ?? "Unassigned",
      departmentOrder: current?.order ?? 999,
      name,
      designation: String(cells.C ?? "").trim(),
      salary: Number(cells.D ?? 0) || 0,
      rule: String(cells.O ?? "").trim(),
      ...parseDutyRule(cells.O),
    });
  }

  return { people, departments: [...departments.values()].sort((a, b) => a.order - b.order) };
}
