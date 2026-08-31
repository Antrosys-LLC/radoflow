import { describe, expect, it } from "vitest";

import {
  computeDayFromPunches,
  minutesLateAgainstShift,
  toDateKey,
  workDateFor,
  type RawPunch,
} from "./compute";

function at(hour: number, minute = 0, direction: RawPunch["direction"] = "unknown"): RawPunch {
  return { punchedAt: new Date(2026, 7, 14, hour, minute, 0), direction };
}

describe("pairing punches", () => {
  it("pairs a simple in/out day", () => {
    const day = computeDayFromPunches([at(8, 0, "in"), at(17, 0, "out")], "workday");

    expect(day.hoursWorked).toBe(9);
    expect(day.status).toBe("present");
    expect(day.anomaly).toBeNull();
  });

  it("excludes an unpaid lunch break between punch pairs", () => {
    const day = computeDayFromPunches(
      [at(8, 0, "in"), at(12, 0, "out"), at(13, 0, "in"), at(17, 0, "out")],
      "workday",
    );

    expect(day.hoursWorked).toBe(8);
    expect(day.firstIn?.getHours()).toBe(8);
    expect(day.lastOut?.getHours()).toBe(17);
  });

  it("alternates when the terminal reports no direction", () => {
    const day = computeDayFromPunches([at(8), at(12), at(13), at(17)], "workday");
    expect(day.hoursWorked).toBe(8);
    expect(day.anomaly).toBeNull();
  });

  it("alternates when the terminal stamps every punch as 'in'", () => {
    // Observed on a real K50 with no dedicated in/out keys: every record
    // carries state 0. Trusting that would pair nothing and pay zero hours.
    const day = computeDayFromPunches(
      [at(8, 0, "in"), at(12, 0, "in"), at(13, 0, "in"), at(17, 0, "in")],
      "workday",
    );
    expect(day.hoursWorked).toBe(8);
  });

  it("alternates when every punch is stamped 'out'", () => {
    const day = computeDayFromPunches([at(8, 0, "out"), at(16, 0, "out")], "workday");
    expect(day.hoursWorked).toBe(8);
  });

  it("flags a day with a single punch instead of guessing the shift length", () => {
    const day = computeDayFromPunches([at(8, 0, "in")], "workday");

    expect(day.hoursWorked).toBe(0);
    expect(day.status).toBe("partial");
    expect(day.anomaly).toMatch(/missing clock-out/i);
  });

  it("flags an odd number of undirected punches", () => {
    const day = computeDayFromPunches([at(8), at(12), at(13)], "workday");

    expect(day.hoursWorked).toBe(4);
    expect(day.anomaly).toMatch(/odd number/i);
  });

  it("reports an unpaired punch when someone forgets to clock out", () => {
    const day = computeDayFromPunches(
      [at(8, 0, "in"), at(12, 0, "out"), at(13, 0, "in")],
      "workday",
    );

    expect(day.hoursWorked).toBe(4);
    expect(day.anomaly).toMatch(/unpaired/i);
  });

  it("treats a double clock-in as one arrival", () => {
    const day = computeDayFromPunches(
      [at(8, 0, "in"), at(8, 1, "in"), at(17, 0, "out")],
      "workday",
    );
    // Pairs the later "in" with the "out": 8h59m.
    expect(day.hoursWorked).toBeCloseTo(8.98, 1);
  });

  it("sorts punches that arrive out of order after a network drop", () => {
    const day = computeDayFromPunches([at(17, 0, "out"), at(8, 0, "in")], "workday");
    expect(day.hoursWorked).toBe(9);
  });
});

describe("days without punches", () => {
  it("marks an hourly worker absent on a working day", () => {
    expect(computeDayFromPunches([], "workday").status).toBe("absent");
  });

  it("does not mark monthly staff absent when attendance is not required", () => {
    const day = computeDayFromPunches([], "workday", { requiresAttendance: false });
    expect(day.status).toBe("present");
  });

  it("marks a shutdown day as off, not absent", () => {
    expect(computeDayFromPunches([], "off").status).toBe("off");
    expect(computeDayFromPunches([], "holiday").status).toBe("holiday");
  });

  it("still records hours when someone works an activated weekend", () => {
    const day = computeDayFromPunches([at(8, 0, "in"), at(16, 0, "out")], "weekend_working");
    expect(day.hoursWorked).toBe(8);
    expect(day.status).toBe("present");
  });
});

describe("lateness against a shift", () => {
  const shiftStart = new Date(2026, 7, 14, 6, 0, 0); // 06:00 shift

  it("counts an on-time arrival as zero", () => {
    expect(minutesLateAgainstShift(new Date(2026, 7, 14, 5, 55), shiftStart, 10)).toBe(0);
    expect(minutesLateAgainstShift(new Date(2026, 7, 14, 6, 0), shiftStart, 10)).toBe(0);
  });

  it("treats arrival inside the grace period as exactly zero, not slightly late", () => {
    // Otherwise a worker 9 minutes late would sit at 9 and could trip a band.
    expect(minutesLateAgainstShift(new Date(2026, 7, 14, 6, 9), shiftStart, 10)).toBe(0);
    expect(minutesLateAgainstShift(new Date(2026, 7, 14, 6, 10), shiftStart, 10)).toBe(0);
  });

  it("measures from the end of the grace period", () => {
    // 06:25 with 10 minutes grace is 15 minutes late, not 25.
    expect(minutesLateAgainstShift(new Date(2026, 7, 14, 6, 25), shiftStart, 10)).toBe(15);
    expect(minutesLateAgainstShift(new Date(2026, 7, 14, 8, 10), shiftStart, 10)).toBe(120);
  });

  it("ignores seconds rather than rounding a worker up a band", () => {
    expect(minutesLateAgainstShift(new Date(2026, 7, 14, 6, 25, 59), shiftStart, 10)).toBe(15);
  });
});

describe("night shifts", () => {
  it("credits an early-hours punch to the previous day", () => {
    const clockOut = new Date(2026, 7, 15, 4, 0, 0);
    expect(workDateFor(clockOut)).toBe("2026-08-14");
  });

  it("leaves a normal morning punch on its own day", () => {
    expect(workDateFor(new Date(2026, 7, 15, 8, 0, 0))).toBe("2026-08-15");
  });

  it("keeps a 06:00 punch on its own day under the conservative default", () => {
    // An early morning-shift arrival must not be mistaken for a night-shift
    // clock-out; sites that finish night shifts later raise the cutoff instead.
    expect(workDateFor(new Date(2026, 7, 15, 6, 0, 0))).toBe("2026-08-15");
    expect(workDateFor(new Date(2026, 7, 15, 6, 0, 0), 7)).toBe("2026-08-14");
  });

  it("formats date keys without timezone drift", () => {
    expect(toDateKey(new Date(2026, 0, 5))).toBe("2026-01-05");
  });
});
