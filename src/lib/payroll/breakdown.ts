import { CONTRACT_FIRM, totalsOf, type RegisterRow } from "./register";

/**
 * The whole payroll as one reading, top to bottom, so anybody can follow a
 * rupee from the full salary bill to the cash that has to leave the box.
 *
 *   1. TOTAL PAYROLL      everyone's full salary plus each firm, as if nobody
 *                         had been absent
 *   2. FROM ATTENDANCE    what was actually earned once the days are counted
 *   3. DEDUCTIONS         what comes off, by kind
 *   4. TO PAY             the calculated total less the deductions
 *
 * Built from register rows, the one shape the screen, the PDF and the workbook
 * all already share, so the three can never print different numbers.
 */

export type BreakdownTone = "heading" | "line" | "subtotal" | "total" | "note";

export interface BreakdownLine {
  tone: BreakdownTone;
  label: string;
  /** Absent on a heading. Always positive: the sign is in the label. */
  amount?: number;
}

const round2 = (value: number) => Math.round(value * 100) / 100;

export function payrollBreakdown(rows: readonly RegisterRow[]): BreakdownLine[] {
  const firms = rows.filter((row) => row.designation === CONTRACT_FIRM);
  const people = totalsOf(rows.filter((row) => row.designation !== CONTRACT_FIRM));
  const firmsTotal = round2(firms.reduce((sum, firm) => sum + firm.gross, 0));

  const fullPayroll = round2(people.sRate + firmsTotal);
  const calculated = round2(people.gross + firmsTotal);
  const net = round2(totalsOf(rows).net);

  // Derived from gross and net rather than summed, so the section always
  // reconciles with the figure the run pays — whatever the other column holds.
  const deductions = round2(calculated - net);
  const named = round2(
    people.advance + people.advance2 + people.loan + people.suit + people.lateAmount,
  );
  const other = round2(deductions - named);

  const lines: BreakdownLine[] = [];
  const add = (tone: BreakdownTone, label: string, amount?: number) =>
    lines.push(amount === undefined ? { tone, label } : { tone, label, amount });

  add("heading", "1 · TOTAL PAYROLL — everyone's full salary, without attendance");
  add("line", "Monthly salaries of all people", people.sRate);
  for (const firm of firms) add("line", `+ ${firm.name}`, firm.gross);
  add("subtotal", "= Total payroll", fullPayroll);

  add("heading", "2 · CALCULATED FROM ATTENDANCE");
  add("line", "Monthly salaries of all people", people.sRate);
  const adjustment = round2(people.dayAmount - people.sRate);
  if (adjustment < 0) {
    add("line", "− Salary not earned (absence, Sundays, part months)", -adjustment);
  } else if (adjustment > 0) {
    add("line", "+ Paid by the hour or above the stated salary", adjustment);
  }
  if (adjustment < 0) {
    add(
      "note",
      "Not paid: Sundays, days absent or on leave, days outside the period, and the part of a month before a joiner started or after a leaver left.",
    );
  }
  add("subtotal", "= Base pay earned by attendance", people.dayAmount);
  if (people.sundayAmount > 0) {
    add("line", "+ Sundays, off-days and holidays worked", people.sundayAmount);
  }
  if (people.hourAmount > 0) add("line", "+ Weekday overtime", people.hourAmount);
  const allowances = round2(
    people.gross - people.dayAmount - people.sundayAmount - people.hourAmount,
  );
  if (allowances > 0) add("line", "+ Allowances and other earnings", allowances);
  add("subtotal", "= Payroll of all people, by attendance", people.gross);
  if (firms.length > 0) add("line", "+ Contract firms (billed once)", firmsTotal);
  add("subtotal", "= Total calculated", calculated);

  add("heading", "3 · DEDUCTIONS");
  if (people.advance > 0) add("line", "− Advance", people.advance);
  if (people.advance2 > 0) add("line", "− Advance (second)", people.advance2);
  if (people.loan > 0) add("line", "− Loan installments", people.loan);
  if (people.suit > 0) add("line", "− Suit deduction", people.suit);
  if (people.lateAmount > 0) add("line", "− Late arrivals", people.lateAmount);
  if (other > 0) add("line", "− Tax and other deductions", other);
  add("subtotal", "= Total deductions", deductions);

  add("heading", "4 · TO PAY");
  add("line", "Total calculated", calculated);
  add("line", "− Total deductions", deductions);
  add("total", "= To pay (net payable)", net);

  return lines;
}
