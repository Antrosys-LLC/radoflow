import { describe, expect, it } from "vitest";

import { parseCommand, parseDate } from "./parse";

const TODAY = "2026-11-13";

describe("parseDate", () => {
  it("understands the ways the office writes a date", () => {
    expect(parseDate("today", TODAY)).toBe(TODAY);
    expect(parseDate("yesterday", TODAY)).toBe("2026-11-12");
    expect(parseDate("2026-11-01", TODAY)).toBe("2026-11-01");
    expect(parseDate("01-11-2026", TODAY)).toBe("2026-11-01");
    expect(parseDate("5/11", TODAY)).toBe("2026-11-05");
  });

  it("refuses a date that is not on the calendar", () => {
    expect(parseDate("31-02-2026", TODAY)).toBeNull();
    expect(parseDate("dyeing", TODAY)).toBeNull();
  });
});

describe("parseCommand", () => {
  it("opens on today when no date is given", () => {
    expect(parseCommand("attendance", TODAY)).toEqual({
      kind: "attendance",
      date: TODAY,
      query: "",
    });
  });

  it("separates the department from the date and the filler words", () => {
    expect(parseCommand("/checkins for Auto 01 yesterday", TODAY)).toEqual({
      kind: "checkins",
      date: "2026-11-12",
      query: "Auto 01",
    });
  });

  it("builds a one-day report in both formats by default", () => {
    expect(parseCommand("report dyeing", TODAY)).toMatchObject({
      kind: "report",
      from: TODAY,
      to: TODAY,
      till: false,
      query: "dyeing",
      format: "both",
    });
  });

  it("takes a date range and a format", () => {
    expect(parseCommand("report 01-11-2026 to 07-11-2026 excel", TODAY)).toMatchObject({
      from: "2026-11-01",
      to: "2026-11-07",
      format: "xlsx",
    });
  });

  it("runs a till-now report from the first of the month up to today", () => {
    expect(parseCommand("report till now dyeing pdf", TODAY)).toMatchObject({
      from: "2026-11-01",
      to: TODAY,
      till: true,
      query: "dyeing",
      format: "pdf",
    });
  });

  it("never lets a range run backwards", () => {
    expect(parseCommand("report 10-11-2026 05-11-2026", TODAY)).toMatchObject({
      from: "2026-11-10",
      to: "2026-11-10",
    });
  });

  it("reads Roman Urdu aliases", () => {
    expect(parseCommand("haazri aaj", TODAY).kind).toBe("attendance");
    expect(parseCommand("khana kal", TODAY)).toEqual({
      kind: "canteen",
      date: "2026-11-12",
      to: "2026-11-12",
      format: "both",
      file: false,
    });
  });

  it("only sends the canteen file when asked for one", () => {
    expect(parseCommand("canteen", TODAY)).toMatchObject({ file: false });
    expect(parseCommand("canteen file", TODAY)).toMatchObject({
      date: TODAY,
      to: TODAY,
      file: true,
    });
    expect(parseCommand("canteen excel", TODAY)).toMatchObject({ format: "xlsx", file: true });
  });

  it("takes a canteen range across two dates, and never runs it backwards", () => {
    expect(parseCommand("canteen 01-11-2026 to 07-11-2026", TODAY)).toMatchObject({
      date: "2026-11-01",
      to: "2026-11-07",
      file: true,
    });
    expect(parseCommand("canteen 10-11-2026 05-11-2026", TODAY)).toMatchObject({
      date: "2026-11-10",
      to: "2026-11-10",
    });
  });

  it("does not guess at what it does not understand", () => {
    expect(parseCommand("hello there", TODAY)).toEqual({ kind: "unknown", text: "hello there" });
  });
});
