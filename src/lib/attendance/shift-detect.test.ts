import { describe, expect, it } from "vitest";

import {
  arrivalShift,
  belongsToPreviousNight,
  detectShift,
  pakistanMinutesOfDay,
  presenceWindowHours,
  shiftForArrival,
} from "./shift-detect";
import type { ShiftClock } from "./shift-now";

/** A check-in at a Pakistan wall-clock time, as the ISO instant the database holds. */
const pkt = (date: string, time: string) => new Date(`${date}T${time}:00+05:00`).toISOString();

describe("arrivalShift", () => {
  it("splits the day halfway between the two shift starts", () => {
    expect(arrivalShift(1 * 60 + 59)).toBe("NIGHT");
    expect(arrivalShift(2 * 60)).toBe("DAY");
    expect(arrivalShift(7 * 60 + 40)).toBe("DAY");
    expect(arrivalShift(13 * 60 + 59)).toBe("DAY");
    expect(arrivalShift(14 * 60)).toBe("NIGHT");
    expect(arrivalShift(20 * 60 + 5)).toBe("NIGHT");
  });

  it("reads the instant on the factory's clock, not the server's", () => {
    expect(pakistanMinutesOfDay(pkt("2026-09-10", "20:05"))).toBe(20 * 60 + 5);
    expect(pakistanMinutesOfDay(pkt("2026-09-10", "00:30"))).toBe(30);
    expect(pakistanMinutesOfDay("not a time")).toBeNull();
  });
});

describe("detectShift", () => {
  const nights = [
    { workDate: "2026-09-08", firstIn: pkt("2026-09-08", "19:55") },
    { workDate: "2026-09-09", firstIn: pkt("2026-09-09", "20:10") },
    { workDate: "2026-09-10", firstIn: pkt("2026-09-10", "20:02") },
  ];

  it("names the shift three attended days in a row agree on", () => {
    expect(detectShift(nights, 3)).toBe("NIGHT");
  });

  it("looks only at the most recent attended days", () => {
    const movedToDays = [
      ...nights,
      { workDate: "2026-09-11", firstIn: pkt("2026-09-11", "08:05") },
      { workDate: "2026-09-12", firstIn: pkt("2026-09-12", "07:58") },
      { workDate: "2026-09-14", firstIn: pkt("2026-09-14", "08:20") },
    ];
    expect(detectShift(movedToDays, 3)).toBe("DAY");
  });

  it("skips days with no check-in rather than counting them against the run", () => {
    const withSundayOff = [
      nights[0]!,
      { workDate: "2026-09-13", firstIn: null },
      nights[1]!,
      nights[2]!,
    ];
    expect(detectShift(withSundayOff, 3)).toBe("NIGHT");
  });

  it("refuses to decide when one covered shift breaks the run", () => {
    const covered = [
      ...nights.slice(0, 2),
      { workDate: "2026-09-10", firstIn: pkt("2026-09-10", "08:00") },
    ];
    expect(detectShift(covered, 3)).toBeNull();
  });

  it("waits until there are enough attended days", () => {
    expect(detectShift(nights.slice(0, 2), 3)).toBeNull();
    expect(detectShift(nights, 0)).toBeNull();
  });
});

describe("belongsToPreviousNight", () => {
  it("always credits a punch before five to the night before", () => {
    expect(
      belongsToPreviousNight({ hour: 3, onNightShift: false, openFromPreviousEvening: false }),
    ).toBe(true);
  });

  it("keeps a night worker's overtime until eight on the same night", () => {
    expect(
      belongsToPreviousNight({ hour: 7, onNightShift: true, openFromPreviousEvening: true }),
    ).toBe(true);
  });

  it("leaves an early day arrival on its own day", () => {
    expect(
      belongsToPreviousNight({ hour: 7, onNightShift: false, openFromPreviousEvening: false }),
    ).toBe(false);
    // A night worker with nothing open from the evening has come in for days.
    expect(
      belongsToPreviousNight({ hour: 7, onNightShift: true, openFromPreviousEvening: false }),
    ).toBe(false);
    expect(
      belongsToPreviousNight({ hour: 10, onNightShift: true, openFromPreviousEvening: true }),
    ).toBe(false);
  });
});

describe("shiftForArrival", () => {
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
  const at = (time: string) => pakistanMinutesOfDay(pkt("2026-09-15", time))!;

  it("measures somebody who came in for the night against the night shift", () => {
    // The roster still says days; the terminal says they arrived for the night.
    expect(shiftForArrival(shifts, day, at("19:36"))?.id).toBe("night");
    expect(shiftForArrival(shifts, day, at("23:00"))?.id).toBe("night");
    expect(shiftForArrival(shifts, day, at("02:00"))?.id).toBe("night");
  });

  it("leaves a late day arrival on the day shift", () => {
    expect(shiftForArrival(shifts, day, at("09:30"))?.id).toBe("day");
    expect(shiftForArrival(shifts, day, at("16:00"))?.id).toBe("day");
  });

  it("keeps somebody who arrived early on the shift they are rostered to", () => {
    expect(shiftForArrival(shifts, day, at("05:00"))?.id).toBe("day");
    expect(shiftForArrival(shifts, day, at("07:00"))?.id).toBe("day");
  });

  it("moves a night worker covering a day onto the day shift", () => {
    expect(shiftForArrival(shifts, night, at("07:00"))?.id).toBe("day");
    expect(shiftForArrival(shifts, night, at("08:19"))?.id).toBe("day");
  });

  it("keeps the roster when no shift's window claims the arrival", () => {
    expect(shiftForArrival(shifts, day, at("17:00"))?.id).toBe("day");
    expect(shiftForArrival([], day, at("19:36"))?.id).toBe("day");
    expect(shiftForArrival(shifts, null, at("19:36"))?.id).toBe("night");
    expect(shiftForArrival([], null, at("19:36"))).toBeNull();
  });
});

describe("presenceWindowHours", () => {
  const shift = (startsAt: string, endsAt: string, overtimeUntil: string | null): ShiftClock => ({
    id: "s",
    code: "S",
    name: "S",
    startsAt,
    endsAt,
    overtimeUntil,
    graceMinutes: 15,
  });

  it("covers the shift and its overtime, plus the margin somebody may arrive early by", () => {
    // 08:00 to 20:00 including overtime, and they may be at the gate from
    // 06:00: fourteen hours is the longest they can legitimately be on site.
    expect(presenceWindowHours(shift("08:00:00", "16:00:00", "20:00:00"))).toBe(14);
    expect(presenceWindowHours(shift("20:00:00", "04:00:00", "08:00:00"))).toBe(14);
  });

  it("never narrows below the twelve hours every day was measured by before", () => {
    // A shift with no overtime declared would otherwise compute ten, and a
    // worker three hours past their eight would lose the lot.
    expect(presenceWindowHours(shift("08:00:00", "16:00:00", null))).toBe(12);
  });

  it("gives nothing for a shift whose times cannot be read", () => {
    expect(presenceWindowHours(shift("not a time", "16:00:00", null))).toBeNull();
  });
});
