import { inflateRawSync } from "node:zlib";
import { describe, expect, it } from "vitest";

import { buildWorkbook, type Sheet } from "./xlsx";

/**
 * Reads the zip back out.
 *
 * A workbook that is subtly malformed still "builds" — it fails later, in
 * Excel, as "unreadable content" with no indication of which part is wrong. So
 * every test here opens the file it just produced.
 */
function unzip(b: Buffer): Map<string, string> {
  let eocd = -1;
  for (let i = b.length - 22; i >= 0; i--) {
    if (b.readUInt32LE(i) === 0x06054b50) {
      eocd = i;
      break;
    }
  }
  if (eocd < 0) throw new Error("no end-of-central-directory record");

  const count = b.readUInt16LE(eocd + 10);
  let off = b.readUInt32LE(eocd + 16);
  const files = new Map<string, string>();

  for (let n = 0; n < count; n++) {
    if (b.readUInt32LE(off) !== 0x02014b50) throw new Error("bad central directory entry");

    const compSize = b.readUInt32LE(off + 20);
    const nameLen = b.readUInt16LE(off + 28);
    const extraLen = b.readUInt16LE(off + 30);
    const commentLen = b.readUInt16LE(off + 32);
    const localOff = b.readUInt32LE(off + 42);
    const name = b.toString("utf8", off + 46, off + 46 + nameLen);

    const lNameLen = b.readUInt16LE(localOff + 26);
    const lExtraLen = b.readUInt16LE(localOff + 28);
    const start = localOff + 30 + lNameLen + lExtraLen;

    files.set(name, inflateRawSync(b.subarray(start, start + compSize)).toString("utf8"));
    off += 46 + nameLen + extraLen + commentLen;
  }
  return files;
}

const sheet: Sheet = {
  name: "Payroll",
  title: "August 2026",
  columns: [
    { header: "Name", width: 24, format: "text" },
    { header: "Days", format: "number" },
    { header: "Earned", format: "money" },
    { header: "Overtime", format: "hours" },
  ],
  rows: [
    ["ISMAIL KHAN", 25, 46585, 4],
    ["MUSHTAQ", 24, 44000, 0],
  ],
  totals: ["Total", 49, 90585, 4],
};

describe("xlsx writer", () => {
  it("produces a readable zip with every part Excel requires", () => {
    const files = unzip(buildWorkbook([sheet]));

    // Any one of these missing makes the file unopenable rather than plain.
    expect([...files.keys()]).toEqual(
      expect.arrayContaining([
        "[Content_Types].xml",
        "_rels/.rels",
        "xl/workbook.xml",
        "xl/_rels/workbook.xml.rels",
        "xl/styles.xml",
        "xl/worksheets/sheet1.xml",
      ]),
    );
  });

  it("writes numbers as numbers and text as text", () => {
    const xml = unzip(buildWorkbook([sheet])).get("xl/worksheets/sheet1.xml")!;

    // A number written as an inline string cannot be summed in the spreadsheet,
    // which is the whole reason for exporting one.
    expect(xml).toContain("<v>46585</v>");
    expect(xml).toContain("ISMAIL KHAN");
    expect(xml).not.toContain("<v>ISMAIL KHAN</v>");
  });

  it("carries the title, the totals row and a frozen header", () => {
    const xml = unzip(buildWorkbook([sheet])).get("xl/worksheets/sheet1.xml")!;

    expect(xml).toContain("August 2026");
    expect(xml).toContain("mergeCell");
    expect(xml).toContain('state="frozen"');
    expect(xml).toContain("autoFilter");
    expect(xml).toContain("<v>90585</v>");
  });

  it("escapes characters that would otherwise break the XML", () => {
    const xml = unzip(
      buildWorkbook([
        {
          ...sheet,
          rows: [["Ali & Sons <Textiles>", 1, 2, 3]],
          totals: undefined as never,
        },
      ]),
    ).get("xl/worksheets/sheet1.xml")!;

    expect(xml).toContain("Ali &amp; Sons &lt;Textiles&gt;");
  });

  it("makes a sheet name Excel will accept", () => {
    // Excel refuses these characters outright and reports the whole workbook
    // as corrupt rather than naming the sheet.
    const files = unzip(buildWorkbook([{ ...sheet, name: "Auto 01/02 [main]" }]));
    const workbook = files.get("xl/workbook.xml")!;

    expect(workbook).not.toContain("/02");
    expect(workbook).toContain("Auto 01-02 -main-");
  });

  it("truncates a sheet name past the 31-character limit", () => {
    const workbook = unzip(
      buildWorkbook([{ ...sheet, name: "A department with a very long name indeed" }]),
    ).get("xl/workbook.xml")!;

    const name = workbook.match(/name="([^"]*)"/)![1]!;
    expect(name.length).toBeLessThanOrEqual(31);
  });

  it("keeps two sheets that would otherwise share a name apart", () => {
    const workbook = unzip(
      buildWorkbook([
        { ...sheet, name: "Payroll" },
        { ...sheet, name: "Payroll" },
      ]),
    ).get("xl/workbook.xml")!;

    const names = [...workbook.matchAll(/name="([^"]*)"/g)].map((m) => m[1]);
    expect(new Set(names).size).toBe(2);
  });

  it("writes several sheets, each with its own part and relationship", () => {
    const files = unzip(
      buildWorkbook([
        { ...sheet, name: "One" },
        { ...sheet, name: "Two" },
        { ...sheet, name: "Three" },
      ]),
    );

    expect(files.has("xl/worksheets/sheet3.xml")).toBe(true);
    expect(files.get("xl/_rels/workbook.xml.rels")).toContain("sheet3.xml");
    // Styles take the relationship id after the sheets, not a fixed one.
    expect(files.get("xl/_rels/workbook.xml.rels")).toContain('Id="rId4"');
  });

  it("handles an empty table without producing a broken part", () => {
    const files = unzip(buildWorkbook([{ ...sheet, rows: [], totals: undefined as never }]));
    expect(files.get("xl/worksheets/sheet1.xml")).toContain("<sheetData>");
  });

  it("refuses a workbook with no sheets rather than writing a corrupt one", () => {
    expect(() => buildWorkbook([])).toThrow(/at least one sheet/);
  });
});
