import { describe, expect, it } from "vitest";

import { approvalRowFor, needsApproval } from "./approval";

describe("needsApproval", () => {
  it("is true for someone who can run but not approve", () => {
    expect(needsApproval(new Set(["payroll.run", "payroll.view"]))).toBe(true);
  });

  it("is false for someone who can approve their own run", () => {
    expect(needsApproval(new Set(["payroll.run", "payroll.approve"]))).toBe(false);
  });
});

describe("approvalRowFor", () => {
  it("describes the run for the admin who will sign it", () => {
    const row = approvalRowFor({
      periodId: "p1",
      siteId: "s1",
      label: "August 2026",
      requestedBy: "u1",
      headcount: 42,
      net: 1_250_000,
    });

    expect(row.entity_type).toBe("payroll_period");
    expect(row.entity_id).toBe("p1");
    expect(row.site_id).toBe("s1");
    expect(row.required_permission).toBe("payroll.approve");
    expect(row.status).toBe("pending");
    expect(row.amount).toBe(1_250_000);
    expect(row.requested_by).toBe("u1");
    expect(row.title).toBe("Payroll for August 2026");
    expect(row.summary).toBe("42 people, net Rs 1,250,000. Calculated and awaiting sign-off.");
  });

  it("says one person, not 1 people", () => {
    const row = approvalRowFor({
      periodId: "p2",
      siteId: "s1",
      label: "September 2026",
      requestedBy: "u1",
      headcount: 1,
      net: 40_000,
    });

    expect(row.summary).toBe("1 person, net Rs 40,000. Calculated and awaiting sign-off.");
  });
});
