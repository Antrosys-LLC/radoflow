import { inflateRawSync } from "node:zlib";
import { describe, expect, it } from "vitest";

import { groupRegister, toRegisterRow, type RegisterItem } from "@/lib/payroll/register";

import { registerPdf, registerWorkbook } from "./payroll-documents";

function sheetXml(buf: Buffer, name: string): string {
  let eocd = -1;
  for (let i = buf.length - 22; i >= 0; i--) {
    if (buf.readUInt32LE(i) === 0x06054b50) {
      eocd = i;
      break;
    }
  }
  const count = buf.readUInt16LE(eocd + 10);
  let off = buf.readUInt32LE(eocd + 16);
  for (let n = 0; n < count; n++) {
    const compSize = buf.readUInt32LE(off + 20);
    const nameLen = buf.readUInt16LE(off + 28);
    const extraLen = buf.readUInt16LE(off + 30);
    const commentLen = buf.readUInt16LE(off + 32);
    const localOff = buf.readUInt32LE(off + 42);
    const entry = buf.toString("utf8", off + 46, off + 46 + nameLen);
    if (entry === name) {
      const start =
        localOff + 30 + buf.readUInt16LE(localOff + 26) + buf.readUInt16LE(localOff + 28);
      return inflateRawSync(buf.subarray(start, start + compSize)).toString("utf8");
    }
    off += 46 + nameLen + extraLen + commentLen;
  }
  throw new Error(`no ${name}`);
}

const item = (
  name: string,
  department: string,
  lines: RegisterItem["lines"] = [],
): RegisterItem => ({
  profileId: name,
  name,
  code: "RD-1",
  designation: "Operator",
  department,
  monthlySalary: 31000,
  workingDays: 26,
  basePay: 26000,
  overtimeHours: 8,
  overtimePay: 1000,
  gross: 27000,
  withheld: lines.reduce((t, l) => t + l.amount, 0),
  net: 27000 - lines.reduce((t, l) => t + l.amount, 0),
  lines,
});

describe("payroll register documents", () => {
  const groups = groupRegister([
    toRegisterRow(
      item("ISMAIL KHAN", "Administration", [
        { code: "ADVANCE", label: "Advance", kind: "deduction", amount: 2000 },
      ]),
    ),
    toRegisterRow(
      item("SAJID ALI", "Kora", [{ code: "SUIT", label: "Suit", kind: "deduction", amount: 800 }]),
    ),
  ]);
  const meta = { title: "PAYROLL REGISTER", subtitle: "August 2026 · Whole factory" };

  it("writes the sheet's columns, in its order, with no OTHER column when nobody needs one", () => {
    const xml = sheetXml(registerWorkbook(groups, meta), "xl/worksheets/sheet1.xml");
    const order = ["S RATE", "DAYS", "G SALARY", "LOAN DED.", "SUITE DED.", "NET PAY"].map((h) =>
      xml.indexOf(`>${h}<`),
    );
    expect(order.every((i) => i > 0)).toBe(true);
    expect([...order].sort((a, b) => a - b)).toEqual(order);
    expect(xml).not.toContain("OTHER DED.");
    expect(xml).toContain("Total · Kora");
  });

  it("adds a department summary sheet", () => {
    const xml = sheetXml(registerWorkbook(groups, meta), "xl/worksheets/sheet2.xml");
    expect(xml).toContain("Administration");
    expect(xml).toContain("<v>54000</v>");
  });

  it("prints a landscape PDF carrying the grand total", () => {
    const text = registerPdf(groups, meta).toString("latin1");
    expect(text).toContain("/MediaBox [0 0 842 595]");
    expect(text).toContain("GRAND TOTAL");
    expect(text).toContain("SUITE DED.");
  });
});
