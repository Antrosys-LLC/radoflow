import type { PayComponent, PayslipLine } from "./types";

/**
 * The salary ledger: the figures the office adds to a month by hand.
 *
 * The salary sheet has four columns between G SALARY and NET PAY — two
 * advances, a loan deduction and a suit deduction — and an allowance or other
 * deduction turns up often enough to need a home too. Each is a row in
 * `salary_adjustments` for one person and one month, and a loan is paid back
 * in installments from `employee_loans`.
 *
 * Pure: the payroll run supplies the rows for the period, and this turns them
 * into payslip components the engine already knows how to apply, with codes
 * the register reads its columns back out of.
 */

export type AdjustmentKind = "advance" | "advance_2" | "suit" | "allowance" | "deduction";

export const LEDGER_CODES = {
  advance: "ADVANCE",
  advance_2: "ADVANCE_2",
  suit: "SUIT",
  allowance: "ALLOWANCE",
  deduction: "DEDUCTION",
  loan: "LOAN",
} as const;

const DEFAULT_LABELS: Record<AdjustmentKind, string> = {
  advance: "Advance",
  advance_2: "Advance (second)",
  suit: "Suit deduction",
  allowance: "Allowance",
  deduction: "Deduction",
};

export interface AdjustmentRow {
  profile_id: string;
  kind: AdjustmentKind;
  amount: number | string;
  label: string | null;
  month: string;
}

export interface LoanRow {
  id: string;
  profile_id: string;
  principal: number | string;
  installment: number | string;
  installments: number;
  first_month: string;
  status: string;
}

export interface RecoveryRow {
  loan_id: string;
  month: string;
  amount: number | string;
  source: string;
}

const round2 = (value: number) => Math.round(value * 100) / 100;

/** The first of the month a date falls in. */
export function monthOf(date: string): string {
  return `${date.slice(0, 7)}-01`;
}

/**
 * What an installment plan comes to.
 *
 * Either a fixed installment — the number of months follows from it — or a
 * number of months, in which case the installment is the principal spread
 * across them, rounded up to the rupee so the last month is never left with a
 * few rupees nobody asked for. The final installment is simply whatever is
 * left, which is why a balance is never stored.
 */
export function planLoan(
  principal: number,
  terms: { installment?: number | null; months?: number | null },
): { installment: number; installments: number } | null {
  if (!(principal > 0)) return null;

  if (terms.installment && terms.installment > 0) {
    const installment = Math.min(round2(terms.installment), principal);
    return { installment, installments: Math.ceil(principal / installment) };
  }

  if (terms.months && terms.months >= 1) {
    const months = Math.floor(terms.months);
    const installment = Math.ceil(principal / months);
    return { installment, installments: Math.ceil(principal / installment) };
  }

  return null;
}

/** Everything recovered on a loan, optionally leaving out one month's payroll line. */
export function recoveredOn(
  loanId: string,
  recoveries: readonly RecoveryRow[],
  exceptPayrollMonth?: string,
): number {
  return round2(
    recoveries
      .filter(
        (row) =>
          row.loan_id === loanId &&
          !(exceptPayrollMonth && row.month === exceptPayrollMonth && row.source === "payroll"),
      )
      .reduce((total, row) => total + Number(row.amount), 0),
  );
}

export function loanBalance(loan: LoanRow, recoveries: readonly RecoveryRow[]): number {
  return Math.max(0, round2(Number(loan.principal) - recoveredOn(loan.id, recoveries)));
}

/**
 * The installment due from one month's pay.
 *
 * The month's own payroll line is left out of what has been recovered, so
 * running the same payroll twice asks for the same installment rather than
 * the next one. Cash repaid by hand in the month does count.
 */
export function installmentDue(
  loan: LoanRow,
  recoveries: readonly RecoveryRow[],
  month: string,
): number {
  if (loan.status !== "active" || month < loan.first_month) return 0;
  const remaining = Number(loan.principal) - recoveredOn(loan.id, recoveries, month);
  return Math.max(0, round2(Math.min(Number(loan.installment), remaining)));
}

export interface LedgerForPerson {
  components: PayComponent[];
  /** What each loan is due to have taken back this month, before any shortfall. */
  loanDeductions: { loanId: string; amount: number }[];
}

export function ledgerFor(
  profileId: string,
  month: string,
  adjustments: readonly AdjustmentRow[],
  loans: readonly LoanRow[],
  recoveries: readonly RecoveryRow[],
): LedgerForPerson {
  const components: PayComponent[] = [];

  adjustments
    .filter((row) => row.profile_id === profileId && monthOf(row.month) === month)
    .forEach((row, index) => {
      const amount = round2(Number(row.amount));
      if (!(amount > 0)) return;
      components.push({
        code: LEDGER_CODES[row.kind],
        label: row.label?.trim() || DEFAULT_LABELS[row.kind],
        kind: row.kind === "allowance" ? "earning" : "deduction",
        calc: "fixed",
        amount,
        percent: 0,
        sortOrder: 600 + index,
      });
    });

  const loanDeductions: LedgerForPerson["loanDeductions"] = [];

  for (const loan of loans.filter((row) => row.profile_id === profileId)) {
    const amount = installmentDue(loan, recoveries, month);
    if (amount <= 0) continue;

    const paidBefore = recoveries.filter(
      (row) =>
        row.loan_id === loan.id &&
        Number(row.amount) > 0 &&
        !(row.month === month && row.source === "payroll"),
    ).length;

    loanDeductions.push({ loanId: loan.id, amount });
    components.push({
      code: LEDGER_CODES.loan,
      label: `Loan installment ${Math.min(paidBefore + 1, loan.installments)} of ${loan.installments}`,
      kind: "deduction",
      calc: "fixed",
      amount,
      percent: 0,
      sortOrder: 700,
    });
  }

  return { components, loanDeductions };
}

/**
 * What the loans actually got, once earnings are known.
 *
 * Net pay cannot go below zero, so a short month leaves some deductions
 * uncollected. Loans are treated as collected last: an advance is money
 * already handed over this month, a loan installment can wait for the next.
 * The shortfall comes off the loan lines first, which is what keeps a loan's
 * balance honest.
 */
export function collectedLoanDeductions(
  planned: readonly { loanId: string; amount: number }[],
  uncollected: number,
): { loanId: string; amount: number }[] {
  let shortfall = Math.max(0, uncollected);
  return [...planned]
    .reverse()
    .map((line) => {
      const taken = Math.min(line.amount, shortfall);
      shortfall = round2(shortfall - taken);
      return { loanId: line.loanId, amount: round2(line.amount - taken) };
    })
    .reverse();
}

/** The sheet's deduction columns, read back out of a payslip's lines. */
export function sheetDeductions(lines: readonly PayslipLine[]) {
  const sum = (code: string) =>
    round2(
      lines
        .filter((line) => line.code === code && line.kind !== "earning" && line.kind !== "base")
        .reduce((total, line) => total + line.amount, 0),
    );

  return {
    advance: sum(LEDGER_CODES.advance),
    advance2: sum(LEDGER_CODES.advance_2),
    loan: sum(LEDGER_CODES.loan),
    suit: sum(LEDGER_CODES.suit),
  };
}
