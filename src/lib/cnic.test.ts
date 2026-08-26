import { describe, expect, it } from "vitest";

import { cnicDigits, cnicLoginEmail, formatCnic, isValidCnic, normaliseCnic } from "./cnic";

describe("formatCnic", () => {
  it("dashes a bare thirteen-digit number", () => {
    expect(formatCnic("3520112345678")).toBe("35201-1234567-8");
  });

  it("leaves an already-formatted number alone", () => {
    expect(formatCnic("35201-1234567-8")).toBe("35201-1234567-8");
  });

  it("re-dashes a number dashed in the wrong places", () => {
    expect(formatCnic("352-011234-5678")).toBe("35201-1234567-8");
  });

  it("adds no trailing dash while the person is still typing", () => {
    expect(formatCnic("3520")).toBe("3520");
    expect(formatCnic("35201")).toBe("35201");
    expect(formatCnic("352011")).toBe("35201-1");
    expect(formatCnic("352011234567")).toBe("35201-1234567");
  });

  it("ignores spaces and stray punctuation from a pasted value", () => {
    expect(formatCnic(" 35201 1234567 8 ")).toBe("35201-1234567-8");
  });

  it("discards digits past the thirteenth rather than growing the field", () => {
    expect(formatCnic("35201123456789999")).toBe("35201-1234567-8");
  });

  it("returns empty for input with no digits at all", () => {
    expect(formatCnic("")).toBe("");
    expect(formatCnic("---")).toBe("");
  });
});

describe("isValidCnic", () => {
  it("accepts a complete number in either form", () => {
    expect(isValidCnic("35201-1234567-8")).toBe(true);
    expect(isValidCnic("3520112345678")).toBe(true);
  });

  it("rejects anything short of thirteen digits", () => {
    expect(isValidCnic("35201-1234567")).toBe(false);
    expect(isValidCnic("")).toBe(false);
  });
});

describe("normaliseCnic", () => {
  it("returns the stored form for a complete number", () => {
    expect(normaliseCnic("3520112345678")).toBe("35201-1234567-8");
  });

  it("returns null for a partial number, so a form can treat it as absent", () => {
    expect(normaliseCnic("35201")).toBeNull();
  });
});

describe("cnicLoginEmail", () => {
  it("derives the same address whether or not the input was dashed", () => {
    expect(cnicLoginEmail("35201-1234567-8")).toBe("3520112345678@cnic.invalid");
    expect(cnicLoginEmail("3520112345678")).toBe("3520112345678@cnic.invalid");
  });
});

describe("cnicDigits", () => {
  it("keeps only digits", () => {
    expect(cnicDigits("35201-1234567-8")).toBe("3520112345678");
  });
});
