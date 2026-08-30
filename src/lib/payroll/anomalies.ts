import { roundMoney } from "./hours";

/**
 * Deciding *what needs a human's attention* before a payroll run is approved
 * — kept pure and separate from the money math in `engine.ts`, and separate
 * from whatever explains the finding in plain language. This module only
 * decides yes/no and hands back the numbers; nothing here calls an LLM or
 * touches the database, so it is exactly as testable as the rest of payroll.
 */

export interface AttendanceNote {
  workDate: string;
  note: string;
}

export interface AnomalyInput {
  profileId: string;
  fullName: string;
  netThisPeriod: number;
  /** From PayrollResult.flaggedHours — see excessHours() in ./hours.ts. */
  flaggedHours: number;
  flaggedDays: { workDate: string; hours: number }[];
  /** Non-null attendance_days.note rows for this person within the period. */
  attendanceNotes: AttendanceNote[];
  /**
   * This person's net pay on their last few settled (approved or paid)
   * periods at the same site, most recent first. Empty for someone with no
   * settled history yet — never treated as an outlier on their first run.
   */
  trailingNet: number[];
}

export interface AnomalyCandidate {
  profileId: string;
  fullName: string;
  netThisPeriod: number;
  flaggedHours: number;
  flaggedDays: { workDate: string; hours: number }[];
  attendanceNotes: AttendanceNote[];
  /** Null when there isn't enough history to compare against. */
  averageTrailingNet: number | null;
  /** Positive means this period paid more than the trailing average. */
  percentDeviation: number | null;
  reasons: ("dropped_hours" | "attendance_note" | "pay_outlier")[];
}

export interface AnomalyThresholds {
  /** Minimum |deviation| from the trailing average to count as an outlier. */
  outlierPercent: number;
  /** Minimum rupee gap alongside outlierPercent — filters trivial swings for low earners. */
  outlierMinRupees: number;
}

export const DEFAULT_ANOMALY_THRESHOLDS: AnomalyThresholds = {
  outlierPercent: 0.3,
  outlierMinRupees: 2000,
};

/**
 * Picks out who is worth a second look before this payroll run is approved.
 *
 * Three independent reasons, any one of which qualifies someone:
 *  - hours the overtime ceiling dropped (a likely double-duty day)
 *  - a punch-pairing anomaly recorded against their attendance
 *  - net pay that swings hard against their own recent history
 *
 * None of these mean the number is wrong — they mean a person should glance
 * at it before signing off, which is the same human-in-the-loop pattern as
 * everywhere else money is calculated in this system.
 */
export function detectPayrollAnomalies(
  people: readonly AnomalyInput[],
  thresholds: AnomalyThresholds = DEFAULT_ANOMALY_THRESHOLDS,
): AnomalyCandidate[] {
  const candidates: AnomalyCandidate[] = [];

  for (const person of people) {
    const reasons: AnomalyCandidate["reasons"] = [];

    if (person.flaggedHours > 0) reasons.push("dropped_hours");
    if (person.attendanceNotes.length > 0) reasons.push("attendance_note");

    let averageTrailingNet: number | null = null;
    let percentDeviation: number | null = null;

    if (person.trailingNet.length > 0) {
      averageTrailingNet = roundMoney(
        person.trailingNet.reduce((sum, n) => sum + n, 0) / person.trailingNet.length,
      );

      if (averageTrailingNet > 0) {
        const rupeeGap = Math.abs(person.netThisPeriod - averageTrailingNet);
        percentDeviation = roundMoney(
          ((person.netThisPeriod - averageTrailingNet) / averageTrailingNet) * 100,
        );

        if (
          Math.abs(percentDeviation) / 100 >= thresholds.outlierPercent &&
          rupeeGap >= thresholds.outlierMinRupees
        ) {
          reasons.push("pay_outlier");
        }
      }
    }

    if (reasons.length === 0) continue;

    candidates.push({
      profileId: person.profileId,
      fullName: person.fullName,
      netThisPeriod: person.netThisPeriod,
      flaggedHours: person.flaggedHours,
      flaggedDays: person.flaggedDays,
      attendanceNotes: person.attendanceNotes,
      averageTrailingNet,
      percentDeviation,
      reasons,
    });
  }

  return candidates;
}
