import { describe, expect, it } from "vitest";

import { designationKey, suggestSalary, type SalaryPerson } from "./designation-salary";

const person = (designation: string, monthlySalary: number, over: Partial<SalaryPerson> = {}): SalaryPerson => ({
  designation,
  status: "active",
  payClass: "monthly",
  workerType: "employee",
  monthlySalary,
  ...over,
});

const many = (designation: string, salary: number, n: number) =>
  Array.from({ length: n }, () => person(designation, salary));

describe("suggestSalary", () => {
  it("offers the rate most of a designation is paid", () => {
    const staff = [...many("Helper", 25_000, 137), ...many("Helper", 27_000, 10), person("Helper", 30_000)];
    expect(suggestSalary("helper", staff)).toEqual({ salary: 25_000, people: 137, of: 148 });
  });

  it("offers nothing where the designation has no rate", () => {
    const operators = [31_200, 40_000, 45_000, 55_000, 55_000, 60_000, 66_000].map((s) => person("Operator", s));
    expect(suggestSalary("Operator", operators)).toBeNull();
  });

  it("offers nothing from a single person", () => {
    expect(suggestSalary("Manager", [person("Manager", 110_000)])).toBeNull();
  });

  it("offers nothing for a designation nobody holds, or a blank one", () => {
    expect(suggestSalary("Welder", many("Helper", 25_000, 5))).toBeNull();
    expect(suggestSalary("", many("Helper", 25_000, 5))).toBeNull();
    expect(suggestSalary(null, many("Helper", 25_000, 5))).toBeNull();
  });

  it("ignores people who are gone, contracted out, or not on a monthly salary", () => {
    const staff = [
      ...many("Helper", 25_000, 3),
      ...many("Helper", 90_000, 9).map((p) => ({ ...p, status: "terminated" })),
      ...many("Helper", 90_000, 9).map((p) => ({ ...p, workerType: "contractor" })),
      ...many("Helper", 90_000, 9).map((p) => ({ ...p, payClass: "hourly" })),
    ];
    expect(suggestSalary("Helper", staff)?.salary).toBe(25_000);
  });

  it("treats a trailing full stop and spacing as the same designation", () => {
    expect(designationKey(" Asist.  ")).toBe("ASIST");
    expect(suggestSalary("ASIST", [...many("Asist.", 35_000, 2), ...many("Asist", 35_000, 1)])?.of).toBe(3);
  });

  it("offers nothing when two amounts split a designation evenly", () => {
    const staff = [...many("Checker", 27_000, 2), ...many("Checker", 35_140, 2)];
    expect(suggestSalary("Checker", staff)).toBeNull(); // 50% share is not a rate
  });
});
