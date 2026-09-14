import { describe, expect, it } from "vitest";

import {
  collectedLoanDeductions,
  installmentDue,
  ledgerFor,
  loanBalance,
  planLoan,
  sheetDeductions,
  type LoanRow,
  type RecoveryRow,
} from "./ledger";

const loan: LoanRow = {
  id: "L1",
  profile_id: "p1",
  principal: 15000,
  installment: 1500,
  installments: 10,
  first_month: "2026-07-01",
  status: "active",
};

describe("loan plans", () => {
  it("counts the months a fixed installment takes", () => {
    expect(planLoan(15000, { installment: 1500 })).toEqual({ installment: 1500, installments: 10 });
    expect(planLoan(10000, { installment: 3000 })).toEqual({ installment: 3000, installments: 4 });
  });

  it("spreads the principal over a number of months, rounding up to the rupee", () => {
    expect(planLoan(10000, { months: 3 })).toEqual({ installment: 3334, installments: 3 });
  });

  it("refuses a plan with nothing to go on", () => {
    expect(planLoan(0, { months: 3 })).toBeNull();
    expect(planLoan(5000, {})).toBeNull();
  });
});

describe("installments", () => {
  const recoveries: RecoveryRow[] = [
    { loan_id: "L1", month: "2026-07-01", amount: 1500, source: "payroll" },
    { loan_id: "L1", month: "2026-08-01", amount: 1500, source: "payroll" },
  ];

  it("is due from the first month and not before", () => {
    expect(installmentDue(loan, [], "2026-06-01")).toBe(0);
    expect(installmentDue(loan, [], "2026-07-01")).toBe(1500);
  });

  it("asks for the same installment when a month's payroll is run again", () => {
    expect(installmentDue(loan, recoveries, "2026-08-01")).toBe(1500);
    expect(loanBalance(loan, recoveries)).toBe(12000);
  });

  it("takes only what is left in the final month", () => {
    const almost: RecoveryRow[] = [
      { loan_id: "L1", month: "2026-07-01", amount: 14000, source: "manual" },
    ];
    expect(installmentDue(loan, almost, "2026-09-01")).toBe(1000);
    expect(installmentDue({ ...loan, status: "settled" }, almost, "2026-09-01")).toBe(0);
  });

  it("builds the month's ledger lines and numbers the installment", () => {
    const ledger = ledgerFor(
      "p1",
      "2026-09-01",
      [
        { profile_id: "p1", kind: "advance", amount: 2000, label: null, month: "2026-09-01" },
        { profile_id: "p1", kind: "suit", amount: "800", label: null, month: "2026-09-01" },
        { profile_id: "p1", kind: "allowance", amount: 1500, label: "Fuel", month: "2026-09-01" },
        { profile_id: "p2", kind: "advance", amount: 9999, label: null, month: "2026-09-01" },
        { profile_id: "p1", kind: "advance", amount: 5000, label: null, month: "2026-08-01" },
      ],
      [loan],
      recoveries,
    );

    expect(ledger.components.map((c) => [c.code, c.kind, c.amount, c.label])).toEqual([
      ["ADVANCE", "deduction", 2000, "Advance"],
      ["SUIT", "deduction", 800, "Suit deduction"],
      ["ALLOWANCE", "earning", 1500, "Fuel"],
      ["LOAN", "deduction", 1500, "Loan installment 3 of 10"],
    ]);
    expect(ledger.loanDeductions).toEqual([{ loanId: "L1", amount: 1500 }]);
  });
});

describe("collecting loan deductions", () => {
  it("takes a shortfall off the loan lines first", () => {
    expect(
      collectedLoanDeductions(
        [
          { loanId: "A", amount: 1000 },
          { loanId: "B", amount: 500 },
        ],
        700,
      ),
    ).toEqual([
      { loanId: "A", amount: 800 },
      { loanId: "B", amount: 0 },
    ]);
  });

  it("reads the sheet's columns back out of a payslip", () => {
    expect(
      sheetDeductions([
        { code: "BASIC", label: "Salary", kind: "base", amount: 30000 },
        { code: "ADVANCE", label: "Advance", kind: "deduction", amount: 2000 },
        { code: "ADVANCE", label: "Advance", kind: "deduction", amount: 500 },
        { code: "ADVANCE_2", label: "Advance", kind: "deduction", amount: 300 },
        { code: "LOAN", label: "Loan", kind: "deduction", amount: 1500 },
        { code: "SUIT", label: "Suit", kind: "deduction", amount: 800 },
      ]),
    ).toEqual({ advance: 2500, advance2: 300, loan: 1500, suit: 800 });
  });
});
