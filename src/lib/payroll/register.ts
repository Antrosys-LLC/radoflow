import { sheetDeductions } from "./ledger";
import type { PayslipLine } from "./types";

/**
 * The payroll register, in the office's own columns.
 *
 * The factory's salary sheet is laid out one way and has been for years:
 *
 *   SR · NAME · DESIGNATION · S RATE · DAYS · AMOUNT · HOURS · AMOUNT ·
 *   G SALARY · ADVANCE · ADVANCE · LOAN DED. · SUITE DED. · NET PAY
 *
 * and it is printed a department at a time, each closed with its own totals.
 * This builds exactly that from a pay run, so the register RadoFlow prints is
 * the sheet the accounts office already checks line by line.
 *
 * - S RATE is the monthly salary the daily rate was taken from.
 * - DAYS and the first AMOUNT are the working days and the salary they earned.
 * - HOURS and the second AMOUNT are the overtime hours and their pay (Sunday
 *   and holiday hours included — on the sheet they are all "hours").
 * - G SALARY is gross pay, allowances included.
 * - Anything withheld that the sheet has no column for — lateness, tax, a
 *   one-off deduction — goes in OTHER DED., which appears only when a register
 *   has any.
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
  hours: number;
  hourAmount: number;
  gross: number;
  advance: number;
  advance2: number;
  loan: number;
  suit: number;
  other: number;
  net: number;
}

export type RegisterTotals = Omit<
  RegisterRow,
  "profileId" | "name" | "code" | "designation" | "department"
>;

export interface RegisterGroup {
  department: string;
  rows: RegisterRow[];
  subtotal: RegisterTotals;
}

const round2 = (value: number) => Math.round(value * 100) / 100;

export function toRegisterRow(item: RegisterItem): RegisterRow {
  const sheet = sheetDeductions(item.lines);
  const named = sheet.advance + sheet.advance2 + sheet.loan + sheet.suit;

  return {
    profileId: item.profileId,
    name: item.name,
    code: item.code,
    designation: item.designation,
    department: item.department,
    sRate: round2(item.monthlySalary),
    days: item.workingDays,
    dayAmount: round2(item.basePay),
    hours: round2(item.overtimeHours),
    hourAmount: round2(item.overtimePay),
    gross: round2(item.gross),
    ...sheet,
    other: Math.max(0, round2(item.withheld - named)),
    net: round2(item.net),
  };
}

const NUMERIC: (keyof RegisterTotals)[] = [
  "sRate",
  "days",
  "dayAmount",
  "hours",
  "hourAmount",
  "gross",
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
