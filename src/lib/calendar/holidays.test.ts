import { describe, expect, it } from "vitest";

import { parseHolidaySuggestions } from "./holidays";

const range = { from: "2026-09-13", to: "2027-01-11" };

describe("parseHolidaySuggestions", () => {
  it("reads a JSON array even when it arrives wrapped in prose or a fence", () => {
    const reply =
      'Here are the holidays:\n```json\n[{"date":"2026-11-09","name":"Iqbal Day","status":"announced","note":"Federal holiday."}]\n```';
    expect(parseHolidaySuggestions(reply, range)).toEqual([
      { date: "2026-11-09", name: "Iqbal Day", status: "announced", note: "Federal holiday." },
    ]);
  });

  it("drops dates outside the range, impossible dates, repeats and nameless entries", () => {
    const reply = JSON.stringify([
      { date: "2026-12-25", name: "Quaid-e-Azam Day", status: "announced" },
      { date: "2026-12-25", name: "Christmas", status: "announced" },
      { date: "2026-02-30", name: "Nonsense", status: "announced" },
      { date: "2027-03-23", name: "Pakistan Day", status: "announced" },
      { date: "2026-10-01", name: "", status: "expected" },
      { date: "2026-09-15", name: "12 Rabi ul Awwal", status: "maybe" },
    ]);

    expect(parseHolidaySuggestions(reply, range)).toEqual([
      { date: "2026-09-15", name: "12 Rabi ul Awwal", status: "expected", note: "" },
      { date: "2026-12-25", name: "Quaid-e-Azam Day", status: "announced", note: "" },
    ]);
  });

  it("returns nothing for a reply that is not a list", () => {
    expect(parseHolidaySuggestions("I could not find anything.", range)).toEqual([]);
    expect(parseHolidaySuggestions("[not json]", range)).toEqual([]);
  });
});
