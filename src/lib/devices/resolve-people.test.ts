import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/supabase/service", () => ({ createServiceClient: () => ({}) }));

import { holderOn } from "./resolve-people";

describe("holderOn", () => {
  const current = new Map([["54", "arslan"]]);
  const former = new Map([["54", [{ profileId: "adnan", leftOn: "2026-10-16" }]]]);

  it("credits a punch before the handover to the person who held the number", () => {
    expect(holderOn(former, current, "54", "2026-10-15")).toBe("adnan");
  });

  it("credits the joining day and everything after to the new joiner", () => {
    expect(holderOn(former, current, "54", "2026-10-16")).toBe("arslan");
    expect(holderOn(former, current, "54", "2026-11-02")).toBe("arslan");
  });

  it("walks a number through three holders", () => {
    const chain = new Map([
      [
        "7",
        [
          { profileId: "a", leftOn: "2026-03-01" },
          { profileId: "b", leftOn: "2026-06-01" },
        ],
      ],
    ]);
    const now = new Map([["7", "c"]]);
    expect(holderOn(chain, now, "7", "2026-02-01")).toBe("a");
    expect(holderOn(chain, now, "7", "2026-04-01")).toBe("b");
    expect(holderOn(chain, now, "7", "2026-07-01")).toBe("c");
  });

  it("is the current holder for a number nobody left", () => {
    expect(holderOn(new Map(), current, "54", "2026-01-01")).toBe("arslan");
    expect(holderOn(new Map(), current, "99", "2026-01-01")).toBeNull();
  });
});
