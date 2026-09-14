import { describe, expect, it } from "vitest";

import {
  groupRegister,
  hasOtherDeductions,
  toRegisterRow,
  totalsOf,
  type RegisterItem,
} from "./register";

const item = (overrides: Partial<RegisterItem>): RegisterItem => ({
  profileId: "p1",
  name: "ISMAIL KHAN",
  code: "RD-2000",
  designation: "S Sup.",
  department: "Administration",
  monthlySalary: 46585,
  workingDays: 26,
  basePay: 39071.43,
  overtimeHours: 12,
  overtimePay: 2254.08,
  gross: 41325.51,
  withheld: 4300,
  net: 37025.51,
  lines: [
    { code: "ADVANCE", label: "Advance", kind: "deduction", amount: 2000 },
    { code: "LOAN", label: "Loan installment 1 of 10", kind: "deduction", amount: 1500 },
    { code: "SUIT", label: "Suit deduction", kind: "deduction", amount: 800 },
  ],
  ...overrides,
});

describe("payroll register", () => {
  it("lays one pay line out in the sheet's columns", () => {
    const row = toRegisterRow(item({}));

    expect(row).toMatchObject({
      sRate: 46585,
      days: 26,
      dayAmount: 39071.43,
      hours: 12,
      hourAmount: 2254.08,
      gross: 41325.51,
      advance: 2000,
      advance2: 0,
      loan: 1500,
      suit: 800,
      other: 0,
      net: 37025.51,
    });
    // The sheet's own arithmetic holds.
    expect(row.gross - row.advance - row.advance2 - row.loan - row.suit - row.other).toBeCloseTo(
      row.net,
    );
  });

  it("puts lateness and tax, which the sheet has no column for, in OTHER DED.", () => {
    const row = toRegisterRow(item({ withheld: 4750, net: 36575.51 }));
    expect(row.other).toBe(450);
    expect(hasOtherDeductions([row])).toBe(true);
  });

  it("groups by department, in name order, each with its own totals", () => {
    const rows = [
      toRegisterRow(item({ profileId: "a", name: "ZAFAR", department: "Kora" })),
      toRegisterRow(item({ profileId: "b", name: "MUSHTAQ", department: "Administration" })),
      toRegisterRow(item({ profileId: "c", name: "ALI", department: "Kora" })),
    ];

    const groups = groupRegister(rows);
    expect(groups.map((g) => g.department)).toEqual(["Administration", "Kora"]);
    expect(groups[1]!.rows.map((r) => r.name)).toEqual(["ALI", "ZAFAR"]);
    expect(groups[1]!.subtotal.sRate).toBe(93170);
    expect(totalsOf(rows).advance).toBe(6000);
  });
});
