import { describe, expect, it } from "vitest";

import {
  liveWorkDate,
  personalWorkDate,
  previousDay,
  runningShift,
  type ShiftClock,
} from "./shift-now";

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

describe("the date somebody's own day is on", () => {
  it("keeps a night worker on last night until overtime ends", () => {
    expect(personalWorkDate(night, "2026-09-15", "00:00", false)).toBe("2026-09-14");
    expect(personalWorkDate(night, "2026-09-15", "02:00", false)).toBe("2026-09-14");
    expect(personalWorkDate(night, "2026-09-15", "07:59", false)).toBe("2026-09-14");
  });

  it("moves a night worker to today at eight once last night is closed", () => {
    expect(personalWorkDate(night, "2026-09-15", "08:00", false)).toBe("2026-09-15");
    expect(personalWorkDate(night, "2026-09-15", "09:30", false)).toBe("2026-09-15");
  });

  it("holds last night until ten while its check-in is still open", () => {
    expect(personalWorkDate(night, "2026-09-15", "08:00", true)).toBe("2026-09-14");
    expect(personalWorkDate(night, "2026-09-15", "09:59", true)).toBe("2026-09-14");
    expect(personalWorkDate(night, "2026-09-15", "10:00", true)).toBe("2026-09-15");
  });

  it("puts a night worker's evening on today's date", () => {
    expect(personalWorkDate(night, "2026-09-15", "19:00", false)).toBe("2026-09-15");
    expect(personalWorkDate(night, "2026-09-15", "20:30", true)).toBe("2026-09-15");
  });

  it("never moves the day shift, or somebody with no shift", () => {
    expect(personalWorkDate(day, "2026-09-15", "02:00", true)).toBe("2026-09-15");
    expect(personalWorkDate(day, "2026-09-15", "09:00", true)).toBe("2026-09-15");
    expect(personalWorkDate(null, "2026-09-15", "02:00", true)).toBe("2026-09-15");
  });

  it("uses the end of duty when a crossing shift has no overtime window", () => {
    const bare = { ...night, overtimeUntil: null };
    expect(personalWorkDate(bare, "2026-09-15", "03:00", false)).toBe("2026-09-14");
    expect(personalWorkDate(bare, "2026-09-15", "05:00", false)).toBe("2026-09-15");
  });

  it("crosses a month and a year boundary", () => {
    expect(personalWorkDate(night, "2026-10-01", "01:00", false)).toBe("2026-09-30");
    expect(previousDay("2027-01-01")).toBe("2026-12-31");
    expect(previousDay("2028-03-01")).toBe("2028-02-29");
  });
});

describe("the day somebody is on at this minute", () => {
  const at = (pakistan: string) => new Date(`${pakistan}+05:00`);

  it("follows an open check-in whatever the roster says", () => {
    // Rostered days, working nights: on the floor at 02:00 on last night's date.
    const days = [{ workDate: "2026-09-14", firstIn: "2026-09-14T20:00:00+05:00", lastOut: null }];
    expect(liveWorkDate(day, "2026-09-15", "02:00", days, at("2026-09-15T02:00"))).toBe(
      "2026-09-14",
    );
    expect(liveWorkDate(night, "2026-09-15", "08:15", days, at("2026-09-15T08:15"))).toBe(
      "2026-09-14",
    );
  });

  it("drops an open check-in once it is older than sixteen hours", () => {
    const days = [{ workDate: "2026-09-14", firstIn: "2026-09-14T20:00:00+05:00", lastOut: null }];
    // 15:59 after, still on the floor; a minute later it is a missed check-out.
    expect(liveWorkDate(night, "2026-09-15", "11:59", days, at("2026-09-15T11:59"))).toBe(
      "2026-09-14",
    );
    expect(liveWorkDate(night, "2026-09-15", "12:01", days, at("2026-09-15T12:01"))).toBe(
      "2026-09-15",
    );
  });

  it("takes the most recent open check-in when two are open", () => {
    const days = [
      { workDate: "2026-09-14", firstIn: "2026-09-14T20:00:00+05:00", lastOut: null },
      { workDate: "2026-09-15", firstIn: "2026-09-15T20:30:00+05:00", lastOut: null },
    ];
    expect(liveWorkDate(night, "2026-09-15", "20:40", days, at("2026-09-15T20:40"))).toBe(
      "2026-09-15",
    );
  });

  it("ignores a check-in ahead of the clock", () => {
    const days = [{ workDate: "2026-09-15", firstIn: "2026-09-15T08:05:00+05:00", lastOut: null }];
    expect(liveWorkDate(day, "2026-09-15", "02:00", days, at("2026-09-15T02:00"))).toBe(
      "2026-09-15",
    );
  });

  it("falls back to the shift's own date when nothing is open", () => {
    const closed = [
      {
        workDate: "2026-09-14",
        firstIn: "2026-09-14T20:05:00+05:00",
        lastOut: "2026-09-15T07:50:00+05:00",
      },
    ];
    expect(liveWorkDate(night, "2026-09-15", "02:00", closed, at("2026-09-15T02:00"))).toBe(
      "2026-09-14",
    );
    expect(liveWorkDate(night, "2026-09-15", "09:00", closed, at("2026-09-15T09:00"))).toBe(
      "2026-09-15",
    );
    expect(liveWorkDate(day, "2026-09-15", "09:00", [], at("2026-09-15T09:00"))).toBe("2026-09-15");
  });
});
