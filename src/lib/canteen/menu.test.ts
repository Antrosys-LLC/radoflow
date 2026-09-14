import { describe, expect, it } from "vitest";

import { dayPrices, menuPrice, planMenus, weekStart, type MenuItem } from "./menu";

const chicken: MenuItem = { name: "Chicken", price: 140 };
const daal: MenuItem = { name: "Daal", price: 85 };
const kofta: MenuItem = { name: "Aloo Kofta", price: 105, option: true };
const mash: MenuItem = { name: "Daal Mash", price: 105 };
const sabzi: MenuItem = { name: "Sabzi", price: 85 };
const sabziOption: MenuItem = { ...sabzi, option: true };
const chany: MenuItem = { name: "Chany + Sabzi", price: 85 };

// The canteen's own schedule: nothing on Thursday.
const weekly = new Map<number, MenuItem[]>([
  [1, [chicken]],
  [2, [daal]],
  [3, [kofta, sabziOption]],
  [5, [mash]],
  [6, [sabzi]],
  [0, [chany]],
]);

// 14 September 2026 is a Monday.
const sundayOff = (date: string) => new Date(`${date}T00:00:00Z`).getUTCDay() !== 0;

describe("canteen menu", () => {
  it("adds a day's dishes into the price of one meal", () => {
    expect(menuPrice([chicken, daal])).toBe(225);
    expect(menuPrice([])).toBe(0);
  });

  it("starts a week on Monday and ends it on Sunday", () => {
    expect(weekStart("2026-09-14")).toBe("2026-09-14");
    expect(weekStart("2026-09-20")).toBe("2026-09-14");
  });

  it("serves the weekly schedule, with no meal on Thursday", () => {
    const menus = planMenus("2026-09-14", "2026-09-20", weekly, new Map(), sundayOff);

    expect(menus.map((m) => m.price)).toEqual([140, 85, 105, 0, 105, 85, 85]);
    expect(menus[3]).toMatchObject({ source: "none" });
  });

  it("waits for the office to say what Wednesday served, counting the dearer dish meanwhile", () => {
    const menus = planMenus("2026-09-16", "2026-09-16", weekly, new Map(), sundayOff);

    expect(menus[0]).toMatchObject({ source: "choose", price: 105 });
    expect(menus[0]!.options.map((o) => o.name)).toEqual(["Aloo Kofta", "Sabzi"]);
  });

  it("prices a Wednesday at the dish that was actually served", () => {
    const served = new Map([["2026-09-16", [sabzi]]]);
    const menus = planMenus("2026-09-16", "2026-09-16", weekly, served, sundayOff);

    expect(menus[0]).toMatchObject({ source: "day", price: 85 });
  });

  it("keeps Sunday's meal on Sunday even though the factory is off", () => {
    const menus = planMenus("2026-09-20", "2026-09-20", weekly, new Map(), sundayOff);

    expect(menus[0]).toMatchObject({ source: "weekly", price: 85, working: false });
  });

  it("serves nothing on a date the office marked no meal", () => {
    const menus = planMenus(
      "2026-09-14",
      "2026-09-14",
      weekly,
      new Map(),
      sundayOff,
      new Set(["2026-09-14"]),
    );

    expect(menus[0]).toMatchObject({ source: "off", price: 0, items: [] });
  });

  it("moves Monday's meal to Thursday: Thursday serves chicken, Monday nothing", () => {
    const menus = planMenus(
      "2026-09-14",
      "2026-09-17",
      weekly,
      new Map([["2026-09-17", [chicken]]]),
      sundayOff,
      new Set(["2026-09-14"]),
    );

    expect(menus.map((m) => [m.source, m.price])).toEqual([
      ["off", 0],
      ["weekly", 85],
      ["choose", 105],
      ["day", 140],
    ]);
  });

  it("lets a day's own dishes replace the schedule for that date only", () => {
    const special = new Map([["2026-09-15", [daal, sabzi]]]);

    const menus = planMenus("2026-09-15", "2026-09-16", weekly, special, sundayOff);

    expect(menus.map((m) => [m.source, m.price])).toEqual([
      ["day", 170],
      ["choose", 105],
    ]);
  });

  it("prices only the dates that had something on the menu", () => {
    const menus = planMenus("2026-09-16", "2026-09-17", weekly, new Map(), sundayOff);

    expect([...dayPrices(menus)]).toEqual([["2026-09-16", 105]]);
  });
});
