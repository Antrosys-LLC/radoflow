import { describe, expect, it } from "vitest";

import { openCheckInDate, placeCheckOuts } from "./check-out-dates";

const at = (iso: string) => Date.parse(`${iso}+05:00`);

describe("openCheckInDate", () => {
  it("is the date of the check-in still open", () => {
    const history = [{ at: at("2026-10-17T19:38:14"), direction: "in" as const, workDate: "2026-10-17" }];
    expect(openCheckInDate(history, at("2026-10-18T05:16:37"))).toBe("2026-10-17");
  });

  it("is nothing once the check-in has been closed", () => {
    const history = [
      { at: at("2026-10-17T19:38:00"), direction: "in" as const, workDate: "2026-10-17" },
      { at: at("2026-10-18T01:00:00"), direction: "out" as const, workDate: "2026-10-17" },
    ];
    expect(openCheckInDate(history, at("2026-10-18T05:16:37"))).toBeNull();
  });

  it("is nothing when the open check-in is older than a stretch can be", () => {
    const history = [{ at: at("2026-10-17T10:00:00"), direction: "in" as const, workDate: "2026-10-17" }];
    expect(openCheckInDate(history, at("2026-10-18T05:16:37"))).toBeNull();
  });

  it("keeps the first of two check-ins scanned for one arrival", () => {
    const history = [
      { at: at("2026-10-17T19:38:00"), direction: "in" as const, workDate: "2026-10-17" },
      { at: at("2026-10-17T19:39:00"), direction: "in" as const, workDate: "2026-10-17" },
    ];
    expect(openCheckInDate(history, at("2026-10-18T05:16:37"))).toBe("2026-10-17");
  });
});

describe("placeCheckOuts", () => {
  it("puts a night worker's morning scan on the night, whatever his roster says", () => {
    const placed = placeCheckOuts(
      [{ key: "0", profileId: "p", at: at("2026-10-18T05:16:37") }],
      [{ profileId: "p", at: at("2026-10-17T19:38:14"), direction: "in", workDate: "2026-10-17" }],
      [{ profileId: "p", at: at("2026-10-18T05:16:37"), direction: "out", workDate: "2026-10-18" }],
    );
    expect(placed.get("0")).toBe("2026-10-17");
  });

  it("leaves a scan alone when the person has nothing open", () => {
    const placed = placeCheckOuts(
      [{ key: "0", profileId: "p", at: at("2026-10-18T05:16:37") }],
      [],
      [{ profileId: "p", at: at("2026-10-18T05:16:37"), direction: "out", workDate: "2026-10-18" }],
    );
    expect(placed.size).toBe(0);
  });

  it("closes the arrival once: a second scan in the same upload has nothing to close", () => {
    const placed = placeCheckOuts(
      [
        { key: "a", profileId: "p", at: at("2026-10-18T05:16:00") },
        { key: "b", profileId: "p", at: at("2026-10-18T05:17:00") },
      ],
      [{ profileId: "p", at: at("2026-10-17T19:38:14"), direction: "in", workDate: "2026-10-17" }],
      [
        { profileId: "p", at: at("2026-10-18T05:16:00"), direction: "out", workDate: "2026-10-18" },
        { profileId: "p", at: at("2026-10-18T05:17:00"), direction: "out", workDate: "2026-10-18" },
      ],
    );
    expect(placed.get("a")).toBe("2026-10-17");
    expect(placed.has("b")).toBe(false);
  });

  it("puts a replayed scan back where it already was", () => {
    const stored = [
      { profileId: "p", at: at("2026-10-17T19:38:14"), direction: "in" as const, workDate: "2026-10-17" },
      { profileId: "p", at: at("2026-10-18T05:16:37"), direction: "out" as const, workDate: "2026-10-17" },
    ];
    const placed = placeCheckOuts(
      [{ key: "0", profileId: "p", at: at("2026-10-18T05:16:37") }],
      stored,
      [{ profileId: "p", at: at("2026-10-18T05:16:37"), direction: "out", workDate: "2026-10-18" }],
    );
    expect(placed.get("0")).toBe("2026-10-17");
  });
});
