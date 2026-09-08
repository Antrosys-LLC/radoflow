import { describe, expect, it } from "vitest";

import { describeAskContext, readAskContext } from "./context";

describe("readAskContext", () => {
  it("keeps a known surface, subject and primitive facts", () => {
    const context = readAskContext({
      surface: "payslip",
      subject: "Imran Sheikh · August 2026",
      facts: { net: 28450, late: true, department: "Dyeing" },
    });

    expect(context).toEqual({
      surface: "payslip",
      subject: "Imran Sheikh · August 2026",
      facts: { net: 28450, late: true, department: "Dyeing" },
    });
  });

  it("falls back to the general surface for anything unrecognised", () => {
    // The surface arrives from the browser like the question does. An unknown
    // value must not reach the prompt as a sentence about a screen that does
    // not exist.
    expect(readAskContext({ surface: "../../etc/passwd" })?.surface).toBe("general");
    expect(readAskContext({ surface: 7 })?.surface).toBe("general");
  });

  it("returns null when there is no context at all", () => {
    expect(readAskContext(null)).toBeNull();
    expect(readAskContext("payroll")).toBeNull();
    expect(readAskContext(undefined)).toBeNull();
  });

  it("drops facts that are not primitives", () => {
    // A nested object would be a way to push arbitrary volume through a prompt
    // the factory pays for, and an array of a thousand rows is the obvious
    // shape of that.
    const context = readAskContext({
      surface: "person",
      facts: { name: "Imran", history: [1, 2, 3], nested: { a: 1 }, hours: 8 },
    });

    expect(context?.facts).toEqual({ name: "Imran", hours: 8 });
  });

  it("drops empty facts rather than listing them as blank", () => {
    const context = readAskContext({
      surface: "person",
      facts: { name: "Imran", designation: "", shift: null, department: undefined },
    });

    expect(context?.facts).toEqual({ name: "Imran" });
  });

  it("caps the number of facts and the length of each", () => {
    const many = Object.fromEntries(
      Array.from({ length: 100 }, (_, index) => [`k${index}`, "x".repeat(500)]),
    );
    const context = readAskContext({ surface: "reports", facts: many });

    expect(Object.keys(context?.facts ?? {})).toHaveLength(40);
    for (const value of Object.values(context?.facts ?? {})) {
      expect(String(value)).toHaveLength(200);
    }
  });

  it("keeps a zero, which is a real figure", () => {
    // `0` and `false` are answers — "no overtime", "not late" — and an
    // emptiness check that drops them would silently change what the model is
    // told about the record.
    const context = readAskContext({
      surface: "payslip",
      facts: { overtimeHours: 0, late: false },
    });

    expect(context?.facts).toEqual({ overtimeHours: 0, late: false });
  });
});

describe("describeAskContext", () => {
  it("names the screen and lists the facts as instructions", () => {
    const text = describeAskContext({
      surface: "payslip",
      subject: "Imran Sheikh · August 2026",
      facts: { net: 28450 },
    });

    expect(text).toContain("one person's payslip: Imran Sheikh · August 2026");
    expect(text).toContain("- net: 28450");
    // The model has to be told the list is the whole of what is on screen, or
    // it will treat a missing figure as one it may estimate.
    expect(text).toContain("never infer a figure that is missing here");
  });

  it("says nothing at all when there is nothing to say", () => {
    // The caller concatenates this unconditionally, so an empty context must
    // not add a stray sentence to every question asked from the floating
    // widget.
    expect(describeAskContext(null)).toBe("");
    expect(describeAskContext({ surface: "general" })).toBe("");
  });

  it("describes a bare surface with no facts", () => {
    expect(describeAskContext({ surface: "canteen" })).toContain("the canteen register");
  });
});
