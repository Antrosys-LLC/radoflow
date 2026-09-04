import { describe, expect, it } from "vitest";

import { calculateLatePenalties, findTier } from "./late";
import type { AttendanceDay, LatePenaltyTier } from "./types";

const perMinute: LatePenaltyTier = {
  label: "Late arrival — per minute",
  fromMinutes: 0,
  toMinutes: null,
  penaltyPercent: 100,
  basis: "minute",
};

function day(workDate: string, minutesLate: number): AttendanceDay {
  return { workDate, dayType: "workday", hoursWorked: 8, status: "present", minutesLate };
}

describe("per-minute late penalties", () => {
  /*
   * A ₨1,200 day over eight duty hours is ₨150 an hour, ₨2.50 a minute.
   * `minutesLate` already has the shift's grace subtracted, so five here is
   * what a twenty-minute arrival against a fifteen-minute margin looks like.
   */
  it("charges a minute of pay for a minute of lateness", () => {
    const result = calculateLatePenalties([day("2026-08-03", 5)], [perMinute], 1200, 40_000, 8);

    expect(result.total).toBe(12.5);
    expect(result.daysLate).toBe(1);
  });

  it("charges nothing inside the grace period", () => {
    // minutesLate is zero for anyone who arrived within the margin.
    const result = calculateLatePenalties([day("2026-08-03", 0)], [perMinute], 1200, 40_000, 8);

    expect(result.total).toBe(0);
    expect(result.daysLate).toBe(0);
    expect(result.lines).toEqual([]);
  });

  it("divides by the person's own duty hours, not a fixed eight", () => {
    // A guard's ₨1,200 covers twelve hours: ₨100 an hour, ₨1.666 a minute.
    const result = calculateLatePenalties([day("2026-08-03", 6)], [perMinute], 1200, 40_000, 12);

    expect(result.total).toBe(10);
  });

  it("sums a month of small latenesses into one payslip line", () => {
    const result = calculateLatePenalties(
      [day("2026-08-03", 5), day("2026-08-04", 10), day("2026-08-05", 3)],
      [perMinute],
      1200,
      40_000,
      8,
    );

    expect(result.total).toBe(45);
    expect(result.daysLate).toBe(3);
    expect(result.lines).toHaveLength(1);
    expect(result.lines[0]?.label).toBe("Late arrival — per minute (3 days, 18 minutes)");
  });

  it("never applies to someone who keeps no in time", () => {
    // Flexible-hours staff never have minutes_late written, so no tier matches.
    const result = calculateLatePenalties([day("2026-08-03", 0)], [perMinute], 1200, 40_000, 8);
    expect(result.total).toBe(0);
  });
});

describe("percentage tiers still work", () => {
  const halfDay: LatePenaltyTier = {
    label: "Over two hours",
    fromMinutes: 120,
    toMinutes: null,
    penaltyPercent: 50,
    basis: "day",
  };

  it("charges a share of the day", () => {
    const result = calculateLatePenalties([day("2026-08-03", 150)], [halfDay], 1200, 40_000, 8);
    expect(result.total).toBe(600);
  });

  it("prefers the narrowest matching band", () => {
    const narrow: LatePenaltyTier = { ...halfDay, label: "Two to three hours", toMinutes: 180 };
    expect(findTier(150, [halfDay, narrow])?.label).toBe("Two to three hours");
  });
});
