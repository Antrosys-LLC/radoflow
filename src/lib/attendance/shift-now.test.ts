import { describe, expect, it } from "vitest";

import { runningShift, type ShiftClock } from "./shift-now";

const day: ShiftClock = {
  id: "day",
  code: "DAY",
  name: "Day",
  startsAt: "08:00:00",
  endsAt: "16:00:00",
  overtimeUntil: "20:00:00",
  graceMinutes: 15,
};

const night: ShiftClock = {
  id: "night",
  code: "NIGHT",
  name: "Night",
  startsAt: "20:00:00",
  endsAt: "04:00:00",
  overtimeUntil: "08:00:00",
  graceMinutes: 15,
};

const shifts = [day, night];

describe("the shift running now", () => {
  it("is the day shift through the morning, on today's date", () => {
    expect(runningShift(shifts, "2026-09-14", "10:30")).toMatchObject({
      shift: { code: "DAY" },
      workDate: "2026-09-14",
      minutesIn: 150,
      inOvertime: false,
    });
  });

  it("is the day shift's overtime between four and eight", () => {
    expect(runningShift(shifts, "2026-09-14", "17:00")).toMatchObject({
      shift: { code: "DAY" },
      inOvertime: true,
    });
  });

  it("hands over to the night shift at eight in the evening", () => {
    expect(runningShift(shifts, "2026-09-14", "20:00")).toMatchObject({
      shift: { code: "NIGHT" },
      workDate: "2026-09-14",
      inOvertime: false,
    });
  });

  it("keeps a night shift after midnight on the night it started", () => {
    expect(runningShift(shifts, "2026-09-15", "02:00")).toMatchObject({
      shift: { code: "NIGHT" },
      workDate: "2026-09-14",
      inOvertime: false,
    });
    expect(runningShift(shifts, "2026-09-15", "06:00")).toMatchObject({
      shift: { code: "NIGHT" },
      workDate: "2026-09-14",
      inOvertime: true,
    });
  });

  it("finds nothing when no shift covers the hour", () => {
    expect(runningShift([day], "2026-09-14", "22:00")).toBeNull();
  });
});
