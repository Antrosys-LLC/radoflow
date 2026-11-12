import { describe, expect, it } from "vitest";

import { registerPdf, registerWorkbook } from "@/lib/export/payroll-documents";

import { movementIn, movementTag } from "./movements";
import { groupRegister, toRegisterRow, type RegisterItem } from "./register";

const START = "2026-10-01";
const END = "2026-10-30";

describe("who joined or left in a period", () => {
  it("calls somebody a leaver only when they left inside the period", () => {
    expect(movementIn({ left_on: "2026-10-15" }, START, END)).toEqual({
      joinedOn: null,
      leftOn: "2026-10-15",
    });
    expect(movementIn({ left_on: "2026-09-30" }, START, END)).toBeNull();
    expect(movementIn({ left_on: "2026-11-02" }, START, END)).toBeNull();
  });

  it("calls somebody a joiner from the date pay starts, not the import date", () => {
    expect(movementIn({ salary_from: "2026-10-20" }, START, END)).toEqual({
      joinedOn: "2026-10-20",
      leftOn: null,
    });
    expect(movementIn({ salary_from: null }, START, END)).toBeNull();
    expect(movementIn({}, START, END)).toBeNull();
  });

  it("words it for a cell", () => {
    const format = (date: string) => date.slice(5);
    expect(movementTag({ joinedOn: "2026-10-20", leftOn: null }, format)).toBe("Joined 10-20");
    expect(movementTag({ joinedOn: null, leftOn: "2026-10-15" }, format)).toBe("Left 10-15");
    expect(movementTag(null, format)).toBe("");
  });
});

describe("the register files", () => {
  const person = (over: Partial<RegisterItem>): RegisterItem => ({
    profileId: "p",
    name: "Ali",
    code: "RD-101",
    designation: "Operator",
    department: "Dyeing",
    monthlySalary: 31_000,
    workingDays: 20,
    basePay: 20_000,
    overtimeHours: 0,
    overtimePay: 0,
    gross: 20_000,
    withheld: 0,
    net: 20_000,
    lines: [],
    ...over,
  });

  const groups = groupRegister([
    toRegisterRow(person({})),
    toRegisterRow(
      person({ profileId: "q", name: "Sara", code: "RD-202", leftOn: "2026-10-15" }),
    ),
    toRegisterRow(
      person({ profileId: "r", name: "Omar", code: "RD-303", joinedOn: "2026-10-20" }),
    ),
  ]);
  const meta = { title: "SALARY REGISTER", subtitle: "Oct 2026" };

  it("carries joined and left through to the row", () => {
    const rows = groups.flatMap((group) => group.rows);
    expect(rows.find((row) => row.code === "RD-202")?.leftOn).toBe("2026-10-15");
    expect(rows.find((row) => row.code === "RD-303")?.joinedOn).toBe("2026-10-20");
    expect(rows.find((row) => row.code === "RD-101")?.leftOn).toBeNull();
  });

  it("builds the PDF and the workbook with joiners and leavers", () => {
    expect(registerPdf(groups, meta).length).toBeGreaterThan(1000);
    expect(registerWorkbook(groups, meta).length).toBeGreaterThan(1000);
  });
});
