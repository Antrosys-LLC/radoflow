import { sheetDeductions } from "./ledger";
import type { PayslipLine } from "./types";

/**
 * The payroll register, in the office's own columns.
 *
 * The factory's salary sheet is laid out one way and has been for years:
 *
 *   SR · NAME · DESIGNATION · S RATE · WD DAYS · WD AMOUNT · SUN DAYS · SUN HRS ·
 *   SUN AMOUNT · OT HRS · OT AMOUNT · G SALARY · LATE DAYS · LATE DED. ·
 *   ADVANCE · ADVANCE · LOAN DED. · SUITE DED. · NET PAY
 *
 * and it is printed a department at a time, each closed with its own totals.
 * This builds exactly that from a pay run, so the register RadoFlow prints is
 * the sheet the accounts office already checks line by line.
 *
 * - S RATE is the monthly salary the daily rate was taken from.
 * - WD DAYS and WD AMOUNT are the working days and the salary they earned.
 * - SUN DAYS, SUN HRS and SUN AMOUNT are Sundays, off-days and holidays worked
 *   and what they paid — kept apart from weekday overtime so each can be
 *   checked on its own.
 * - OT HRS and OT AMOUNT are weekday overtime only.
 * - G SALARY is gross pay, allowances included.
 * - LATE DAYS and LATE DED. are the days arrived late and what was taken for them.
 * - Anything else withheld that the sheet has no column for — tax, a one-off
 *   deduction — goes in OTHER DED., which appears only when a register has any.
 *
 * The split is read off the payslip lines (`SUNDAY`, `WEEKEND`, `HOLIDAY`,
 * `LATE_*`), so it needs no extra stored column. A pay run saved before Sunday
 * had its own line shows its Sunday hours inside OT until it is recalculated.
 */

export interface RegisterItem {
  profileId: string;
  name: string;
  code: string;
  designation: string;
  department: string;
  monthlySalary: number;
  workingDays: number;
  basePay: number;
  overtimeHours: number;
  overtimePay: number;
  gross: number;
  /** Everything withheld, tax included. */
  withheld: number;
  net: number;
  lines: readonly PayslipLine[];
  /** Set when this person joined or left inside the period — see `movements.ts`. */
  joinedOn?: string | null | undefined;
  leftOn?: string | null | undefined;
}

export interface RegisterRow {
  profileId: string;
  name: string;
  code: string;
  designation: string;
  department: string;
  sRate: number;
  days: number;
  dayAmount: number;
  /** Sundays, off-days and holidays worked. */
  sundayDays: number;
  sundayHours: number;
  sundayAmount: number;
  /** Weekday overtime only. */
  hours: number;
  hourAmount: number;
  gross: number;
  lateDays: number;
  lateAmount: number;
  advance: number;
  advance2: number;
  loan: number;
  suit: number;
  other: number;
  net: number;
  joinedOn?: string | null | undefined;
  leftOn?: string | null | undefined;
}

/** What a contract firm's single row carries in the designation column. */
export const CONTRACT_FIRM = "Contract firm";

/** A contract firm's single row: billed once, nothing withheld. */
export function contractFirmItem(name: string, amount: number, profileId: string): RegisterItem {
  return {
    profileId,
    name,
    code: "",
    designation: CONTRACT_FIRM,
    department: name,
    monthlySalary: amount,
    workingDays: 0,
    basePay: amount,
    overtimeHours: 0,
    overtimePay: 0,
    gross: amount,
    withheld: 0,
    net: amount,
    lines: [],
  };
}

export type RegisterTotals = Omit<
  RegisterRow,
  "profileId" | "name" | "code" | "designation" | "department" | "joinedOn" | "leftOn"
>;

export interface RegisterGroup {
  department: string;
  rows: RegisterRow[];
  subtotal: RegisterTotals;
}

const round2 = (value: number) => Math.round(value * 100) / 100;

const SUNDAY_CODES = new Set(["SUNDAY", "WEEKEND", "HOLIDAY"]);

/** Sundays, off-days and holidays worked, and lateness, read off the payslip lines. */
function premiumsOf(lines: readonly PayslipLine[]) {
  const total = { sundayDays: 0, sundayHours: 0, sundayAmount: 0, lateDays: 0, lateAmount: 0 };
  for (const line of lines) {
    if (SUNDAY_CODES.has(line.code)) {
      total.sundayDays += line.days ?? 0;
      total.sundayHours += line.hours ?? 0;
      total.sundayAmount += line.amount;
    } else if (line.code.startsWith("LATE") && line.kind === "deduction") {
      total.lateDays += line.days ?? 0;
      total.lateAmount += line.amount;
    }
  }
  return total;
}

export function toRegisterRow(item: RegisterItem): RegisterRow {
  const sheet = sheetDeductions(item.lines);
  const named = sheet.advance + sheet.advance2 + sheet.loan + sheet.suit;
  const premium = premiumsOf(item.lines);
  const late = round2(premium.lateAmount);

  return {
    profileId: item.profileId,
    name: item.name,
    code: item.code,
    designation: item.designation,
    department: item.department,
    sRate: round2(item.monthlySalary),
    days: item.workingDays,
    dayAmount: round2(item.basePay),
    sundayDays: premium.sundayDays,
    sundayHours: round2(premium.sundayHours),
    sundayAmount: round2(premium.sundayAmount),
    // `overtimeHours`/`overtimePay` arrive as overtime + Sundays + off-days.
    hours: Math.max(0, round2(item.overtimeHours - premium.sundayHours)),
    hourAmount: Math.max(0, round2(item.overtimePay - premium.sundayAmount)),
    gross: round2(item.gross),
    lateDays: premium.lateDays,
    lateAmount: late,
    ...sheet,
    other: Math.max(0, round2(item.withheld - named - late)),
    net: round2(item.net),
    joinedOn: item.joinedOn ?? null,
    leftOn: item.leftOn ?? null,
  };
}

/**
 * The register's figure columns, in print order — the one list the screen, the
 * PDF and the workbook all read, so they cannot drift apart. `OTHER DED.` is
 * added by the caller only when a register has any.
 */
export interface RegisterColumn {
  key: keyof RegisterTotals;
  header: string;
  kind: "money" | "count";
}

export const REGISTER_COLUMNS: readonly RegisterColumn[] = [
  { key: "sRate", header: "S RATE", kind: "money" },
  { key: "days", header: "WD DAYS", kind: "count" },
  { key: "dayAmount", header: "WD AMOUNT", kind: "money" },
  { key: "sundayDays", header: "SUN DAYS", kind: "count" },
  { key: "sundayHours", header: "SUN HRS", kind: "count" },
  { key: "sundayAmount", header: "SUN AMOUNT", kind: "money" },
  { key: "hours", header: "OT HRS", kind: "count" },
  { key: "hourAmount", header: "OT AMOUNT", kind: "money" },
  { key: "gross", header: "G SALARY", kind: "money" },
  { key: "lateDays", header: "LATE DAYS", kind: "count" },
  { key: "lateAmount", header: "LATE DED.", kind: "money" },
  { key: "advance", header: "ADVANCE", kind: "money" },
  { key: "advance2", header: "ADVANCE", kind: "money" },
  { key: "loan", header: "LOAN DED.", kind: "money" },
  { key: "suit", header: "SUITE DED.", kind: "money" },
  { key: "other", header: "OTHER DED.", kind: "money" },
  { key: "net", header: "NET PAY", kind: "money" },
];

/** The columns a register shows: OTHER DED. only when somebody has one. */
export function registerColumns(withOther: boolean): RegisterColumn[] {
  return REGISTER_COLUMNS.filter((column) => withOther || column.key !== "other");
}

const NUMERIC: (keyof RegisterTotals)[] = [
  "sRate",
  "days",
  "dayAmount",
  "sundayDays",
  "sundayHours",
  "sundayAmount",
  "hours",
  "hourAmount",
  "gross",
  "lateDays",
  "lateAmount",
  "advance",
  "advance2",
  "loan",
  "suit",
  "other",
  "net",
];

export function totalsOf(rows: readonly RegisterRow[]): RegisterTotals {
  const totals = Object.fromEntries(NUMERIC.map((key) => [key, 0])) as RegisterTotals;
  for (const row of rows) {
    for (const key of NUMERIC) totals[key] = round2(totals[key] + row[key]);
  }
  return totals;
}

/** Departments in name order, people in name order inside each. */
export function groupRegister(rows: readonly RegisterRow[]): RegisterGroup[] {
  const byDepartment = new Map<string, RegisterRow[]>();
  for (const row of rows) {
    const list = byDepartment.get(row.department) ?? [];
    list.push(row);
    byDepartment.set(row.department, list);
  }

  return [...byDepartment]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([department, list]) => {
      const sorted = [...list].sort((a, b) => a.name.localeCompare(b.name));
      return { department, rows: sorted, subtotal: totalsOf(sorted) };
    });
}

/** Whether a register needs the OTHER DED. column at all. */
export function hasOtherDeductions(rows: readonly RegisterRow[]): boolean {
  return rows.some((row) => row.other > 0);
}
