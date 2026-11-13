import { describe, expect, it } from "vitest";

import { withoutCanteenCards, withoutCardDepartments } from "./canteen-cards";

describe("canteen cards", () => {
  const rows = [
    { id: "a", department_id: "dyeing" },
    { id: "b", department_id: "cards" },
    { id: "c", department_id: null },
  ];

  it("drops people in the cards department and keeps the unassigned", () => {
    expect(withoutCanteenCards(rows, ["cards"]).map((r) => r.id)).toEqual(["a", "c"]);
  });

  it("changes nothing when there is no cards department", () => {
    expect(withoutCanteenCards(rows, [])).toHaveLength(3);
  });

  it("does not offer the cards department as a choice", () => {
    const departments = [{ id: "dyeing" }, { id: "cards" }];
    expect(withoutCardDepartments(departments, ["cards"])).toEqual([{ id: "dyeing" }]);
  });
});
