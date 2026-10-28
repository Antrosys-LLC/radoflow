import { describe, expect, it } from "vitest";

import { autoCheckOutAt, type AutoCheckOutPerson } from "./auto-check-out";
import type { ShiftClock } from "./shift-now";

const at = (iso: string) => new Date(`${iso}+05:00`);

const DAY: ShiftClock = {
  id: "d",
  code: "DAY",
  name: "Day",
  startsAt: "08:00:00",
  endsAt: "16:00:00",
  overtimeUntil: "20:00:00",
  graceMinutes: 15,
};
const NIGHT: ShiftClock = {
  id: "n",
  code: "NIGHT",
  name: "Night",
  startsAt: "20:00:00",
  endsAt: "04:00:00",
  overtimeUntil: "08:00:00",
  graceMinutes: 15,
};

const person = (over: Partial<AutoCheckOutPerson>): AutoCheckOutPerson => ({
  shift: DAY,
  flexibleHours: false,
  dutyHours: 8,
  overtimeEligible: false,
  overtimeCapHours: 4,
  windowHours: 12.5,
  ...over,
});

describe("autoCheckOutAt", () => {
  it("closes a day worker without overtime at the end of duty", () => {
    const out = autoCheckOutAt({ at: at("2026-10-27T07:55:00"), workDate: "2026-10-27" }, person({}));
    expect(out).toEqual(at("2026-10-27T16:00:00"));
  });

  it("closes a day worker with overtime four hours after duty ends", () => {
    const out = autoCheckOutAt(
      { at: at("2026-10-27T07:55:00"), workDate: "2026-10-27" },
      person({ overtimeEligible: true }),
    );
    expect(out).toEqual(at("2026-10-27T20:00:00"));
  });

  it("closes a night worker on the morning after, on the date the night began", () => {
    const night = person({ shift: NIGHT, windowHours: 12.5 });
    expect(autoCheckOutAt({ at: at("2026-10-27T19:50:00"), workDate: "2026-10-27" }, night)).toEqual(
      at("2026-10-28T04:00:00"),
    );
    expect(
      autoCheckOutAt(
        { at: at("2026-10-27T19:50:00"), workDate: "2026-10-27" },
        { ...night, overtimeEligible: true },
      ),
    ).toEqual(at("2026-10-28T08:00:00"));
  });

  it("does not give a late arrival a longer day", () => {
    const out = autoCheckOutAt(
      { at: at("2026-10-27T11:30:00"), workDate: "2026-10-27" },
      person({ overtimeEligible: true }),
    );
    expect(out).toEqual(at("2026-10-27T20:00:00"));
  });

  it("runs flexible hours from the check-in, since there is no clock to keep", () => {
    const flexible = person({ shift: null, flexibleHours: true });
    expect(autoCheckOutAt({ at: at("2026-10-27T10:15:00"), workDate: "2026-10-27" }, flexible)).toEqual(
      at("2026-10-27T18:15:00"),
    );
    expect(
      autoCheckOutAt(
        { at: at("2026-10-27T10:15:00"), workDate: "2026-10-27" },
        { ...flexible, overtimeEligible: true, windowHours: 12 },
      ),
    ).toEqual(at("2026-10-27T22:15:00"));
  });

  it("ignores a flexible person's rostered shift", () => {
    const out = autoCheckOutAt(
      { at: at("2026-10-27T10:15:00"), workDate: "2026-10-27" },
      person({ flexibleHours: true }),
    );
    expect(out).toEqual(at("2026-10-27T18:15:00"));
  });

  it("lets a twelve-hour guard run for his duty, not the shift clock", () => {
    const out = autoCheckOutAt(
      { at: at("2026-10-27T07:58:00"), workDate: "2026-10-27" },
      person({ dutyHours: 12, windowHours: 12.5 }),
    );
    expect(out).toEqual(at("2026-10-27T20:00:00"));
  });

  it("holds the stamp inside the window so it still closes the check-in", () => {
    const out = autoCheckOutAt(
      { at: at("2026-10-27T07:58:00"), workDate: "2026-10-27" },
      person({ dutyHours: 12, overtimeEligible: true, windowHours: 12 }),
    );
    expect(out).toEqual(at("2026-10-27T19:58:00"));
  });

  it("still gives duty hours to a check-in scanned after its own deadline", () => {
    const out = autoCheckOutAt({ at: at("2026-10-27T21:00:00"), workDate: "2026-10-27" }, person({}));
    expect(out).toEqual(at("2026-10-28T05:00:00"));
  });
});
