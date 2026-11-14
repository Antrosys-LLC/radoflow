import { describe, expect, it } from "vitest";

import { calculatePayroll } from "./engine";
import { toRegisterRow } from "./register";
import { DEFAULT_PAY_RULE, type AttendanceDay, type Employee, type LatePenaltyTier } from "./types";

const operator: Employee = {
  id: "e1",
  fullName: "Test Operator",
  employeeCode: "RD-1",
  payClass: "monthly",
  requiresAttendance: true,
  monthlySalary: 31_000, // ₨1,000 a day in a 31-day month, ₨125 an hour
  hourlyRate: 0,
  dutyHours: 8,
};

const day = (workDate: string, over: Partial<AttendanceDay> = {}): AttendanceDay => ({
  workDate,
  dayType: "workday",
  hoursWorked: 8,
  status: "present",
  ...over,
});

const late: LatePenaltyTier = {
  label: "Late",
  fromMinutes: 1,
  toMinutes: null,
  penaltyPercent: 10,
  basis: "day",
};

// 2026-08-03 Monday .. 2026-08-04 Tuesday, 2026-08-09 is a Sunday.
const month = [
  day("2026-08-03", { hoursWorked: 10 }), // 2 h weekday overtime
  day("2026-08-04", { minutesLate: 20 }), // late
  day("2026-08-09", { dayType: "off", hoursWorked: 6 }), // 6 h Sunday
];

function register(days: AttendanceDay[]) {
  const result = calculatePayroll({
    employee: operator,
    rule: DEFAULT_PAY_RULE,
    days,
    latePenaltyTiers: [late],
    daysInMonth: 31,
  });
  return {
    result,
    row: toRegisterRow({
      profileId: "e1",
      name: operator.fullName,
      code: operator.employeeCode,
      designation: "",
      department: "Dyeing",
      monthlySalary: operator.monthlySalary,
      workingDays: result.workingDays,
      basePay: result.basePay,
      overtimeHours: result.hours.overtime + result.hours.weekend + result.hours.holiday,
      overtimePay: result.otPay + result.weekendPay + result.holidayPay,
      gross: result.gross,
      withheld: result.deductions + result.tax,
      net: result.net,
      lines: result.lines,
    }),
  };
}

describe("Sundays, overtime and lateness on their own", () => {
  it("prices working days, Sundays and weekday overtime separately", () => {
    const { row } = register(month);

    expect(row.days).toBe(2);
    expect(row.dayAmount).toBe(2_000);

    expect(row.sundayDays).toBe(1);
    expect(row.sundayHours).toBe(6);
    expect(row.sundayAmount).toBe(750); // 6 h × ₨125

    expect(row.hours).toBe(2);
    expect(row.hourAmount).toBe(250); // 2 h × ₨125
  });

  it("splits without changing the total paid", () => {
    const { result, row } = register(month);
    expect(result.otPay).toBe(1_000);
    expect(row.sundayAmount + row.hourAmount).toBe(result.otPay);
    expect(row.gross).toBe(row.dayAmount + row.sundayAmount + row.hourAmount);
  });

  it("shows lateness as days and rupees, not as 'other'", () => {
    const { row } = register(month);
    expect(row.lateDays).toBe(1);
    expect(row.lateAmount).toBe(100); // 10% of a ₨1,000 day
    expect(row.other).toBe(0);
    expect(row.net).toBe(row.gross - row.lateAmount);
  });

  it("with no Sunday worked, nothing is shown for Sundays", () => {
    const { row } = register(month.slice(0, 2));
    expect(row.sundayDays).toBe(0);
    expect(row.sundayAmount).toBe(0);
  });
});
