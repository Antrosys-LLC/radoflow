import { describe, expect, it } from "vitest";

import { applyComponents, evaluateSlabs } from "./components";
import { calculatePayroll, summarisePayroll } from "./engine";
import {
  accumulateHours,
  countWorkingDays,
  dailyRate,
  daysInMonthOf,
  excessHours,
  isSunday,
  overtimeRate,
  roundHours,
  splitDayHours,
} from "./hours";
import {
  DEFAULT_PAY_RULE,
  type AttendanceDay,
  type Employee,
  type LatePenaltyTier,
  type PayComponent,
} from "./types";

const rule = { ...DEFAULT_PAY_RULE };

const hourlyWorker: Employee = {
  id: "e1",
  fullName: "Imran Sheikh",
  employeeCode: "RD-1042",
  payClass: "hourly",
  requiresAttendance: true,
  monthlySalary: 0,
  hourlyRate: 320,
};

const monthlyStaff: Employee = {
  id: "e2",
  fullName: "Sana Yusuf",
  employeeCode: "RD-1043",
  payClass: "monthly",
  requiresAttendance: false,
  monthlySalary: 180_000,
  hourlyRate: 0,
};

function day(partial: Partial<AttendanceDay> & { workDate: string }): AttendanceDay {
  return {
    dayType: "workday",
    hoursWorked: 8,
    status: "present",
    ...partial,
  };
}

/**
 * The non-Sunday dates of August 2026 from the 3rd onwards.
 *
 * Exactly 25 of them, which is the worked example the pay model was confirmed
 * against: 40000 / 31 = 1290.32 a day, 25 days, ₨32,258.
 */
const AUGUST_WORKDAYS = Array.from({ length: 29 }, (_, i) =>
  new Date(Date.UTC(2026, 7, 3 + i)).toISOString().slice(0, 10),
).filter((date) => new Date(`${date}T00:00:00Z`).getUTCDay() !== 0);

function workdayDate(index: number): string {
  const date = AUGUST_WORKDAYS[index];
  if (!date) throw new Error(`no workday at index ${index}`);
  return date;
}

describe("hour bucketing", () => {
  it("treats a standard shift as entirely regular hours", () => {
    const buckets = splitDayHours(day({ workDate: "2026-08-03" }), rule);
    expect(buckets).toEqual({ regular: 8, overtime: 0, weekend: 0, holiday: 0 });
  });

  it("splits anything past the standard day into overtime", () => {
    const buckets = splitDayHours(day({ workDate: "2026-08-03", hoursWorked: 11 }), rule);
    expect(buckets.regular).toBe(8);
    expect(buckets.overtime).toBe(3);
  });

  it("absorbs overruns below the overtime threshold into the standard day", () => {
    // 20 minutes over, threshold is 30.
    const buckets = splitDayHours(day({ workDate: "2026-08-03", hoursWorked: 8.25 }), rule);
    expect(buckets.overtime).toBe(0);
    expect(buckets.regular).toBe(8.25);
  });

  it("pays an activated weekend shift entirely at the weekend rate", () => {
    const buckets = splitDayHours(
      day({ workDate: "2026-08-08", dayType: "weekend_working", hoursWorked: 10 }),
      rule,
    );
    expect(buckets).toEqual({ regular: 0, overtime: 0, weekend: 10, holiday: 0 });
  });

  it("treats work on a declared off-day as weekend-rated", () => {
    const buckets = splitDayHours(
      day({ workDate: "2026-08-05", dayType: "off", hoursWorked: 6 }),
      rule,
    );
    expect(buckets.weekend).toBe(6);
    expect(buckets.regular).toBe(0);
  });

  it("rounds worked time to the configured granularity", () => {
    // 8h07m rounds to 8h00 at 15-minute granularity.
    expect(roundHours(8.1167, 15)).toBe(8);
    expect(roundHours(8.3, 15)).toBe(8.25);
  });

  it("prices a day against the real length of the month", () => {
    expect(dailyRate(40_000, 31)).toBe(1290.32);
    expect(dailyRate(40_000, 30)).toBe(1333.33);
    // The same salary buys a bigger day in a short month.
    expect(dailyRate(40_000, 28)).toBe(1428.57);
  });

  it("prices an overtime hour at an eighth of the day", () => {
    // 40000 / 31 = 1290.32 per day; / 8 = 161.29 per overtime hour.
    expect(overtimeRate(40_000, 31)).toBe(161.29);
  });

  it("reads the month length off a work date", () => {
    expect(daysInMonthOf("2026-08-15")).toBe(31);
    expect(daysInMonthOf("2026-02-15")).toBe(28);
  });

  it("identifies Sundays in UTC, not in the server's timezone", () => {
    expect(isSunday("2026-08-02")).toBe(true);
    expect(isSunday("2026-08-09")).toBe(true);
    // Saturday is an ordinary working day here.
    expect(isSunday("2026-08-08")).toBe(false);
    expect(isSunday("2026-08-03")).toBe(false);
  });

  it("pays every Sunday hour as overtime, whatever the day type says", () => {
    const buckets = splitDayHours(
      day({ workDate: "2026-08-02", dayType: "off", hoursWorked: 12 }),
      rule,
    );
    expect(buckets).toEqual({ regular: 0, overtime: 12, weekend: 0, holiday: 0 });
  });

  it("treats a twelve-hour duty day as entirely regular for a guard", () => {
    const buckets = splitDayHours(day({ workDate: "2026-08-03", hoursWorked: 12 }), rule, 12);
    expect(buckets.regular).toBe(12);
    expect(buckets.overtime).toBe(0);
  });

  it("pays the last four of the same shift as overtime on an eight-hour duty", () => {
    const buckets = splitDayHours(day({ workDate: "2026-08-03", hoursWorked: 12 }), rule, 8);
    expect(buckets.regular).toBe(8);
    expect(buckets.overtime).toBe(4);
  });

  it("stops paying overtime past the daily ceiling", () => {
    // 16 hours on an 8-hour duty is 8 hours over, but only 4 are payable.
    const buckets = splitDayHours(day({ workDate: "2026-08-03", hoursWorked: 16 }), rule, 8);
    expect(buckets.regular).toBe(8);
    expect(buckets.overtime).toBe(4);
  });

  it("applies the ceiling from the duty boundary, not from eight hours", () => {
    // A guard's salary covers 12; the ceiling allows 4 more, so 16 is the most
    // that is ever payable in a day.
    expect(splitDayHours(day({ workDate: "2026-08-03", hoursWorked: 18 }), rule, 12)).toEqual({
      regular: 12,
      overtime: 4,
      weekend: 0,
      holiday: 0,
    });
  });

  it("leaves overtime below the ceiling untouched", () => {
    const buckets = splitDayHours(day({ workDate: "2026-08-03", hoursWorked: 11 }), rule, 8);
    expect(buckets.overtime).toBe(3);
  });

  it("pays a Sunday the calendar explicitly scheduled as a working day like an ordinary shift", () => {
    // The factory ran this Sunday as a normal duty day and gave a different
    // weekday off in exchange — it must be priced as a workday, not swept
    // into the blanket Sunday-overtime rule.
    const buckets = splitDayHours(
      day({ workDate: "2026-08-02", dayType: "workday", hoursWorked: 12 }),
      rule,
      8,
    );
    expect(buckets.regular).toBe(8);
    expect(buckets.overtime).toBe(4);
  });

  it("still pays an un-overridden Sunday as overtime even for the same person", () => {
    // Same employee terms, but this particular Sunday was never overridden —
    // the default `off` day type keeps the blanket overtime rule.
    const buckets = splitDayHours(
      day({ workDate: "2026-08-02", dayType: "off", hoursWorked: 12 }),
      rule,
      8,
    );
    expect(buckets.regular).toBe(0);
    expect(buckets.overtime).toBe(12);
  });

  it("pays a Sunday overridden to special_working the same as an ordinary duty day", () => {
    // special_working is grouped with workday in the switch below, not with
    // the weekend-rated days — so this follows the same duty/overtime split.
    const buckets = splitDayHours(
      day({ workDate: "2026-08-02", dayType: "special_working", hoursWorked: 12 }),
      rule,
      8,
    );
    expect(buckets.regular).toBe(8);
    expect(buckets.overtime).toBe(4);
  });

  it("pays a Sunday overridden to weekend_working at the weekend rate", () => {
    const buckets = splitDayHours(
      day({ workDate: "2026-08-02", dayType: "weekend_working", hoursWorked: 8 }),
      rule,
    );
    expect(buckets).toEqual({ regular: 0, overtime: 0, weekend: 8, holiday: 0 });
  });

  it("pays a Sunday overridden to a declared holiday at the holiday rate", () => {
    const buckets = splitDayHours(
      day({ workDate: "2026-08-02", dayType: "holiday", hoursWorked: 8 }),
      rule,
    );
    expect(buckets).toEqual({ regular: 0, overtime: 0, weekend: 0, holiday: 8 });
  });

  it("does not cap a Sunday, where every hour is overtime", () => {
    const buckets = splitDayHours(
      day({ workDate: "2026-08-02", dayType: "off", hoursWorked: 12 }),
      rule,
      8,
    );
    expect(buckets.overtime).toBe(12);
  });

  it("pays no overtime at all when the ceiling is zero", () => {
    const noOvertime = { ...rule, otDailyCapHours: 0 };
    const buckets = splitDayHours(day({ workDate: "2026-08-03", hoursWorked: 12 }), noOvertime, 8);
    expect(buckets.regular).toBe(8);
    expect(buckets.overtime).toBe(0);
  });

  it("records but does not pay overtime for staff who earn none", () => {
    // "8 Hours Duty" with no "+ Over time" on the workers list.
    const buckets = splitDayHours(day({ workDate: "2026-08-03", hoursWorked: 12 }), rule, 8, {
      overtimeEligible: false,
    });
    expect(buckets.regular).toBe(8);
    expect(buckets.overtime).toBe(0);
  });

  it("pays no Sunday overtime either, for the same staff", () => {
    const buckets = splitDayHours(
      day({ workDate: "2026-08-02", dayType: "off", hoursWorked: 12 }),
      rule,
      8,
      { overtimeEligible: false },
    );
    expect(buckets.overtime).toBe(0);
  });

  it("does not pay a Sunday that is taken as leave instead", () => {
    const buckets = splitDayHours(
      day({ workDate: "2026-08-02", dayType: "off", hoursWorked: 12 }),
      rule,
      8,
      { sundayPolicy: "adjust_in_leave" },
    );
    expect(buckets.overtime).toBe(0);
  });

  it("still pays that person's weekday overtime normally", () => {
    const buckets = splitDayHours(day({ workDate: "2026-08-03", hoursWorked: 12 }), rule, 8, {
      sundayPolicy: "adjust_in_leave",
    });
    expect(buckets.overtime).toBe(4);
  });

  it("reports no excess for a day within the overtime ceiling", () => {
    expect(excessHours(day({ workDate: "2026-08-03", hoursWorked: 11 }), rule, 8)).toBe(0);
  });

  it("reports the hours a long day drops past the overtime ceiling", () => {
    // 16 worked on an 8-hour duty: 8 regular + 4 payable OT, 4 dropped.
    expect(excessHours(day({ workDate: "2026-08-03", hoursWorked: 16 }), rule, 8)).toBe(4);
  });

  it("reports the full second shift's worth on a double-duty day", () => {
    // Two genuine 8+4 shifts back to back read as one 24-hour total: 8
    // regular + 4 payable OT is paid, and the entire second shift (12 more
    // hours) currently has nowhere to go.
    expect(excessHours(day({ workDate: "2026-08-03", hoursWorked: 24 }), rule, 8)).toBe(12);
  });

  it("reports no excess for a default Sunday, which is never capped", () => {
    expect(
      excessHours(day({ workDate: "2026-08-02", dayType: "off", hoursWorked: 24 }), rule, 8),
    ).toBe(0);
  });

  it("reports no excess once the Sunday is overridden to an ordinary duty day", () => {
    // Now it goes through the same ceiling as any other workday.
    expect(
      excessHours(day({ workDate: "2026-08-02", dayType: "workday", hoursWorked: 24 }), rule, 8),
    ).toBe(12);
  });

  it("reports no excess for premium-rated days, which are paid uncapped", () => {
    expect(
      excessHours(
        day({ workDate: "2026-08-08", dayType: "weekend_working", hoursWorked: 20 }),
        rule,
        8,
      ),
    ).toBe(0);
    expect(
      excessHours(day({ workDate: "2026-08-14", dayType: "holiday", hoursWorked: 20 }), rule, 8),
    ).toBe(0);
  });

  it("reports no excess for staff who earn no overtime — nothing is being hidden", () => {
    expect(
      excessHours(day({ workDate: "2026-08-03", hoursWorked: 20 }), rule, 8, {
        overtimeEligible: false,
      }),
    ).toBe(0);
  });

  it("reports no excess when the ceiling itself is uncapped", () => {
    const uncapped = { ...rule, otDailyCapHours: -1 };
    expect(excessHours(day({ workDate: "2026-08-03", hoursWorked: 20 }), uncapped, 8)).toBe(0);
  });

  it("counts a working day once, however short it was", () => {
    const days = [
      day({ workDate: "2026-08-03", hoursWorked: 2 }),
      day({ workDate: "2026-08-04", hoursWorked: 8 }),
    ];
    expect(countWorkingDays(days)).toBe(2);
  });

  it("counts neither Sundays, absence nor leave as working days", () => {
    const days = [
      day({ workDate: "2026-08-02", hoursWorked: 12 }), // Sunday, worked
      day({ workDate: "2026-08-03", hoursWorked: 0, status: "absent" }),
      day({ workDate: "2026-08-04", hoursWorked: 0, status: "leave" }),
      day({ workDate: "2026-08-05", hoursWorked: 8 }),
    ];
    expect(countWorkingDays(days)).toBe(1);
  });
});

describe("hourly payroll", () => {
  it("pays regular hours at the base rate", () => {
    const days = Array.from({ length: 5 }, (_, i) => day({ workDate: `2026-08-0${i + 3}` }));
    const result = calculatePayroll({ employee: hourlyWorker, rule, days });

    expect(result.hours.regular).toBe(40);
    expect(result.basePay).toBe(40 * 320);
    expect(result.gross).toBe(12_800);
    expect(result.net).toBe(12_800);
  });

  it("pays overtime at the configured rupee rate, not a multiple of basic", () => {
    const days = [day({ workDate: "2026-08-03", hoursWorked: 12 })];
    const result = calculatePayroll({ employee: hourlyWorker, rule, days });

    expect(result.basePay).toBe(8 * 320);
    // 4 OT hours at the flat ₨480/h rate.
    expect(result.otPay).toBe(4 * 480);
    expect(result.gross).toBe(2560 + 1920);
  });

  it("keeps overtime unchanged when the base wage changes", () => {
    // The whole point of absolute rates: a raise must not silently inflate
    // every premium along with it.
    const days = [day({ workDate: "2026-08-03", hoursWorked: 12 })];
    const raised = { ...hourlyWorker, hourlyRate: 500 };

    const before = calculatePayroll({ employee: hourlyWorker, rule, days });
    const after = calculatePayroll({ employee: raised, rule, days });

    expect(after.basePay).toBeGreaterThan(before.basePay);
    expect(after.otPay).toBe(before.otPay);
  });

  it("prefers a per-employee negotiated overtime rate", () => {
    const days = [day({ workDate: "2026-08-03", hoursWorked: 12 })];
    const negotiated = { ...hourlyWorker, otHourlyRate: 550 };
    const result = calculatePayroll({ employee: negotiated, rule, days });

    expect(result.otPay).toBe(4 * 550);
  });

  it("pays a weekend shift at the weekend rate, not the overtime one", () => {
    const days = [day({ workDate: "2026-08-08", dayType: "weekend_working", hoursWorked: 8 })];
    const result = calculatePayroll({ employee: hourlyWorker, rule, days });

    expect(result.otPay).toBe(0);
    expect(result.weekendPay).toBe(8 * 640);
    expect(result.gross).toBe(5120);
  });

  it("honours a one-off rate agreed for a specific date", () => {
    const days = [
      day({
        workDate: "2026-08-08",
        dayType: "weekend_working",
        hoursWorked: 8,
        overrideHourlyRate: 800,
      }),
    ];
    const result = calculatePayroll({ employee: hourlyWorker, rule, days });
    expect(result.weekendPay).toBe(8 * 800);
  });

  it("pays nothing for a day the factory was shut and nobody worked", () => {
    const days = [day({ workDate: "2026-08-05", dayType: "off", hoursWorked: 0, status: "off" })];
    const result = calculatePayroll({ employee: hourlyWorker, rule, days });
    expect(result.gross).toBe(0);
  });

  it("carries no flagged hours for an ordinary period", () => {
    const days = Array.from({ length: 5 }, (_, i) => day({ workDate: `2026-08-0${i + 3}` }));
    const result = calculatePayroll({ employee: hourlyWorker, rule, days });
    expect(result.flaggedHours).toBe(0);
    expect(result.flaggedDays).toEqual([]);
  });

  it("flags a double-duty day on the payroll result, without changing its pay", () => {
    const days = [
      day({ workDate: "2026-08-03", hoursWorked: 8 }),
      day({ workDate: "2026-08-04", hoursWorked: 24 }),
    ];
    const result = calculatePayroll({ employee: hourlyWorker, rule, days });

    expect(result.flaggedHours).toBe(12);
    expect(result.flaggedDays).toEqual([{ workDate: "2026-08-04", hours: 12 }]);
    // The payment is exactly what the ceiling already produced — flagging is
    // observation, not a second calculation.
    expect(result.hours.regular).toBe(8 + 8);
    expect(result.hours.overtime).toBe(4);
  });
});

describe("monthly payroll", () => {
  it("pays the full salary when attendance is not required", () => {
    const result = calculatePayroll({ employee: monthlyStaff, rule, days: [] });
    expect(result.basePay).toBe(180_000);
    expect(result.net).toBe(180_000);
  });

  it("is unaffected by absence when attendance is not required", () => {
    const days = [day({ workDate: "2026-08-03", hoursWorked: 0, status: "absent" })];
    const result = calculatePayroll({ employee: monthlyStaff, rule, days });
    expect(result.basePay).toBe(180_000);
  });

  it("pays the days worked, priced against the length of the month", () => {
    // The anchor case: 40000 / 31 = 1290.32 a day, 25 days worked.
    const tracked: Employee = {
      ...monthlyStaff,
      requiresAttendance: true,
      monthlySalary: 40_000,
    };
    const days = Array.from({ length: 25 }, (_, i) =>
      // 3rd to 27th August 2026, skipping the two Sundays in that span.
      day({ workDate: workdayDate(i) }),
    );
    const result = calculatePayroll({ employee: tracked, rule, days, daysInMonth: 31 });

    expect(result.dailyRate).toBe(1290.32);
    expect(result.workingDays).toBe(25);
    expect(result.basePay).toBe(32_258);
  });

  it("earns nothing for a day that was not attended", () => {
    const tracked: Employee = { ...monthlyStaff, requiresAttendance: true };
    const worked = [day({ workDate: "2026-08-03" }), day({ workDate: "2026-08-04" })];
    const withAbsence = [
      ...worked,
      day({ workDate: "2026-08-05", hoursWorked: 0, status: "absent" }),
    ];

    const a = calculatePayroll({ employee: tracked, rule, days: worked, daysInMonth: 31 });
    const b = calculatePayroll({ employee: tracked, rule, days: withAbsence, daysInMonth: 31 });

    // Absence is not a deduction from a full salary — it is simply a day that
    // was never earned, so adding one changes nothing.
    expect(b.basePay).toBe(a.basePay);
    expect(b.daysAbsent).toBe(1);
  });

  it("pays nothing for approved leave, which is a day not attended", () => {
    const tracked: Employee = { ...monthlyStaff, requiresAttendance: true };
    const days = [day({ workDate: "2026-08-03", hoursWorked: 0, status: "leave" })];
    const result = calculatePayroll({ employee: tracked, rule, days, daysInMonth: 31 });

    expect(result.basePay).toBe(0);
    expect(result.workingDays).toBe(0);
    expect(result.daysLeave).toBe(1);
  });

  it("gives the same salary a bigger daily rate in February than in August", () => {
    const tracked: Employee = { ...monthlyStaff, requiresAttendance: true, monthlySalary: 40_000 };
    const august = calculatePayroll({
      employee: tracked,
      rule,
      days: [day({ workDate: "2026-08-03" })],
      daysInMonth: 31,
    });
    const february = calculatePayroll({
      employee: tracked,
      rule,
      days: [day({ workDate: "2026-02-02" })],
      daysInMonth: 28,
    });

    expect(august.dailyRate).toBe(1290.32);
    expect(february.dailyRate).toBe(1428.57);
    expect(february.basePay).toBeGreaterThan(august.basePay);
  });

  it("pays a guard nothing extra for the twelve hours their salary covers", () => {
    const guard: Employee = {
      ...monthlyStaff,
      requiresAttendance: true,
      monthlySalary: 40_000,
      dutyHours: 12,
    };
    const result = calculatePayroll({
      employee: guard,
      rule,
      days: [day({ workDate: "2026-08-03", hoursWorked: 12 })],
      daysInMonth: 31,
    });

    expect(result.otPay).toBe(0);
    expect(result.basePay).toBe(1290.32);
  });

  it("pays four hours of overtime for the same shift on an eight-hour duty", () => {
    const operator: Employee = {
      ...monthlyStaff,
      requiresAttendance: true,
      monthlySalary: 40_000,
      dutyHours: 8,
    };
    const result = calculatePayroll({
      employee: operator,
      rule,
      days: [day({ workDate: "2026-08-03", hoursWorked: 12 })],
      daysInMonth: 31,
    });

    // 4 hours at 1290.32 / 8 = 161.29.
    expect(result.hours.overtime).toBe(4);
    expect(result.otPay).toBe(645.16);
  });

  it("pays a short day three hours of overtime, not the rostered four", () => {
    const operator: Employee = {
      ...monthlyStaff,
      requiresAttendance: true,
      monthlySalary: 40_000,
      dutyHours: 8,
    };
    const result = calculatePayroll({
      employee: operator,
      rule,
      days: [day({ workDate: "2026-08-03", hoursWorked: 11 })],
      daysInMonth: 31,
    });

    expect(result.hours.overtime).toBe(3);
    expect(result.otPay).toBe(483.87);
  });

  it("pays a full Sunday the same to a guard and to an operator", () => {
    const sunday = [day({ workDate: "2026-08-02", dayType: "off", hoursWorked: 12 })];
    const base: Employee = { ...monthlyStaff, requiresAttendance: true, monthlySalary: 40_000 };

    const guard = calculatePayroll({
      employee: { ...base, dutyHours: 12 },
      rule,
      days: sunday,
      daysInMonth: 31,
    });
    const operator = calculatePayroll({
      employee: { ...base, dutyHours: 8 },
      rule,
      days: sunday,
      daysInMonth: 31,
    });

    // Every Sunday hour is overtime at an eighth of the day, for both.
    expect(guard.otPay).toBe(1935.48);
    expect(operator.otPay).toBe(1935.48);
    // And a Sunday is never a working day, so neither earns base pay for it.
    expect(guard.basePay).toBe(0);
    expect(operator.workingDays).toBe(0);
  });

  it("still pays a monthly supervisor for a weekend shift", () => {
    const days = [day({ workDate: "2026-08-08", dayType: "weekend_working", hoursWorked: 8 })];
    const result = calculatePayroll({ employee: monthlyStaff, rule, days });

    // Premium hours pay the flat weekend rate regardless of pay class.
    expect(result.weekendPay).toBe(8 * 640);
    expect(result.gross).toBe(180_000 + 5120);
  });
});

describe("contractors", () => {
  const contractor: Employee = {
    ...monthlyStaff,
    fullName: "Folding contract",
    workerType: "contractor",
    requiresAttendance: true,
    monthlySalary: 250_000,
  };

  it("pays the agreed amount flat, whatever the attendance says", () => {
    const worked = calculatePayroll({
      employee: contractor,
      rule,
      days: [day({ workDate: "2026-08-03" }), day({ workDate: "2026-08-04" })],
      daysInMonth: 31,
    });
    const idle = calculatePayroll({ employee: contractor, rule, days: [], daysInMonth: 31 });

    expect(worked.basePay).toBe(250_000);
    expect(idle.basePay).toBe(250_000);
  });

  it("is not prorated by absence", () => {
    const days = [
      day({ workDate: "2026-08-03", hoursWorked: 0, status: "absent" }),
      day({ workDate: "2026-08-04", hoursWorked: 0, status: "absent" }),
    ];
    const result = calculatePayroll({ employee: contractor, rule, days, daysInMonth: 31 });

    expect(result.basePay).toBe(250_000);
    expect(result.net).toBe(250_000);
  });

  it("earns no overtime, however long the day", () => {
    const result = calculatePayroll({
      employee: contractor,
      rule,
      days: [day({ workDate: "2026-08-03", hoursWorked: 14 })],
      daysInMonth: 31,
    });

    expect(result.otPay).toBe(0);
    // The hours are still recorded, so the contractor's invoice can be checked
    // — capped at the daily ceiling like anyone else's, though nothing is paid
    // on them either way.
    expect(result.hours.overtime).toBe(4);
  });

  it("earns no Sunday overtime either", () => {
    const result = calculatePayroll({
      employee: contractor,
      rule,
      days: [day({ workDate: "2026-08-02", dayType: "off", hoursWorked: 12 })],
      daysInMonth: 31,
    });

    expect(result.otPay).toBe(0);
    expect(result.gross).toBe(250_000);
  });

  it("carries no late penalty, having no day to dock", () => {
    const tiers: LatePenaltyTier[] = [
      { label: "Over an hour", fromMinutes: 60, toMinutes: null, penaltyPercent: 50, basis: "day" },
    ];
    const result = calculatePayroll({
      employee: contractor,
      rule,
      days: [day({ workDate: "2026-08-03", minutesLate: 90 })],
      latePenaltyTiers: tiers,
      daysInMonth: 31,
    });

    expect(result.latePenalty).toBe(0);
    expect(result.net).toBe(250_000);
  });
});

describe("components", () => {
  const eobi: PayComponent = {
    code: "EOBI",
    label: "EOBI",
    kind: "deduction",
    calc: "fixed",
    amount: 370,
    percent: 0,
    sortOrder: 10,
  };

  const providentFund: PayComponent = {
    code: "PF",
    label: "Provident fund",
    kind: "deduction",
    calc: "percent",
    amount: 0,
    percent: 5,
    sortOrder: 20,
  };

  it("applies fixed and percentage deductions to gross", () => {
    const days = Array.from({ length: 5 }, (_, i) => day({ workDate: `2026-08-0${i + 3}` }));
    const result = calculatePayroll({
      employee: hourlyWorker,
      rule,
      days,
      components: [eobi, providentFund],
    });

    expect(result.gross).toBe(12_800);
    // 370 + 5% of 12800
    expect(result.deductions).toBe(370 + 640);
    expect(result.net).toBe(12_800 - 1010);
  });

  it("skips components scoped to the other pay class", () => {
    const hourlyOnly: PayComponent = { ...eobi, appliesTo: "hourly" };
    const totals = applyComponents([hourlyOnly], "monthly", 1000, 1000);
    expect(totals.deductions).toBe(0);
    expect(totals.lines).toHaveLength(0);
  });

  it("applies slab rates progressively", () => {
    const slabs = [
      { upto: 50_000, rate: 0 },
      { upto: 100_000, rate: 5 },
      { upto: null, rate: 10 },
    ];
    // 0 on first 50k, 5% on next 50k (2500), 10% on last 20k (2000)
    expect(evaluateSlabs(120_000, slabs)).toBe(4500);
    expect(evaluateSlabs(40_000, slabs)).toBe(0);
    expect(evaluateSlabs(75_000, slabs)).toBe(1250);
  });

  it("never lets a raise into a higher slab reduce take-home pay", () => {
    const slabs = [
      { upto: 100_000, rate: 5 },
      { upto: null, rate: 35 },
    ];
    const justBelow = 100_000 - evaluateSlabs(100_000, slabs);
    const justAbove = 100_100 - evaluateSlabs(100_100, slabs);
    expect(justAbove).toBeGreaterThan(justBelow);
  });
});

describe("late arrival penalties", () => {
  const tiers: LatePenaltyTier[] = [
    { label: "Late 15–30 min", fromMinutes: 15, toMinutes: 30, penaltyPercent: 5, basis: "day" },
    { label: "Late 30–60 min", fromMinutes: 30, toMinutes: 60, penaltyPercent: 10, basis: "day" },
    { label: "Late beyond 1h", fromMinutes: 60, toMinutes: null, penaltyPercent: 25, basis: "day" },
  ];

  // One contracted day for the hourly worker is 320 × 8 = ₨2,560.
  const dayPay = 320 * 8;

  it("does not penalise arriving on time", () => {
    const days = [day({ workDate: "2026-08-03", minutesLate: 0 })];
    const result = calculatePayroll({
      employee: hourlyWorker,
      rule,
      days,
      latePenaltyTiers: tiers,
    });
    expect(result.latePenalty).toBe(0);
    expect(result.daysLate).toBe(0);
  });

  it("does not penalise lateness below the first band", () => {
    const days = [day({ workDate: "2026-08-03", minutesLate: 10 })];
    const result = calculatePayroll({
      employee: hourlyWorker,
      rule,
      days,
      latePenaltyTiers: tiers,
    });
    expect(result.latePenalty).toBe(0);
  });

  it("applies the matching band only, never the sum of the bands below", () => {
    const days = [day({ workDate: "2026-08-03", minutesLate: 90 })];
    const result = calculatePayroll({
      employee: hourlyWorker,
      rule,
      days,
      latePenaltyTiers: tiers,
    });

    expect(result.latePenalty).toBe(roundTo2(dayPay * 0.25));
    expect(result.daysLate).toBe(1);
  });

  it("picks the correct band at each boundary", () => {
    const at = (minutesLate: number) =>
      calculatePayroll({
        employee: hourlyWorker,
        rule,
        days: [day({ workDate: "2026-08-03", minutesLate })],
        latePenaltyTiers: tiers,
      }).latePenalty;

    expect(at(14)).toBe(0);
    expect(at(15)).toBe(roundTo2(dayPay * 0.05));
    expect(at(29)).toBe(roundTo2(dayPay * 0.05));
    expect(at(30)).toBe(roundTo2(dayPay * 0.1));
    expect(at(59)).toBe(roundTo2(dayPay * 0.1));
    expect(at(60)).toBe(roundTo2(dayPay * 0.25));
  });

  it("accumulates across a month and reduces net pay", () => {
    const days = [
      day({ workDate: "2026-08-03", minutesLate: 20 }),
      day({ workDate: "2026-08-04", minutesLate: 45 }),
      day({ workDate: "2026-08-05", minutesLate: 0 }),
    ];
    const result = calculatePayroll({
      employee: hourlyWorker,
      rule,
      days,
      latePenaltyTiers: tiers,
    });

    expect(result.daysLate).toBe(2);
    expect(result.latePenalty).toBe(roundTo2(dayPay * 0.05 + dayPay * 0.1));
    expect(result.net).toBe(roundTo2(result.gross - result.deductions - result.tax));
    expect(result.deductions).toBeGreaterThanOrEqual(result.latePenalty);
  });

  it("supports a penalty expressed against monthly pay", () => {
    const monthlyTier: LatePenaltyTier[] = [
      { label: "Serious", fromMinutes: 60, toMinutes: null, penaltyPercent: 1, basis: "month" },
    ];
    const tracked = { ...monthlyStaff, requiresAttendance: true };
    const days = [day({ workDate: "2026-08-03", minutesLate: 120 })];

    const result = calculatePayroll({
      employee: tracked,
      rule,
      days,
      latePenaltyTiers: monthlyTier,
    });

    expect(result.latePenalty).toBe(roundTo2(180_000 * 0.01));
  });

  it("charges the contracted day, so working less does not shrink the penalty", () => {
    const full = calculatePayroll({
      employee: hourlyWorker,
      rule,
      days: [day({ workDate: "2026-08-03", hoursWorked: 8, minutesLate: 90 })],
      latePenaltyTiers: tiers,
    });
    const short = calculatePayroll({
      employee: hourlyWorker,
      rule,
      days: [day({ workDate: "2026-08-03", hoursWorked: 3, minutesLate: 90 })],
      latePenaltyTiers: tiers,
    });

    expect(short.latePenalty).toBe(full.latePenalty);
  });
});

describe("net pay can never go negative", () => {
  const statutory: PayComponent[] = [
    {
      code: "EOBI",
      label: "EOBI",
      kind: "deduction",
      calc: "fixed",
      amount: 370,
      percent: 0,
      sortOrder: 10,
    },
  ];

  it("takes nothing from a worker who earned nothing", () => {
    // A fixed statutory deduction against zero gross would otherwise produce a
    // payslip asking the worker to pay the factory.
    const days = [day({ workDate: "2026-08-03", hoursWorked: 0, status: "absent" })];
    const result = calculatePayroll({
      employee: hourlyWorker,
      rule,
      days,
      components: statutory,
    });

    expect(result.gross).toBe(0);
    expect(result.net).toBe(0);
    expect(result.deductions).toBe(0);
    expect(result.uncollectedDeductions).toBe(370);
  });

  it("collects only what the earnings can cover", () => {
    // One hour at ₨320 cannot absorb a ₨370 deduction.
    const days = [day({ workDate: "2026-08-03", hoursWorked: 1 })];
    const result = calculatePayroll({
      employee: hourlyWorker,
      rule,
      days,
      components: statutory,
    });

    expect(result.gross).toBe(320);
    expect(result.net).toBe(0);
    expect(result.deductions).toBe(320);
    expect(result.uncollectedDeductions).toBe(50);
  });

  it("waives tax before touching deductions", () => {
    // There is no income to tax, so tax gives way first.
    const withTax: PayComponent[] = [
      ...statutory,
      {
        code: "TAX",
        label: "Tax",
        kind: "tax",
        calc: "percent",
        amount: 0,
        percent: 50,
        sortOrder: 90,
      },
    ];
    const days = [day({ workDate: "2026-08-03", hoursWorked: 1 })];
    const result = calculatePayroll({ employee: hourlyWorker, rule, days, components: withTax });

    expect(result.tax).toBe(0);
    expect(result.net).toBe(0);
    expect(result.net).toBeGreaterThanOrEqual(0);
  });

  it("leaves a normal payslip untouched", () => {
    const days = Array.from({ length: 5 }, (_, i) => day({ workDate: `2026-08-0${i + 3}` }));
    const result = calculatePayroll({
      employee: hourlyWorker,
      rule,
      days,
      components: statutory,
    });

    expect(result.uncollectedDeductions).toBe(0);
    expect(result.deductions).toBe(370);
    expect(result.net).toBe(12_800 - 370);
  });

  it("never lets late penalties push pay below zero", () => {
    const harsh: LatePenaltyTier[] = [
      { label: "Severe", fromMinutes: 1, toMinutes: null, penaltyPercent: 100, basis: "day" },
    ];
    const days = [day({ workDate: "2026-08-03", hoursWorked: 1, minutesLate: 120 })];
    const result = calculatePayroll({
      employee: hourlyWorker,
      rule,
      days,
      components: statutory,
      latePenaltyTiers: harsh,
    });

    expect(result.net).toBe(0);
    expect(result.net).toBeGreaterThanOrEqual(0);
  });
});

describe("run totals", () => {
  it("sums a full run for the executive dashboards", () => {
    const days = Array.from({ length: 5 }, (_, i) => day({ workDate: `2026-08-0${i + 3}` }));
    const results = [
      calculatePayroll({ employee: hourlyWorker, rule, days }),
      calculatePayroll({ employee: monthlyStaff, rule, days: [] }),
    ];
    const totals = summarisePayroll(results);

    expect(totals.headcount).toBe(2);
    expect(totals.gross).toBe(12_800 + 180_000);
    expect(totals.net).toBe(totals.gross - totals.deductions - totals.tax);
  });

  it("accumulates mixed day types across a period", () => {
    const days = [
      day({ workDate: "2026-08-03", hoursWorked: 9 }),
      day({ workDate: "2026-08-04", hoursWorked: 8 }),
      day({ workDate: "2026-08-08", dayType: "weekend_working", hoursWorked: 6 }),
      day({ workDate: "2026-08-14", dayType: "holiday", hoursWorked: 4 }),
    ];
    const buckets = accumulateHours(days, rule);

    expect(buckets.regular).toBe(16);
    expect(buckets.overtime).toBe(1);
    expect(buckets.weekend).toBe(6);
    expect(buckets.holiday).toBe(4);
  });
});

function roundTo2(v: number): number {
  return Math.round(v * 100) / 100;
}
