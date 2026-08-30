import { describe, expect, it } from "vitest";

import { detectPayrollAnomalies, type AnomalyInput } from "./anomalies";

function person(partial: Partial<AnomalyInput> & { profileId: string }): AnomalyInput {
  return {
    fullName: "Test Person",
    netThisPeriod: 30_000,
    flaggedHours: 0,
    flaggedDays: [],
    attendanceNotes: [],
    trailingNet: [],
    ...partial,
  };
}

describe("detectPayrollAnomalies", () => {
  it("flags nobody when there is nothing unusual", () => {
    const result = detectPayrollAnomalies([person({ profileId: "p1" })]);
    expect(result).toEqual([]);
  });

  it("flags dropped hours from the overtime ceiling", () => {
    const result = detectPayrollAnomalies([
      person({
        profileId: "p1",
        flaggedHours: 12,
        flaggedDays: [{ workDate: "2026-08-10", hours: 12 }],
      }),
    ]);
    expect(result).toHaveLength(1);
    expect(result[0]?.reasons).toEqual(["dropped_hours"]);
  });

  it("flags an attendance punch-pairing anomaly", () => {
    const result = detectPayrollAnomalies([
      person({
        profileId: "p1",
        attendanceNotes: [{ workDate: "2026-08-11", note: "Only one punch recorded" }],
      }),
    ]);
    expect(result).toHaveLength(1);
    expect(result[0]?.reasons).toEqual(["attendance_note"]);
  });

  it("does not flag a pay swing with no trailing history", () => {
    // A first-ever payroll run has nothing to compare against — never an outlier.
    const result = detectPayrollAnomalies([person({ profileId: "p1", netThisPeriod: 90_000 })]);
    expect(result).toEqual([]);
  });

  it("flags a large upward swing against trailing history", () => {
    const result = detectPayrollAnomalies([
      person({ profileId: "p1", netThisPeriod: 60_000, trailingNet: [30_000, 32_000, 29_000] }),
    ]);
    expect(result).toHaveLength(1);
    expect(result[0]?.reasons).toEqual(["pay_outlier"]);
    expect(result[0]?.averageTrailingNet).toBe(30_333.33);
    expect(result[0]?.percentDeviation).toBeGreaterThan(30);
  });

  it("flags a large downward swing too", () => {
    const result = detectPayrollAnomalies([
      person({ profileId: "p1", netThisPeriod: 10_000, trailingNet: [30_000, 30_000] }),
    ]);
    expect(result[0]?.reasons).toEqual(["pay_outlier"]);
    expect(result[0]?.percentDeviation).toBeLessThan(0);
  });

  it("ignores a swing below the percentage threshold", () => {
    const result = detectPayrollAnomalies([
      person({ profileId: "p1", netThisPeriod: 33_000, trailingNet: [30_000, 30_000] }),
    ]);
    expect(result).toEqual([]);
  });

  it("ignores a swing below the rupee floor even if the percentage clears", () => {
    // 40% swing, but on a very small salary — not worth flagging.
    const result = detectPayrollAnomalies([
      person({ profileId: "p1", netThisPeriod: 1_400, trailingNet: [1_000] }),
    ]);
    expect(result).toEqual([]);
  });

  it("can flag someone for more than one reason at once", () => {
    const result = detectPayrollAnomalies([
      person({
        profileId: "p1",
        netThisPeriod: 60_000,
        flaggedHours: 8,
        flaggedDays: [{ workDate: "2026-08-10", hours: 8 }],
        attendanceNotes: [{ workDate: "2026-08-11", note: "Odd number of undirected punches" }],
        trailingNet: [30_000],
      }),
    ]);
    expect(result[0]?.reasons).toEqual(
      expect.arrayContaining(["dropped_hours", "attendance_note", "pay_outlier"]),
    );
    expect(result[0]?.reasons).toHaveLength(3);
  });

  it("only flags the people who actually meet a reason", () => {
    const result = detectPayrollAnomalies([
      person({ profileId: "ordinary" }),
      person({
        profileId: "flagged",
        flaggedHours: 4,
        flaggedDays: [{ workDate: "2026-08-10", hours: 4 }],
      }),
    ]);
    expect(result.map((r) => r.profileId)).toEqual(["flagged"]);
  });
});
