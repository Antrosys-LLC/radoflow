/**
 * The three arrangements a person can be on, as one choice.
 *
 * `requires_attendance` and `payroll_exempt` are independent booleans, which is
 * right in the schema and wrong in a form: three of their four combinations are
 * real and the fourth ("no salary but keep attendance") is not something anyone
 * has asked for. One question with three answers cannot express the fourth.
 *
 * Pure, and deliberately not in `src/lib/pay/actions.ts`: that file is
 * `"use server"`, where every export must be an async server action.
 */

export type TrackingChoice = "tracked" | "salary_only" | "exempt";

export interface TrackingFlags {
  requires_attendance: boolean;
  payroll_exempt: boolean;
}

/**
 * Unknown and missing both fall through to `tracked`, never to `exempt`. A
 * form that failed to render the field must not quietly create someone who is
 * on no payroll and whose absence nobody notices.
 */
export function trackingFlags(value: string | null): TrackingFlags {
  switch (value) {
    case "exempt":
      return { requires_attendance: false, payroll_exempt: true };
    case "salary_only":
      return { requires_attendance: false, payroll_exempt: false };
    default:
      return { requires_attendance: true, payroll_exempt: false };
  }
}

/** The inverse, for setting a form's default from an existing row. */
export function trackingValueOf(flags: TrackingFlags): TrackingChoice {
  if (flags.payroll_exempt) return "exempt";
  return flags.requires_attendance ? "tracked" : "salary_only";
}
