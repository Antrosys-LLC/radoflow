import { describe, expect, it } from "vitest";

import {
  crossesMidnight,
  decideMealScan,
  minutesOfDay,
  resolveMealWindow,
  shiftDate,
  type MealWindow,
} from "./meals";

const lunch: MealWindow = {
  id: "w-lunch",
  code: "lunch",
  name: "Lunch",
  startsAt: "12:00",
  endsAt: "15:00",
};

const dinner: MealWindow = {
  id: "w-dinner",
  code: "dinner",
  name: "Dinner",
  startsAt: "22:00",
  endsAt: "02:00",
};

describe("time parsing", () => {
  it("reads HH:MM and HH:MM:SS", () => {
    expect(minutesOfDay("12:00")).toBe(720);
    expect(minutesOfDay("12:00:00")).toBe(720);
    expect(minutesOfDay("00:30")).toBe(30);
    expect(minutesOfDay("23:59")).toBe(1439);
  });

  it("rejects nonsense rather than guessing", () => {
    expect(minutesOfDay("")).toBeNull();
    expect(minutesOfDay("25:00")).toBeNull();
    expect(minutesOfDay("12:70")).toBeNull();
    expect(minutesOfDay("noon")).toBeNull();
  });

  it("identifies a window that runs past midnight", () => {
    expect(crossesMidnight(dinner)).toBe(true);
    expect(crossesMidnight(lunch)).toBe(false);
  });

  it("shifts dates in UTC, not the server's zone", () => {
    expect(shiftDate("2026-08-30", -1)).toBe("2026-08-29");
    expect(shiftDate("2026-01-01", -1)).toBe("2025-12-31");
    expect(shiftDate("2026-03-01", -1)).toBe("2026-02-28");
  });
});

describe("resolving which meal is open", () => {
  const windows = [lunch, dinner];

  it("matches a scan inside an ordinary window", () => {
    const result = resolveMealWindow(windows, "2026-08-30", "13:15");
    expect(result?.window.code).toBe("lunch");
    expect(result?.servedOn).toBe("2026-08-30");
  });

  it("opens exactly at the start time", () => {
    expect(resolveMealWindow(windows, "2026-08-30", "12:00")?.window.code).toBe("lunch");
  });

  it("closes exactly at the end time", () => {
    // 15:00 is when lunch stops, so the counter is already shut.
    expect(resolveMealWindow(windows, "2026-08-30", "15:00")).toBeNull();
    expect(resolveMealWindow(windows, "2026-08-30", "14:59")?.window.code).toBe("lunch");
  });

  it("returns nothing when no window covers the time", () => {
    expect(resolveMealWindow(windows, "2026-08-30", "09:00")).toBeNull();
    expect(resolveMealWindow(windows, "2026-08-30", "18:00")).toBeNull();
  });

  it("matches the evening half of a window that crosses midnight", () => {
    const result = resolveMealWindow(windows, "2026-08-30", "22:30");
    expect(result?.window.code).toBe("dinner");
    expect(result?.servedOn).toBe("2026-08-30");
  });

  it("credits the after-midnight half to the day the window opened", () => {
    // The night shift's dinner started on the 30th; eating at 00:30 on the
    // 31st is still that same meal, not a new one.
    const result = resolveMealWindow(windows, "2026-08-31", "00:30");
    expect(result?.window.code).toBe("dinner");
    expect(result?.servedOn).toBe("2026-08-30");
  });

  it("skips a window with an unreadable time rather than throwing", () => {
    const broken: MealWindow = { ...lunch, id: "broken", startsAt: "oops" };
    expect(resolveMealWindow([broken, dinner], "2026-08-30", "22:30")?.window.code).toBe("dinner");
  });
});

describe("deciding a scan", () => {
  const windows = [lunch, dinner];
  const base = { windows, localDate: "2026-08-30", localTime: "13:00" };

  it("serves a worker on their first scan of the meal", () => {
    const decision = decideMealScan({ ...base, profileId: "p1", alreadyClaimed: false });
    expect(decision.outcome).toBe("served");
    expect(decision.window?.code).toBe("lunch");
    expect(decision.servedOn).toBe("2026-08-30");
  });

  it("refuses a second helping of the same meal", () => {
    const decision = decideMealScan({ ...base, profileId: "p1", alreadyClaimed: true });
    expect(decision.outcome).toBe("duplicate");
  });

  it("reports an unrecognised finger", () => {
    const decision = decideMealScan({ ...base, profileId: null, alreadyClaimed: false });
    expect(decision.outcome).toBe("unknown_person");
  });

  it("serves a scan that no window covers, recording no window", () => {
    // The counter being shut no longer refuses anybody: the terminal is the
    // rule now, and a meal eaten at 03:00 is still a meal.
    const decision = decideMealScan({
      profileId: "p1",
      windows: [{ id: "w1", code: "LUNCH", name: "Lunch", startsAt: "12:00", endsAt: "14:00" }],
      localDate: "2026-09-05",
      localTime: "03:00",
      alreadyClaimed: false,
    });

    expect(decision.outcome).toBe("served");
    expect(decision.window).toBeNull();
    // With no window to credit it to, the meal counts against today.
    expect(decision.servedOn).toBe("2026-09-05");
  });

  it("still labels a scan with the window that was running", () => {
    const decision = decideMealScan({
      profileId: "p1",
      windows: [{ id: "w1", code: "LUNCH", name: "Lunch", startsAt: "12:00", endsAt: "14:00" }],
      localDate: "2026-09-05",
      localTime: "12:30",
      alreadyClaimed: false,
    });

    expect(decision.outcome).toBe("served");
    expect(decision.window?.code).toBe("LUNCH");
  });

  it("still refuses an unrecognised finger, window or not", () => {
    const decision = decideMealScan({
      profileId: null,
      windows: [],
      localDate: "2026-09-05",
      localTime: "03:00",
      alreadyClaimed: false,
    });

    expect(decision.outcome).toBe("unknown_person");
  });

  it("reports a repeat as a duplicate rather than a refusal", () => {
    const decision = decideMealScan({
      profileId: "p1",
      windows: [],
      localDate: "2026-09-05",
      localTime: "03:00",
      alreadyClaimed: true,
    });

    expect(decision.outcome).toBe("duplicate");
  });

  it("labels a lunch scan and a dinner scan with their own windows", () => {
    const atLunch = decideMealScan({ ...base, profileId: "p1", alreadyClaimed: false });
    const atDinner = decideMealScan({
      ...base,
      localTime: "22:30",
      profileId: "p1",
      alreadyClaimed: false,
    });

    expect(atLunch.outcome).toBe("served");
    expect(atDinner.outcome).toBe("served");
    // decideMealScan only labels a window; whether a second scan is actually
    // allowed is the 24-hour trigger's call, not this function's — both come
    // back "served" here because the caller passed alreadyClaimed: false for
    // each, not because the rule permits both.
    expect(atLunch.window?.id).not.toBe(atDinner.window?.id);
  });
});
