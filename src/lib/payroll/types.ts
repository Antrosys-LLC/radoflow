/**
 * Payroll domain types.
 *
 * These mirror the database enums but stay independent of any Supabase client
 * so the calculation engine can be unit-tested without a connection.
 */

export type PayClass = "monthly" | "hourly";

/**
 * Contractors are paid an agreed amount and nothing is calculated for them:
 * no day proration, no overtime, no late penalty.
 */
export type WorkerType = "employee" | "contractor";

/**
 * Whether Sunday is expected of someone.
 *
 * It never affects the rate. By default Sunday is not a working day for
 * anyone, so every hour worked on one is overtime regardless — unless the
 * calendar has explicitly overridden that specific Sunday to another day
 * type (the factory ran it as an ordinary shift and gave a different weekday
 * off in exchange), in which case it is priced like any other day of that
 * type instead. See {@link splitDayHours} in `./hours.ts`. `compulsory` only
 * marks a missed default Sunday as a violation — the money is already lost
 * with the overtime.
 */
export type SundayPolicy = "off" | "optional" | "compulsory" | "adjust_in_leave";

export type DayType =
  /** Normal working day. */
  | "workday"
  /** Non-working: weekend or a declared shutdown. */
  | "off"
  /** Declared public or company holiday. */
  | "holiday"
  /** A normally-off day switched on — paid at the weekend multiplier. */
  | "weekend_working"
  /** A declared-off day switched back on — paid at the weekend multiplier. */
  | "special_working";

export type AttendanceStatus =
  "present" | "absent" | "leave" | "holiday" | "off" | "partial" | "pending";

/**
 * Effective-dated rate configuration for one site.
 *
 * Premium rates are absolute rupees per hour, not multiples of the base wage.
 * A multiplier chains overtime to basic pay, so a raise silently inflates
 * every premium and the two can never be negotiated apart.
 */
export interface PayRule {
  standardHoursPerDay: number;
  /**
   * @deprecated Monthly pay divides by the real length of the month, not by a
   * fixed figure. Kept because the column still exists and hourly rules read
   * it; it no longer influences base pay, overtime, or late penalties.
   */
  standardDaysPerMonth: number;
  /** Rupees per overtime hour. */
  otHourlyRate: number;
  /** Rupees per hour on an activated weekend or off-day shift. */
  weekendHourlyRate: number;
  /** Rupees per hour on a declared holiday. */
  holidayHourlyRate: number;
  /** Rupees per hour for night-shift work. */
  nightHourlyRate: number;
  lateGraceMinutes: number;
  /** Overtime below this many minutes in a day is not paid as overtime. */
  otThresholdMinutes: number;
  /**
   * Most overtime hours payable on one working day.
   *
   * Sundays are deliberately exempt: every hour of a Sunday is overtime, and a
   * Sunday shift is the whole reason someone gave up the day. Zero disables
   * weekday overtime entirely.
   */
  otDailyCapHours: number;
  /** Worked time is rounded to this granularity. */
  roundToMinutes: number;
}

export const DEFAULT_PAY_RULE: PayRule = {
  standardHoursPerDay: 8,
  standardDaysPerMonth: 26,
  otHourlyRate: 480,
  weekendHourlyRate: 640,
  holidayHourlyRate: 700,
  nightHourlyRate: 400,
  lateGraceMinutes: 10,
  otThresholdMinutes: 30,
  otDailyCapHours: 4,
  roundToMinutes: 15,
};

/**
 * One band of the late-arrival penalty ladder.
 *
 * `basis` is explicit because "deduct 10% of salary" is ambiguous: 10% of a
 * day's pay and 10% of a month's differ by a factor of twenty-six.
 */
export interface LatePenaltyTier {
  label: string;
  /** Inclusive lower bound, in minutes late past the grace period. */
  fromMinutes: number;
  /** Exclusive upper bound; null means "and beyond". */
  toMinutes: number | null;
  penaltyPercent: number;
  /**
   * What the percentage is taken of.
   *
   * `minute` is the exception: it charges one minute of pay per minute late,
   * so `penaltyPercent` is 100 and means "all of one minute's wage".
   */
  basis: "day" | "month" | "minute";
}

/** One person's attendance for one calendar date. */
export interface AttendanceDay {
  workDate: string;
  dayType: DayType;
  /** Total clocked hours for the day, before any bucketing. */
  hoursWorked: number;
  status: AttendanceStatus;
  /**
   * A one-off rupees-per-hour rate for this date from the calendar, replacing
   * the site rule. Used when a specific weekend shift is agreed at its own
   * rate rather than the standing one.
   */
  overrideHourlyRate?: number | null;
  /** Minutes past shift start at first check-in, grace already deducted. */
  minutesLate?: number;
  /**
   * The clock-out was already floored to the half hour, so these hours must
   * not be rounded again. Rounding twice — down to the slot, then half-up to
   * the site's fifteen-minute step — hands back some of what the floor took.
   */
  hoursAreFinal?: boolean;
}

/** Worked time split into the buckets that are paid at different rates. */
export interface HourBuckets {
  regular: number;
  overtime: number;
  weekend: number;
  holiday: number;
}

export interface Employee {
  id: string;
  fullName: string;
  employeeCode: string;
  payClass: PayClass;
  /**
   * Whether payroll expects clock-in data. Monthly staff usually do not clock
   * in, but this is set per person rather than derived from payClass.
   */
  requiresAttendance: boolean;
  /**
   * For an employee, the monthly figure their daily rate is derived from. For
   * a contractor, the agreed amount paid flat.
   */
  monthlySalary: number;
  hourlyRate: number;
  /** Contractors are paid `monthlySalary` flat. Defaults to employee. */
  workerType?: WorkerType;
  /**
   * Hours this person's salary covers on a duty day. Work beyond it is
   * overtime; work below it is still one full working day. Defaults to the
   * site's standard day.
   */
  dutyHours?: number | null;
  /** Defaults to `off`. See {@link SundayPolicy}. */
  sundayPolicy?: SundayPolicy;
  /** False pays no overtime at all. Defaults to true. */
  overtimeEligible?: boolean;
  /** Negotiated premium rates. Null falls back to the site rule. */
  otHourlyRate?: number | null;
  weekendHourlyRate?: number | null;
  holidayHourlyRate?: number | null;
  departmentId?: string | null;
  siteId?: string | null;
}

export type ComponentKind = "earning" | "deduction" | "tax";
export type ComponentCalc = "fixed" | "percent" | "slab";

/** One bracket of a progressive slab table. */
export interface Slab {
  /** Upper bound of this bracket; null means "and above". */
  upto: number | null;
  /** Percentage applied to the portion of the base falling in this bracket. */
  rate: number;
}

export interface PayComponent {
  code: string;
  label: string;
  kind: ComponentKind;
  calc: ComponentCalc;
  amount: number;
  percent: number;
  slabs?: Slab[] | null;
  /** Restricts the component to one pay class; null applies to everyone. */
  appliesTo?: PayClass | null;
  sortOrder: number;
}

/** A single line on the payslip. */
export interface PayslipLine {
  code: string;
  label: string;
  kind: ComponentKind | "base";
  /** Hours behind this line, where the line is hours-driven. */
  hours?: number;
  rate?: number;
  amount: number;
}

/** The complete calculation for one person for one period. */
export interface PayrollResult {
  employeeId: string;
  payClass: PayClass;
  baseRate: number;

  hours: HourBuckets;
  daysPresent: number;
  daysAbsent: number;
  daysLeave: number;
  /**
   * Days that earned base pay: attended, and not a Sunday. Published so a
   * worker can check their own payslip by counting days on a calendar.
   */
  workingDays: number;
  /** What one day of the month was worth: salary ÷ calendar days. */
  dailyRate: number;

  basePay: number;
  otPay: number;
  weekendPay: number;
  holidayPay: number;
  allowances: number;

  /** Total deducted for late arrivals, already included in `deductions`. */
  latePenalty: number;
  daysLate: number;
  /**
   * Deductions that could not be taken because earnings did not cover them.
   * Net pay is floored at zero rather than going negative.
   */
  uncollectedDeductions: number;

  /**
   * Hours the overtime ceiling is dropping across the period — see
   * {@link excessHours} in `./hours.ts`. Zero for the common case. A
   * non-zero total does not mean anything was calculated wrong; it means a
   * human should look at the listed dates before the run is approved,
   * because the engine cannot tell a very long single shift from an
   * unrecorded second one.
   */
  flaggedHours: number;
  flaggedDays: { workDate: string; hours: number }[];

  gross: number;
  deductions: number;
  tax: number;
  net: number;

  lines: PayslipLine[];
}
