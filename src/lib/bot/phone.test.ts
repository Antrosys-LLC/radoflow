import { describe, expect, it } from "vitest";

import { phoneKey, samePhone } from "./phone";

describe("phone matching", () => {
  it("treats every way of writing a number as one", () => {
    const written = [
      "0300-1234567",
      "+92 300 1234567",
      "3001234567",
      "923001234567@s.whatsapp.net",
    ];
    for (const a of written) for (const b of written) expect(samePhone(a, b)).toBe(true);
  });

  it("ignores the device suffix on a WhatsApp id", () => {
    expect(phoneKey("923001234567:12@s.whatsapp.net")).toBe("3001234567");
  });

  it("never matches an empty or short number", () => {
    expect(samePhone("", "")).toBe(false);
    expect(samePhone("12345", "12345")).toBe(false);
    expect(samePhone(null, "3001234567")).toBe(false);
  });

  it("tells two different people apart", () => {
    expect(samePhone("0300-1234567", "0300-1234568")).toBe(false);
  });
});
