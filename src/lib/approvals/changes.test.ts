import { describe, expect, it } from "vitest";

import { changeRequestRowFor, describeFieldChanges, money, needsApproval } from "./changes";
import type { Session, SessionRole } from "@/lib/auth/session";

function sessionWith(roles: Partial<SessionRole>[]): Session {
  return {
    userId: "u1",
    profile: {
      id: "u1",
      employeeCode: "RD-1",
      fullName: "Test Person",
      email: null,
      photoUrl: null,
      designation: null,
      siteId: null,
      departmentId: null,
      payClass: "monthly",
      requiresAttendance: true,
      language: "en",
    },
    roles: roles.map((role) => ({
      key: role.key ?? "manager",
      name: role.name ?? "Manager",
      isSuperuser: role.isSuperuser ?? false,
      rank: role.rank ?? 40,
    })),
    permissions: new Set<string>(),
    isSuperuser: roles.some((role) => role.isSuperuser),
    primaryRole: null,
  };
}

describe("needsApproval", () => {
  it("exempts Antrosys", () => {
    // They are who fixes this workflow when it goes wrong. A maintainer who
    // cannot correct a stuck request without finding a director cannot
    // maintain.
    const antrosys = sessionWith([{ key: "admin-antrosys", isSuperuser: true, rank: 5 }]);
    expect(needsApproval(antrosys)).toBe(false);
  });

  it("queues the CEO like everybody else", () => {
    // The ask is not about capability — the CEO holds every permission. It is
    // about a second pair of eyes on money and on the working week.
    const ceo = sessionWith([{ key: "ceo", name: "CEO", isSuperuser: true, rank: 20 }]);
    expect(needsApproval(ceo)).toBe(true);
  });

  it("queues a manager and an accountant", () => {
    expect(needsApproval(sessionWith([{ key: "manager" }]))).toBe(true);
    expect(needsApproval(sessionWith([{ key: "accounts", rank: 35 }]))).toBe(true);
  });

  it("queues somebody holding several roles unless one of them is Antrosys", () => {
    expect(needsApproval(sessionWith([{ key: "manager" }, { key: "accounts" }]))).toBe(true);
    expect(
      needsApproval(
        sessionWith([{ key: "manager" }, { key: "admin-antrosys", isSuperuser: true }]),
      ),
    ).toBe(false);
  });

  it("queues an anonymous caller rather than waving it through", () => {
    // Nothing should reach this without a session, but the safe answer to "who
    // is this" is "somebody who waits".
    expect(needsApproval(null)).toBe(true);
  });
});

describe("changeRequestRowFor", () => {
  it("carries the payload through untouched and starts pending", () => {
    const row = changeRequestRowFor({
      kind: "pay_change",
      entityTable: "profiles",
      entityId: "p1",
      payload: { monthly_salary: 35000 },
      siteId: "s1",
      title: "Pay change",
      summary: "Salary: 30,000 → 35,000",
      requestedBy: "u1",
      assignedTo: "ceo1",
    });

    expect(row.status).toBe("pending");
    expect(row.payload).toEqual({ monthly_salary: 35000 });
    expect(row.entity_id).toBe("p1");
    expect(row.assigned_to).toBe("ceo1");
  });

  it("allows a null entity for something that does not exist yet", () => {
    // A calendar day being created has nothing to point at until it is applied.
    const row = changeRequestRowFor({
      kind: "calendar_day",
      entityTable: "calendar_days",
      entityId: null,
      payload: { day: "2026-09-13", day_type: "weekend_working" },
      siteId: "s1",
      title: "Working Sunday",
      summary: "13 Sept 2026",
      requestedBy: "u1",
      assignedTo: null,
    });

    expect(row.entity_id).toBeNull();
    expect(row.assigned_to).toBeNull();
  });
});

describe("describeFieldChanges", () => {
  const labels = { monthly_salary: "Salary", duty_hours: "Salary covers" };

  it("lists only what actually differs", () => {
    const text = describeFieldChanges(
      { monthly_salary: 30000, duty_hours: 8 },
      { monthly_salary: 35000, duty_hours: 8 },
      labels,
    );

    expect(text).toBe("Salary: 30000 → 35000");
  });

  it("compares as strings, because form fields arrive as strings", () => {
    // "8" and 8 are the same answer typed two ways; reporting that as a change
    // would fill an approver's inbox with edits nobody made.
    expect(describeFieldChanges({ duty_hours: 8 }, { duty_hours: "8" }, labels)).toBe("");
  });

  it("writes an em dash for a value that was or becomes empty", () => {
    expect(describeFieldChanges({ monthly_salary: null }, { monthly_salary: 5000 }, labels)).toBe(
      "Salary: — → 5000",
    );
    expect(describeFieldChanges({ monthly_salary: 5000 }, { monthly_salary: "" }, labels)).toBe(
      "Salary: 5000 → —",
    );
  });

  it("falls back to the column name when there is no label", () => {
    // Better an approver sees a column name than a change described as nothing.
    expect(describeFieldChanges({ shift_id: "a" }, { shift_id: "b" }, labels)).toBe(
      "shift_id: a → b",
    );
  });

  it("joins several changes into one line", () => {
    const text = describeFieldChanges(
      { monthly_salary: 30000, duty_hours: 8 },
      { monthly_salary: 35000, duty_hours: 12 },
      labels,
    );

    expect(text).toBe("Salary: 30000 → 35000 · Salary covers: 8 → 12");
  });
});

describe("money", () => {
  it("writes rupees the way the payslip does", () => {
    expect(money(35000)).toBe("Rs 35,000");
    expect(money(1234.6)).toBe("Rs 1,235");
  });
});
