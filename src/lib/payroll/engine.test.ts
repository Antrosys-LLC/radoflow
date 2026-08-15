import { describe, expect, it } from "vitest";

import { applyComponents, evaluateSlabs } from "./components";
import { calculatePayroll, summarisePayroll } from "./engine";
import { accumulateHours, derivedHourlyRate, roundHours, splitDayHours } from "./hours";
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

  it("derives a monthly employee's hourly rate from the contracted month", () => {
    // 180000 / (26 days * 8h) = 865.38
    expect(derivedHourlyRate(180_000, rule)).toBe(865.38);
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

  it("prorates absence when the person is flagged as requiring attendance", () => {
    const tracked: Employee = { ...monthlyStaff, requiresAttendance: true };
    const days = [
      day({ workDate: "2026-08-03", hoursWorked: 0, status: "absent" }),
      day({ workDate: "2026-08-04", hoursWorked: 0, status: "absent" }),
    ];
    const result = calculatePayroll({ employee: tracked, rule, days });

    // 180000 / 26 = 6923.08 per day, two days unpaid.
    expect(result.basePay).toBe(180_000 - 6923.08 * 2);
  });

  it("does not dock pay for approved leave", () => {
    const tracked: Employee = { ...monthlyStaff, requiresAttendance: true };
    const days = [day({ workDate: "2026-08-03", hoursWorked: 0, status: "leave" })];
    const result = calculatePayroll({ employee: tracked, rule, days });

    expect(result.basePay).toBe(180_000);
    expect(result.daysLeave).toBe(1);
  });

  it("still pays a monthly supervisor for a weekend shift", () => {
    const days = [day({ workDate: "2026-08-08", dayType: "weekend_working", hoursWorked: 8 })];
    const result = calculatePayroll({ employee: monthlyStaff, rule, days });

    // Premium hours pay the flat weekend rate regardless of pay class.
    expect(result.weekendPay).toBe(8 * 640);
    expect(result.gross).toBe(180_000 + 5120);
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
    const result = calculatePayroll({ employee: hourlyWorker, rule, days, latePenaltyTiers: tiers });
    expect(result.latePenalty).toBe(0);
    expect(result.daysLate).toBe(0);
  });

  it("does not penalise lateness below the first band", () => {
    const days = [day({ workDate: "2026-08-03", minutesLate: 10 })];
    const result = calculatePayroll({ employee: hourlyWorker, rule, days, latePenaltyTiers: tiers });
    expect(result.latePenalty).toBe(0);
  });

  it("applies the matching band only, never the sum of the bands below", () => {
    const days = [day({ workDate: "2026-08-03", minutesLate: 90 })];
    const result = calculatePayroll({ employee: hourlyWorker, rule, days, latePenaltyTiers: tiers });

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
    const result = calculatePayroll({ employee: hourlyWorker, rule, days, latePenaltyTiers: tiers });

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
      { code: "TAX", label: "Tax", kind: "tax", calc: "percent", amount: 0, percent: 50, sortOrder: 90 },
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
