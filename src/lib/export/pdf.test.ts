import { describe, expect, it } from "vitest";

import { buildPayslipPdf, buildTablePdf } from "./pdf";

/**
 * A PDF is only openable if its cross-reference table points at the real byte
 * offset of every object. Nothing about that is visible from "it produced a
 * buffer", so these tests parse the file back and check the offsets land on
 * the objects they claim.
 */
function parse(buf: Buffer) {
  const text = buf.toString("latin1");

  const startxref = Number(text.match(/startxref\s+(\d+)/)![1]);
  const size = Number(text.match(/\/Size (\d+)/)![1]);

  // Every entry is exactly 20 bytes; a viewer seeks by multiplying.
  const xref = text.slice(startxref);
  const entries = [...xref.matchAll(/^(\d{10}) (\d{5}) ([fn]) $/gm)];

  return { text, startxref, size, entries, buf };
}

const table = {
  title: "Payroll",
  subtitle: "August 2026",
  columns: [
    { header: "Name", width: 200 },
    { header: "Days", width: 60, align: "right" as const },
    { header: "Earned", width: 100, align: "right" as const },
  ],
  rows: [
    ["ISMAIL KHAN", 25, 46585],
    ["MUSHTAQ", 24, 44000],
  ],
  totals: ["Total", 49, 90585],
};

describe("pdf writer", () => {
  it("writes a file a viewer will accept", () => {
    const { text, entries, size } = parse(buildTablePdf(table));

    expect(text.startsWith("%PDF-1.4")).toBe(true);
    expect(text.trimEnd().endsWith("%%EOF")).toBe(true);
    // One entry per object, including the free entry at slot zero.
    expect(entries).toHaveLength(size);
  });

  it("points every cross-reference offset at the object it names", () => {
    const { text, entries, buf } = parse(buildTablePdf(table));

    entries.forEach((entry, index) => {
      if (index === 0) return; // the free head of the list
      const offset = Number(entry[1]);
      const at = buf.toString("latin1", offset, offset + 24);
      expect(at.startsWith(`${index} 0 obj`)).toBe(true);
    });

    expect(text).toContain("/Type /Catalog");
  });

  it("declares a stream length matching the bytes actually written", () => {
    // A length that disagrees with the stream is the other silent corruption:
    // some viewers recover, others show a blank page.
    const { text } = parse(buildTablePdf(table));
    const match = text.match(/<< \/Length (\d+) >>\nstream\n([\s\S]*?)\nendstream/)!;

    expect(Buffer.byteLength(match[2]!, "latin1")).toBe(Number(match[1]));
  });

  it("paginates a long table and numbers the pages from the first", () => {
    const many = Array.from({ length: 120 }, (_, i) => [`WORKER ${i}`, i, i * 100]);
    const { text } = parse(buildTablePdf({ ...table, rows: many }));

    const pageCount = (text.match(/\/Type \/Page[^s]/g) ?? []).length;
    expect(pageCount).toBeGreaterThan(1);

    // "of N" is on page one, which only works if layout precedes drawing.
    expect(text).toContain(`Page 1 of ${pageCount}`);
    expect(text).toContain(`Page ${pageCount} of ${pageCount}`);
  });

  it("escapes brackets, which would otherwise end the string early", () => {
    const { text } = parse(
      buildTablePdf({ ...table, rows: [["ALI (SENIOR) \\ CO", 1, 2]], totals: undefined }),
    );

    expect(text).toContain("ALI \\(SENIOR\\) \\\\ CO");
  });

  it("replaces characters the built-in fonts cannot encode", () => {
    // Left as-is these render as a wrong glyph rather than failing loudly.
    const { text } = parse(
      buildTablePdf({ ...table, rows: [["₨ 5,000 — done", 1, 2]], totals: undefined }),
    );

    expect(text).toContain("Rs 5,000 - done");
    expect(text).not.toContain("₨");
  });

  it("renders an empty table as a page rather than nothing", () => {
    const { text, entries, size } = parse(buildTablePdf({ ...table, rows: [], totals: undefined }));
    expect(entries).toHaveLength(size);
    expect(text).toContain("/Type /Page");
  });

  it("builds a payslip carrying the net figure", () => {
    const { text, entries, size } = parse(
      buildPayslipPdf({
        employeeName: "ISMAIL KHAN",
        employeeCode: "RD-2000",
        department: "Admin",
        designation: "S Sup.",
        period: "August 2026",
        facts: [
          { label: "Daily rate", value: "1,502.74" },
          { label: "Working days", value: "25" },
        ],
        earnings: [
          { label: "Salary for 25 working days", amount: 37568 },
          { label: "Overtime", amount: 645 },
        ],
        deductions: [{ label: "Advance recovery", amount: 2000 }],
        net: 36213,
      }),
    );

    expect(entries).toHaveLength(size);
    expect(text).toContain("ISMAIL KHAN");
    expect(text).toContain("NET PAY");
    expect(text).toContain("36,213");
    expect(text).toContain("How this was calculated");
  });

  it("builds a payslip with no deductions at all", () => {
    const { entries, size } = parse(
      buildPayslipPdf({
        employeeName: "MUSHTAQ",
        employeeCode: "RD-2001",
        department: "Admin",
        period: "August 2026",
        facts: [],
        earnings: [{ label: "Contract amount", amount: 44000 }],
        deductions: [],
        net: 44000,
      }),
    );

    expect(entries).toHaveLength(size);
  });
});
