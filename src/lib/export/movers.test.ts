import { describe, expect, it } from "vitest";

import { groupRegister, toRegisterRow } from "@/lib/payroll/register";

import { registerPdf, registerWorkbook } from "./payroll-documents";

const mover = toRegisterRow({
  profileId: "m",
  name: "NEW JOINER",
  code: "RD-9",
  designation: "Operator",
  department: "Dyeing",
  monthlySalary: 31000,
  workingDays: 10,
  basePay: 10000,
  overtimeHours: 6,
  overtimePay: 750,
  gross: 10750,
  withheld: 0,
  net: 10750,
  lines: [{ code: "SUNDAY", label: "Sunday work", kind: "earning", hours: 6, days: 1, amount: 750 }],
  joinedOn: "2026-08-20",
});

describe("people who joined or left", () => {
  const groups = groupRegister([mover]);
  const meta = { title: "REGISTER", subtitle: "August 2026" };

  it("carries the register's figure columns in the PDF appendix", () => {
    const text = registerPdf(groups, meta).toString("latin1");
    expect(text).toContain("PEOPLE WHO JOINED OR LEFT");
    expect(text).toContain("NEW JOINER");
  });

  it("carries them in the workbook sheet too", () => {
    expect(registerWorkbook(groups, meta).length).toBeGreaterThan(0);
  });
});
