import { describe, expect, it } from "vitest";

import { registerPdf, registerWorkbook } from "@/lib/export/payroll-documents";

import { payrollBreakdown } from "./breakdown";
import { contractFirmItem, groupRegister, toRegisterRow, type RegisterItem } from "./register";

const person = (over: Partial<RegisterItem>): RegisterItem => ({
  profileId: "p",
  name: "Ali",
  code: "1",
  designation: "Operator",
  department: "Dyeing",
  monthlySalary: 31_000,
  workingDays: 20,
  basePay: 20_000,
  overtimeHours: 4,
  overtimePay: 1_000,
  gross: 21_500,
  withheld: 2_000,
  net: 19_500,
  lines: [{ code: "ADVANCE", label: "Advance", kind: "deduction", amount: 1_500 }],
  ...over,
});

const rows = [
  toRegisterRow(person({})),
  toRegisterRow(
    person({
      profileId: "q",
      name: "Sara",
      monthlySalary: 20_000,
      basePay: 20_000,
      overtimePay: 0,
      gross: 20_000,
      withheld: 0,
      net: 20_000,
      lines: [],
    }),
  ),
  toRegisterRow(contractFirmItem("Antrosys", 35_000, "contract:1")),
];

const amountOf = (label: string) =>
  payrollBreakdown(rows).find((line) => line.label === label)?.amount;

describe("payroll breakdown", () => {
  it("starts from the full salary bill, firms included", () => {
    expect(amountOf("= Total payroll")).toBe(31_000 + 20_000 + 35_000);
  });

  it("shows what attendance did to the salaries", () => {
    // 51,000 of salaries earned only 40,000 of base pay.
    expect(amountOf("− Salary not earned (absence, Sundays, part months)")).toBe(11_000);
    expect(amountOf("= Base pay earned by attendance")).toBe(40_000);
    expect(amountOf("+ Weekday overtime")).toBe(1_000);
    expect(amountOf("+ Allowances and other earnings")).toBe(500);
    expect(amountOf("= Payroll of all people, by attendance")).toBe(41_500);
    expect(amountOf("= Total calculated")).toBe(41_500 + 35_000);
  });

  it("breaks deductions down and lands on what is paid", () => {
    expect(amountOf("− Advance")).toBe(1_500);
    expect(amountOf("− Tax and other deductions")).toBe(500);
    expect(amountOf("= Total deductions")).toBe(2_000);
    expect(amountOf("= To pay (net payable)")).toBe(76_500 - 2_000);
  });

  it("builds the PDF and the workbook from the same rows", () => {
    const groups = groupRegister(rows);
    const meta = { title: "SALARY REGISTER", subtitle: "Test" };
    expect(registerPdf(groups, meta).length).toBeGreaterThan(1000);
    expect(registerWorkbook(groups, meta).length).toBeGreaterThan(1000);
  });
});
