import { describe, expect, it } from "vitest";

import { buildRegister, summarise, type RegisterDay, type RegisterPerson } from "./register";

const person = (
  id: string,
  fullName: string,
  extra: Partial<RegisterPerson> = {},
): RegisterPerson => ({
  id,
  fullName,
  employeeCode: id.toUpperCase(),
  department: "Dyeing",
  requiresAttendance: true,
  ...extra,
});

const day = (profileId: string, extra: Partial<RegisterDay> = {}): RegisterDay => ({
  profileId,
  firstIn: "2026-08-27T03:00:00Z",
  lastOut: "2026-08-27T12:00:00Z",
  hoursWorked: 9,
  minutesLate: 0,
  isLate: false,
  ...extra,
});

describe("buildRegister", () => {
  it("keeps a person with no punches, marked absent", () => {
    const rows = buildRegister([person("a", "Ali")], []);

    expect(rows).toHaveLength(1);
    expect(rows[0]?.state).toBe("absent");
    expect(rows[0]?.checkIn).toBeNull();
    expect(rows[0]?.hours).toBe(0);
  });

  it("reads a finished day as present", () => {
    const rows = buildRegister([person("a", "Ali")], [day("a")]);

    expect(rows[0]?.state).toBe("present");
    expect(rows[0]?.checkOut).toBe("2026-08-27T12:00:00Z");
    expect(rows[0]?.hours).toBe(9);
  });

  it("treats a check-in with no check-out as still working", () => {
    const rows = buildRegister([person("a", "Ali")], [day("a", { lastOut: null })]);

    expect(rows[0]?.state).toBe("working");
  });

  it("does not call monthly staff absent when attendance is not required of them", () => {
    const rows = buildRegister([person("a", "Ali", { requiresAttendance: false })], []);

    expect(rows[0]?.state).toBe("not_required");
  });

  it("still records punches for someone not required to attend", () => {
    const rows = buildRegister([person("a", "Ali", { requiresAttendance: false })], [day("a")]);

    expect(rows[0]?.state).toBe("present");
  });

  it("sorts by name so the register reads the same way every day", () => {
    const rows = buildRegister(
      [person("c", "Zahid"), person("a", "Ali"), person("b", "Bilal")],
      [],
    );

    expect(rows.map((row) => row.person.fullName)).toEqual(["Ali", "Bilal", "Zahid"]);
  });

  it("ignores a day belonging to nobody in the list", () => {
    const rows = buildRegister([person("a", "Ali")], [day("ghost")]);

    expect(rows).toHaveLength(1);
    expect(rows[0]?.state).toBe("absent");
  });

  it("carries lateness through", () => {
    const rows = buildRegister([person("a", "Ali")], [day("a", { isLate: true, minutesLate: 25 })]);

    expect(rows[0]?.isLate).toBe(true);
    expect(rows[0]?.minutesLate).toBe(25);
  });
});

describe("summarise", () => {
  it("counts each state, and counts late separately from present", () => {
    const rows = buildRegister(
      [
        person("a", "Ali"),
        person("b", "Bilal"),
        person("c", "Zahid"),
        person("d", "Nadia", { requiresAttendance: false }),
      ],
      [day("a", { isLate: true, minutesLate: 10 }), day("b", { lastOut: null })],
    );

    expect(summarise(rows)).toEqual({
      present: 1,
      working: 1,
      absent: 1,
      notRequired: 1,
      late: 1,
      expected: 3,
    });
  });

  it("reports zeroes for an empty register", () => {
    expect(summarise([])).toEqual({
      present: 0,
      working: 0,
      absent: 0,
      notRequired: 0,
      late: 0,
      expected: 0,
    });
  });
});
