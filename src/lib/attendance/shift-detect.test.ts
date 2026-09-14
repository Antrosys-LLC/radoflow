import { describe, expect, it } from "vitest";

import {
  arrivalShift,
  belongsToPreviousNight,
  detectShift,
  pakistanMinutesOfDay,
} from "./shift-detect";

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
