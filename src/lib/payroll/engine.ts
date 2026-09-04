import { applyComponents } from "./components";
import {
  accumulateHours,
  countWorkingDays,
  dailyRate as dailyRateOf,
  daysInMonthOf,
  excessHours,
  overtimeRate,
  roundMoney,
  splitDayHours,
  type DutyTerms,
} from "./hours";
import { calculateLatePenalties } from "./late";
import type {
  AttendanceDay,
  Employee,
  HourBuckets,
  LatePenaltyTier,
  PayComponent,
  PayRule,
  PayrollResult,
  PayslipLine,
} from "./types";

export interface PayrollInput {
  employee: Employee;
  rule: PayRule;
  /** The employee's attendance for every date in the period. */
  days: readonly AttendanceDay[];
  /** Site-level and per-person earnings, deductions and taxes. */
  components?: readonly PayComponent[];
  /** Late-arrival penalty ladder in force for this person's shift. */
  latePenaltyTiers?: readonly LatePenaltyTier[];
  /**
   * Calendar days in the period's month — the divisor behind the daily rate.
   *
   * Optional because it can be read off the attendance itself, which is what
   * every caller but the payroll runner wants. The runner passes it explicitly
   * from the period, so a month where nobody attended still prices correctly.
   */
  daysInMonth?: number;
}

/**
 * The divisor for the daily rate: 28, 29, 30 or 31.
 *
 * Falls back to the month of the first attendance row, then to 30. A period
 * always sits inside one month, so the first row is as good as any.
 */
function resolveDaysInMonth(input: PayrollInput): number {
  if (input.daysInMonth && input.daysInMonth > 0) return input.daysInMonth;
  const first = input.days[0];
  return first ? daysInMonthOf(first.workDate) : 30;
}

interface DayCounts {
  present: number;
  absent: number;
  leave: number;
  /** Days the factory expected work — used to prorate monthly salary. */
  expected: number;
}

function countDays(days: readonly AttendanceDay[]): DayCounts {
  const counts: DayCounts = { present: 0, absent: 0, leave: 0, expected: 0 };

  for (const day of days) {
    const isWorkingDay =
      day.dayType === "workday" ||
      day.dayType === "special_working" ||
      day.dayType === "weekend_working";

    if (isWorkingDay) counts.expected += 1;

    switch (day.status) {
      case "present":
      case "partial":
        counts.present += 1;
        break;
      case "absent":
        counts.absent += 1;
        break;
      case "leave":
        counts.leave += 1;
        break;
      default:
        break;
    }
  }

  return counts;
}

/**
 * The rupee rate for a day, letting a one-off calendar rate beat the standing
 * one — e.g. a single Sunday shift agreed at a special rate.
 */
function rateFor(day: AttendanceDay, fallback: number): number {
  return day.overrideHourlyRate != null && day.overrideHourlyRate > 0
    ? day.overrideHourlyRate
    : fallback;
}

/**
 * Weekend and holiday pay is summed per day rather than from the period
 * totals, because each date may carry its own agreed rate.
 */
function premiumPay(
  days: readonly AttendanceDay[],
  rule: PayRule,
  weekendRate: number,
  holidayRate: number,
): { weekendPay: number; holidayPay: number } {
  let weekendPay = 0;
  let holidayPay = 0;

  for (const day of days) {
    const buckets = splitDayHours(day, rule);
    if (buckets.weekend > 0) {
      weekendPay += buckets.weekend * rateFor(day, weekendRate);
    }
    if (buckets.holiday > 0) {
      holidayPay += buckets.holiday * rateFor(day, holidayRate);
    }
  }

  return { weekendPay: roundMoney(weekendPay), holidayPay: roundMoney(holidayPay) };
}

/**
 * Every date in the period where the overtime ceiling is dropping hours.
 *
 * Computed once here, from the same `days` the rest of the engine already
 * walks, rather than asking a caller to run a second pass over attendance —
 * so a payroll run gets this for free alongside every other total.
 */
function flaggedDaysOf(
  days: readonly AttendanceDay[],
  rule: PayRule,
  dutyHours: number,
  terms: DutyTerms,
): { workDate: string; hours: number }[] {
  const flagged: { workDate: string; hours: number }[] = [];
  for (const day of days) {
    const hours = excessHours(day, rule, dutyHours, terms);
    if (hours > 0) flagged.push({ workDate: day.workDate, hours });
  }
  return flagged;
}

/**
 * Calculates one person's pay for one period.
 *
 * The two pay classes differ only in how base pay is derived:
 *  - hourly staff are paid for the hours the biometric terminal recorded;
 *  - monthly staff receive their contracted salary, prorated for unpaid
 *    absence only when they are flagged as requiring attendance.
 *
 * Overtime, weekend and holiday premiums work identically for both, so a
 * monthly supervisor who works a Sunday shift is still paid for it.
 */
export function calculatePayroll(input: PayrollInput): PayrollResult {
  const { employee, rule, days, components = [], latePenaltyTiers = [] } = input;

  /*
   * A contract firm is billed once for the whole department, so pricing one of
   * its people would double-charge whatever the firm agreed. An exempt person
   * draws nothing here at all. Both are filtered out in `run.ts`; throwing
   * rather than returning an empty result means a future caller that forgets
   * cannot quietly produce a payslip that should not exist.
   */
  if (employee.workerType === "contractor") {
    throw new Error(
      `${employee.fullName} is a contractor — their firm is billed through payroll_contract_items, not priced per person.`,
    );
  }
  if (employee.payrollExempt) {
    throw new Error(`${employee.fullName} is exempt from payroll and must not be priced.`);
  }

  const dutyHours = employee.dutyHours ?? rule.standardHoursPerDay;

  const terms = {
    overtimeEligible: employee.overtimeEligible ?? true,
    sundayPolicy: employee.sundayPolicy ?? ("off" as const),
  };

  const hours: HourBuckets = accumulateHours(days, rule, dutyHours, terms);
  const counts = countDays(days);
  const workingDays = countWorkingDays(days);
  const flaggedDays = flaggedDaysOf(days, rule, dutyHours, terms);
  const flaggedHours = roundMoney(flaggedDays.reduce((total, d) => total + d.hours, 0));
  const lines: PayslipLine[] = [];

  const daysInMonth = resolveDaysInMonth(input);
  const perDay = dailyRateOf(employee.monthlySalary, daysInMonth);

  const isMonthly = employee.payClass === "monthly";
  const hourlyRate = isMonthly
    ? overtimeRate(employee.monthlySalary, daysInMonth)
    : employee.hourlyRate;

  // ---- Base pay -----------------------------------------------------------
  let basePay: number;

  if (isMonthly) {
    if (!employee.requiresAttendance) {
      // Not tracked by the terminal: the contracted salary is paid in full.
      basePay = roundMoney(employee.monthlySalary);
      lines.push({
        code: "BASIC",
        label: "Monthly salary",
        kind: "base",
        amount: basePay,
      });
    } else {
      /*
       * Pay is built up from the days worked rather than docked down from the
       * salary. Absence is not a deduction — it is simply a day that was never
       * earned — so the payslip shows one multiplication a worker can check
       * against a calendar, instead of a full salary followed by a clawback.
       */
      basePay = roundMoney(perDay * workingDays);
      lines.push({
        code: "BASIC",
        label: `Salary for ${workingDays} working day${workingDays === 1 ? "" : "s"}`,
        kind: "base",
        rate: perDay,
        amount: basePay,
      });
    }
  } else {
    basePay = roundMoney(hours.regular * hourlyRate);
    lines.push({
      code: "REGULAR",
      label: "Regular hours",
      kind: "base",
      hours: hours.regular,
      rate: hourlyRate,
      amount: basePay,
    });
  }

  // ---- Premiums -----------------------------------------------------------
  // Each premium is an absolute rupee rate: the employee's negotiated figure
  // when set, otherwise the site default.
  /*
   * Monthly staff take an overtime rate derived from their own salary — a
   * calendar day divided by eight. Hourly staff keep the negotiated flat rate,
   * since they have no monthly figure to derive one from.
   */
  const otRate = isMonthly
    ? (employee.otHourlyRate ?? overtimeRate(employee.monthlySalary, daysInMonth))
    : (employee.otHourlyRate ?? rule.otHourlyRate);
  const weekendRate = employee.weekendHourlyRate ?? rule.weekendHourlyRate;
  const holidayRate = employee.holidayHourlyRate ?? rule.holidayHourlyRate;

  const otPay = roundMoney(hours.overtime * otRate);
  if (otPay > 0) {
    lines.push({
      code: "OT",
      label: "Overtime",
      kind: "earning",
      hours: hours.overtime,
      rate: otRate,
      amount: otPay,
    });
  }

  const { weekendPay, holidayPay } = premiumPay(days, rule, weekendRate, holidayRate);
  if (weekendPay > 0) {
    lines.push({
      code: "WEEKEND",
      label: "Weekend / off-day shift",
      kind: "earning",
      hours: hours.weekend,
      rate: weekendRate,
      amount: weekendPay,
    });
  }
  if (holidayPay > 0) {
    lines.push({
      code: "HOLIDAY",
      label: "Holiday shift",
      kind: "earning",
      hours: hours.holiday,
      rate: holidayRate,
      amount: holidayPay,
    });
  }

  // ---- Late arrivals ------------------------------------------------------
  // Based on the contracted day, not on what they actually earned, so a
  // worker cannot shrink the penalty by also working less.
  const dayRate = isMonthly ? perDay : roundMoney(employee.hourlyRate * rule.standardHoursPerDay);

  const late = calculateLatePenalties(
    days,
    latePenaltyTiers,
    dayRate,
    employee.monthlySalary,
    dutyHours,
  );
  lines.push(...late.lines);

  // ---- Components ---------------------------------------------------------
  const earningsBase = basePay;
  const preComponentGross = roundMoney(basePay + otPay + weekendPay + holidayPay);

  const evaluated = applyComponents(components, employee.payClass, earningsBase, preComponentGross);

  const gross = roundMoney(preComponentGross + evaluated.earnings);

  // Absence proration is already reflected in basePay; that line is
  // informational, so it must not be double-counted here. Late penalties are
  // real deductions and do count.
  const rawDeductions = roundMoney(evaluated.deductions + late.total);
  const rawTax = evaluated.tax;

  /*
   * Nothing can be taken from pay that was never earned.
   *
   * A worker with no hours still attracts fixed statutory deductions, which
   * would otherwise produce a negative payslip — the system asking a worker to
   * pay the factory. Withholding is capped at gross, tax first (there is no
   * income to tax), then the deductions. Whatever could not be collected is
   * reported rather than silently discarded, so it can be carried or waived
   * as a deliberate decision.
   */
  let tax = rawTax;
  let deductions = rawDeductions;
  let over = roundMoney(rawDeductions + rawTax - gross);

  if (over > 0) {
    const taxRelief = Math.min(tax, over);
    tax = roundMoney(tax - taxRelief);
    over = roundMoney(over - taxRelief);

    if (over > 0) deductions = roundMoney(Math.max(0, deductions - over));
  }

  const uncollected = roundMoney(rawDeductions + rawTax - deductions - tax);
  if (uncollected > 0) {
    lines.push({
      code: "UNCOLLECTED",
      label: "Deductions not taken — earnings too low to cover them",
      kind: "deduction",
      amount: 0,
    });
  }

  const net = roundMoney(gross - deductions - tax);

  lines.push(...evaluated.lines);

  return {
    employeeId: employee.id,
    payClass: employee.payClass,
    baseRate: hourlyRate,

    hours,
    daysPresent: counts.present,
    daysAbsent: counts.absent,
    daysLeave: counts.leave,
    workingDays,
    dailyRate: perDay,

    basePay,
    otPay,
    weekendPay,
    holidayPay,
    allowances: evaluated.earnings,

    latePenalty: late.total,
    daysLate: late.daysLate,
    uncollectedDeductions: uncollected,

    flaggedHours,
    flaggedDays,

    gross,
    deductions,
    tax,
    net,

    lines,
  };
}

export interface PayrollRunTotals {
  headcount: number;
  gross: number;
  deductions: number;
  tax: number;
  net: number;
}

/** Rolls individual results up into the totals shown on the C-level panels. */
export function summarisePayroll(results: readonly PayrollResult[]): PayrollRunTotals {
  return results.reduce<PayrollRunTotals>(
    (total, r) => ({
      headcount: total.headcount + 1,
      gross: roundMoney(total.gross + r.gross),
      deductions: roundMoney(total.deductions + r.deductions),
      tax: roundMoney(total.tax + r.tax),
      net: roundMoney(total.net + r.net),
    }),
    { headcount: 0, gross: 0, deductions: 0, tax: 0, net: 0 },
  );
}
