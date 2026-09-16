/**
 * A minimal styled .xlsx writer.
 *
 * An .xlsx is a zip of XML parts, and node ships the deflate half of that
 * already — so this needs no dependency. It handles what a report actually
 * needs: the company letterhead and mark, bold headers, frozen panes, column
 * widths, number formats, banded rows, department headings and subtotals, and
 * a page set up to print. Nothing else.
 *
 * Written by hand rather than pulled in, because the alternatives weigh several
 * megabytes to produce a table with a header on it, and this runs on every
 * request that asks for a download.
 *
 * The order of elements inside a worksheet is fixed by the schema, not a
 * matter of taste. Excel does not reject a part with them out of order — it
 * offers to "repair" the file and throws the offending part away, which is
 * what a workbook that looks corrupt to the office actually is.
 */

import { deflateRawSync } from "node:zlib";

import { MACHINE_NOTICE } from "./pdf";

import { COMPANY_NAME, generatedStamp } from "./brand";
import { RADO_LOGO_PNG_BASE64 } from "./brand-logo";

export type CellValue = string | number | null | undefined;

export interface SheetColumn {
  header: string;
  /** Width in characters, roughly. */
  width?: number;
  /** Money and hours read wrong without their format. */
  format?: "text" | "number" | "money" | "hours" | "date";
}

/**
 * One line of a sheet: a data row, a department heading, or the bold line
 * that closes a department with its own totals.
 */
export type SheetRow = CellValue[] | { group: string } | { subtotal: CellValue[] };

export interface Sheet {
  name: string;
  title?: string;
  /** A second, smaller line under the title — the date range, the scope. */
  subtitle?: string;
  columns: SheetColumn[];
  rows: SheetRow[];
  /** Appended below the rows, bolded, for a totals line. */
  totals?: CellValue[] | undefined;
  /** Printing orientation. Wide registers print landscape. Default landscape. */
  orientation?: "portrait" | "landscape";
}

type Format = NonNullable<SheetColumn["format"]>;

/*
 * Style indices, in the order they are written into styles.xml below. Kept as
 * named constants because a cell references a style by position, and an
 * off-by-one silently formats money as a date.
 */
const STYLE = {
  base: 0,
  company: 1,
  title: 2,
  subtitle: 3,
  header: 4,
  group: 15,
} as const;

const DATA_STYLE: Record<Format, number> = { text: 5, number: 6, money: 7, hours: 8, date: 9 };
const ZEBRA_STYLE: Record<Format, number> = {
  text: 10,
  number: 11,
  money: 12,
  hours: 13,
  date: 14,
};
const SUBTOTAL_STYLE: Record<Format, number> = {
  text: 16,
  number: 17,
  money: 18,
  hours: 19,
  date: 16,
};
const TOTAL_STYLE: Record<Format, number> = {
  text: 20,
  number: 21,
  money: 22,
  hours: 23,
  date: 20,
};

const escapeXml = (value: string) =>
  value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    // Excel rejects most control characters, and unpaired surrogates, outright
    // rather than ignoring them — the whole workbook fails to open.
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\ufffe\uffff]/g, "")
    .replace(/[\ud800-\udbff](?![\udc00-\udfff])|(?<![\ud800-\udbff])[\udc00-\udfff]/g, "");

/** A1, B1 … AA1. Spreadsheets are base-26 with no zero, so this is not modulo. */
function columnName(index: number): string {
  let name = "";
  let n = index;
  while (n >= 0) {
    name = String.fromCharCode(65 + (n % 26)) + name;
    n = Math.floor(n / 26) - 1;
  }
  return name;
}

/**
 * A sheet name Excel will accept.
 *
 * Excel refuses to open a workbook whose sheet name carries any of : \ / ? * [ ]
 * or runs past 31 characters — and reports it as "unreadable content" rather
 * than naming the sheet, so a department called "Auto 01/02" would produce a
 * file that simply fails to open.
 */
function safeSheetName(name: string): string {
  const cleaned = name.replace(/[:\\/?*[\]]/g, "-").slice(0, 31);
  return cleaned || "Sheet1";
}

function cellXml(value: CellValue, ref: string, styleIndex: number): string {
  if (value === null || value === undefined || value === "") {
    return `<c r="${ref}" s="${styleIndex}"/>`;
  }

  if (typeof value === "number") {
    // NaN or Infinity written as a number is a corrupt cell; as text it is a lie.
    return Number.isFinite(value)
      ? `<c r="${ref}" s="${styleIndex}"><v>${value}</v></c>`
      : `<c r="${ref}" s="${styleIndex}"/>`;
  }

  // Inline strings rather than a shared table: one pass, no second dictionary
  // to keep in step, and the size difference is irrelevant at report scale.
  return `<c r="${ref}" s="${styleIndex}" t="inlineStr"><is><t xml:space="preserve">${escapeXml(String(value))}</t></is></c>`;
}

const isGroup = (row: SheetRow): row is { group: string } => !Array.isArray(row) && "group" in row;
const isSubtotal = (row: SheetRow): row is { subtotal: CellValue[] } =>
  !Array.isArray(row) && "subtotal" in row;

/** Logo size in pixels, and where the letterhead text starts to clear it. */
const LOGO_PX = 54;
const EMU_PER_PX = 9525;

/** Excel's column width in characters → pixels at the default font. */
const widthToPx = (width: number) => Math.floor(width * 7 + 5);

/** The data a sheet part needs beyond its XML: where the header row landed. */
interface SheetLayout {
  xml: string;
  headerRow: number;
  lastDataRow: number;
  lastColumn: string;
}

function sheetXml(sheet: Sheet): SheetLayout {
  const columns = sheet.columns.length > 0 ? sheet.columns : [{ header: "" }];
  const lastIndex = columns.length - 1;
  const lastColumn = columnName(lastIndex);
  const rows: string[] = [];
  const merges: string[] = [];

  /*
   * The letterhead text starts at the first column clear of the logo, so the
   * two never overlap whatever widths the table asked for.
   */
  let textColumn = 0;
  let px = 0;
  while (textColumn < lastIndex && px < LOGO_PX + 10) {
    px += widthToPx(columns[textColumn]!.width ?? 16);
    textColumn++;
  }
  const from = columnName(textColumn);

  const letterhead: [string, number, number][] = [
    [COMPANY_NAME, STYLE.company, 26],
    [sheet.title ?? sheet.name, STYLE.title, 19],
    [
      sheet.subtitle ? `${sheet.subtitle}  ·  ${generatedStamp()}` : generatedStamp(),
      STYLE.subtitle,
      16,
    ],
  ];

  letterhead.forEach(([text, style, height], i) => {
    const r = i + 1;
    rows.push(
      `<row r="${r}" ht="${height}" customHeight="1">` +
        cellXml(text, `${from}${r}`, style) +
        `</row>`,
    );
    if (textColumn < lastIndex) merges.push(`${from}${r}:${lastColumn}${r}`);
  });
  rows.push(`<row r="4" ht="8" customHeight="1"/>`);

  const headerRow = 5;
  rows.push(
    `<row r="${headerRow}" ht="30" customHeight="1">` +
      columns
        .map((c, i) => cellXml(c.header, `${columnName(i)}${headerRow}`, STYLE.header))
        .join("") +
      `</row>`,
  );

  let rowIndex = headerRow + 1;
  let zebra = 0;

  for (const row of sheet.rows) {
    if (isGroup(row)) {
      rows.push(
        `<row r="${rowIndex}" ht="18" customHeight="1">` +
          columns
            .map((_, i) =>
              cellXml(i === 0 ? row.group : null, `${columnName(i)}${rowIndex}`, STYLE.group),
            )
            .join("") +
          `</row>`,
      );
      merges.push(`A${rowIndex}:${lastColumn}${rowIndex}`);
      zebra = 0;
    } else if (isSubtotal(row)) {
      rows.push(
        `<row r="${rowIndex}">` +
          columns
            .map((column, i) =>
              cellXml(
                row.subtotal[i] ?? null,
                `${columnName(i)}${rowIndex}`,
                SUBTOTAL_STYLE[column.format ?? "text"],
              ),
            )
            .join("") +
          `</row>`,
      );
    } else {
      const styles = zebra++ % 2 === 1 ? ZEBRA_STYLE : DATA_STYLE;
      rows.push(
        `<row r="${rowIndex}">` +
          columns
            .map((column, i) =>
              cellXml(
                row[i] ?? null,
                `${columnName(i)}${rowIndex}`,
                styles[column.format ?? "text"],
              ),
            )
            .join("") +
          `</row>`,
      );
    }
    rowIndex++;
  }

  const lastDataRow = Math.max(headerRow, rowIndex - 1);

  if (sheet.totals) {
    rows.push(
      `<row r="${rowIndex}" ht="20" customHeight="1">` +
        columns
          .map((column, i) =>
            cellXml(
              sheet.totals![i] ?? null,
              `${columnName(i)}${rowIndex}`,
              TOTAL_STYLE[column.format ?? "text"],
            ),
          )
          .join("") +
        `</row>`,
    );
    rowIndex++;
  }

  const lastRow = Math.max(headerRow, rowIndex - 1);

  const cols = columns
    .map((c, i) => `<col min="${i + 1}" max="${i + 1}" width="${c.width ?? 16}" customWidth="1"/>`)
    .join("");

  // Freeze above the first data row, so headers stay put while scrolling.
  const freeze =
    `<pane ySplit="${headerRow}" topLeftCell="A${headerRow + 1}" activePane="bottomLeft" state="frozen"/>` +
    `<selection pane="bottomLeft" activeCell="A${headerRow + 1}" sqref="A${headerRow + 1}"/>`;

  const mergeXml =
    merges.length > 0
      ? `<mergeCells count="${merges.length}">${merges.map((ref) => `<mergeCell ref="${ref}"/>`).join("")}</mergeCells>`
      : "";

  // `&` begins a header/footer code, so every ampersand in the sentence is
  // doubled — the company's own included.
  const footer = escapeXml(`&L${MACHINE_NOTICE.replace(/&/g, "&&")}&RPage &P of &N`);

  const xml =
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
    `<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" ` +
    `xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">` +
    `<sheetPr><pageSetUpPr fitToPage="1"/></sheetPr>` +
    `<dimension ref="A1:${lastColumn}${lastRow}"/>` +
    `<sheetViews><sheetView workbookViewId="0" showGridLines="0">${freeze}</sheetView></sheetViews>` +
    `<sheetFormatPr defaultRowHeight="15"/>` +
    `<cols>${cols}</cols>` +
    `<sheetData>${rows.join("")}</sheetData>` +
    // Schema order: autoFilter, then mergeCells, then the print settings, then
    // the drawing. Any other order is a file Excel "repairs".
    `<autoFilter ref="A${headerRow}:${lastColumn}${lastDataRow}"/>` +
    mergeXml +
    `<printOptions horizontalCentered="1"/>` +
    `<pageMargins left="0.4" right="0.4" top="0.5" bottom="0.6" header="0.25" footer="0.3"/>` +
    `<pageSetup paperSize="9" orientation="${sheet.orientation ?? "landscape"}" fitToWidth="1" fitToHeight="0"/>` +
    `<headerFooter><oddFooter>${footer}</oddFooter></headerFooter>` +
    `<drawing r:id="rId1"/>` +
    `</worksheet>`;

  return { xml, headerRow, lastDataRow, lastColumn };
}

function drawingXml(): string {
  const size = LOGO_PX * EMU_PER_PX;
  return (
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
    `<xdr:wsDr xmlns:xdr="http://schemas.openxmlformats.org/drawingml/2006/spreadsheetDrawing" ` +
    `xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" ` +
    `xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">` +
    `<xdr:oneCellAnchor>` +
    `<xdr:from><xdr:col>0</xdr:col><xdr:colOff>${4 * EMU_PER_PX}</xdr:colOff><xdr:row>0</xdr:row><xdr:rowOff>${4 * EMU_PER_PX}</xdr:rowOff></xdr:from>` +
    `<xdr:ext cx="${size}" cy="${Math.round((size * 147) / 150)}"/>` +
    `<xdr:pic>` +
    `<xdr:nvPicPr><xdr:cNvPr id="2" name="Rado logo" descr="Rado Dyeing and Textile"/>` +
    `<xdr:cNvPicPr><a:picLocks noChangeAspect="1"/></xdr:cNvPicPr></xdr:nvPicPr>` +
    `<xdr:blipFill><a:blip r:embed="rId1"/><a:stretch><a:fillRect/></a:stretch></xdr:blipFill>` +
    `<xdr:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="${size}" cy="${Math.round((size * 147) / 150)}"/></a:xfrm>` +
    `<a:prstGeom prst="rect"><a:avLst/></a:prstGeom></xdr:spPr>` +
    `</xdr:pic>` +
    `<xdr:clientData/>` +
    `</xdr:oneCellAnchor>` +
    `</xdr:wsDr>`
  );
}

/** The style table. Order here defines the indices in STYLE above. */
const STYLES_XML =
  `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
  `<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">` +
  `<numFmts count="3">` +
  // Negatives in parentheses, zero as a dash: the conventions a finance office
  // already reads without being told.
  `<numFmt numFmtId="164" formatCode="#,##0;(#,##0);&quot;-&quot;"/>` +
  `<numFmt numFmtId="165" formatCode="#,##0.00;(#,##0.00);&quot;-&quot;"/>` +
  `<numFmt numFmtId="166" formatCode="yyyy-mm-dd"/>` +
  `</numFmts>` +
  `<fonts count="7">` +
  `<font><sz val="10"/><color rgb="FF1C1C1E"/><name val="Arial"/><family val="2"/></font>` +
  `<font><b/><sz val="16"/><color rgb="FF1C1C1E"/><name val="Arial"/><family val="2"/></font>` +
  `<font><b/><sz val="12"/><color rgb="FFE01E23"/><name val="Arial"/><family val="2"/></font>` +
  `<font><sz val="9"/><color rgb="FF6B6B70"/><name val="Arial"/><family val="2"/></font>` +
  `<font><b/><sz val="10"/><color rgb="FFFFFFFF"/><name val="Arial"/><family val="2"/></font>` +
  `<font><b/><sz val="10"/><color rgb="FF9E1217"/><name val="Arial"/><family val="2"/></font>` +
  `<font><b/><sz val="10"/><color rgb="FF1C1C1E"/><name val="Arial"/><family val="2"/></font>` +
  `</fonts>` +
  `<fills count="6">` +
  `<fill><patternFill patternType="none"/></fill>` +
  `<fill><patternFill patternType="gray125"/></fill>` +
  `<fill><patternFill patternType="solid"><fgColor rgb="FF232326"/><bgColor indexed="64"/></patternFill></fill>` +
  `<fill><patternFill patternType="solid"><fgColor rgb="FFF4F3F1"/><bgColor indexed="64"/></patternFill></fill>` +
  `<fill><patternFill patternType="solid"><fgColor rgb="FFFAFAF8"/><bgColor indexed="64"/></patternFill></fill>` +
  `<fill><patternFill patternType="solid"><fgColor rgb="FFFDEEEE"/><bgColor indexed="64"/></patternFill></fill>` +
  `</fills>` +
  `<borders count="4">` +
  `<border><left/><right/><top/><bottom/><diagonal/></border>` +
  `<border><left/><right/><top/><bottom style="hair"><color rgb="FFD9D9D9"/></bottom><diagonal/></border>` +
  `<border><left/><right/><top style="thin"><color rgb="FF232326"/></top><bottom style="thin"><color rgb="FF232326"/></bottom><diagonal/></border>` +
  `<border><left/><right/><top/><bottom style="medium"><color rgb="FFE01E23"/></bottom><diagonal/></border>` +
  `</borders>` +
  `<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>` +
  `<cellXfs count="24">` +
  // 0 base
  `<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>` +
  // 1 company, 2 title, 3 subtitle
  `<xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1" applyAlignment="1"><alignment vertical="center"/></xf>` +
  `<xf numFmtId="0" fontId="2" fillId="0" borderId="0" xfId="0" applyFont="1" applyAlignment="1"><alignment vertical="center"/></xf>` +
  `<xf numFmtId="0" fontId="3" fillId="0" borderId="0" xfId="0" applyFont="1" applyAlignment="1"><alignment vertical="center"/></xf>` +
  // 4 header: white on charcoal, a red rule under it
  `<xf numFmtId="0" fontId="4" fillId="2" borderId="3" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="center" vertical="center" wrapText="1"/></xf>` +
  // 5–9 data: text, number, money, hours, date
  `<xf numFmtId="0" fontId="0" fillId="0" borderId="1" xfId="0" applyBorder="1" applyAlignment="1"><alignment vertical="center"/></xf>` +
  `<xf numFmtId="164" fontId="0" fillId="0" borderId="1" xfId="0" applyNumberFormat="1" applyBorder="1"/>` +
  `<xf numFmtId="164" fontId="0" fillId="0" borderId="1" xfId="0" applyNumberFormat="1" applyBorder="1"/>` +
  `<xf numFmtId="165" fontId="0" fillId="0" borderId="1" xfId="0" applyNumberFormat="1" applyBorder="1"/>` +
  `<xf numFmtId="166" fontId="0" fillId="0" borderId="1" xfId="0" applyNumberFormat="1" applyBorder="1"/>` +
  // 10–14 the same, banded
  `<xf numFmtId="0" fontId="0" fillId="4" borderId="1" xfId="0" applyFill="1" applyBorder="1" applyAlignment="1"><alignment vertical="center"/></xf>` +
  `<xf numFmtId="164" fontId="0" fillId="4" borderId="1" xfId="0" applyNumberFormat="1" applyFill="1" applyBorder="1"/>` +
  `<xf numFmtId="164" fontId="0" fillId="4" borderId="1" xfId="0" applyNumberFormat="1" applyFill="1" applyBorder="1"/>` +
  `<xf numFmtId="165" fontId="0" fillId="4" borderId="1" xfId="0" applyNumberFormat="1" applyFill="1" applyBorder="1"/>` +
  `<xf numFmtId="166" fontId="0" fillId="4" borderId="1" xfId="0" applyNumberFormat="1" applyFill="1" applyBorder="1"/>` +
  // 15 department heading
  `<xf numFmtId="0" fontId="5" fillId="5" borderId="0" xfId="0" applyFont="1" applyFill="1" applyAlignment="1"><alignment vertical="center"/></xf>` +
  // 16–19 subtotal: text, number, money, hours
  `<xf numFmtId="0" fontId="6" fillId="3" borderId="2" xfId="0" applyFont="1" applyFill="1" applyBorder="1"/>` +
  `<xf numFmtId="164" fontId="6" fillId="3" borderId="2" xfId="0" applyNumberFormat="1" applyFont="1" applyFill="1" applyBorder="1"/>` +
  `<xf numFmtId="164" fontId="6" fillId="3" borderId="2" xfId="0" applyNumberFormat="1" applyFont="1" applyFill="1" applyBorder="1"/>` +
  `<xf numFmtId="165" fontId="6" fillId="3" borderId="2" xfId="0" applyNumberFormat="1" applyFont="1" applyFill="1" applyBorder="1"/>` +
  // 20–23 grand total: white on charcoal
  `<xf numFmtId="0" fontId="4" fillId="2" borderId="0" xfId="0" applyFont="1" applyFill="1" applyAlignment="1"><alignment vertical="center"/></xf>` +
  `<xf numFmtId="164" fontId="4" fillId="2" borderId="0" xfId="0" applyNumberFormat="1" applyFont="1" applyFill="1"/>` +
  `<xf numFmtId="164" fontId="4" fillId="2" borderId="0" xfId="0" applyNumberFormat="1" applyFont="1" applyFill="1"/>` +
  `<xf numFmtId="165" fontId="4" fillId="2" borderId="0" xfId="0" applyNumberFormat="1" applyFont="1" applyFill="1"/>` +
  `</cellXfs>` +
  `<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>` +
  `</styleSheet>`;

// ---------------------------------------------------------------------------
// Zip
// ---------------------------------------------------------------------------

const CRC_TABLE = (() => {
  const table = new Int32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c;
  }
  return table;
})();

function crc32(buf: Buffer): number {
  let c = -1;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]!) & 0xff]! ^ (c >>> 8);
  return (c ^ -1) >>> 0;
}

/** Builds a zip from name → contents, deflating each entry. */
function zip(entries: { name: string; data: Buffer }[]): Buffer {
  const locals: Buffer[] = [];
  const centrals: Buffer[] = [];
  let offset = 0;

  for (const entry of entries) {
    const nameBuf = Buffer.from(entry.name, "utf8");
    const deflated = deflateRawSync(entry.data, { level: 9 });
    const crc = crc32(entry.data);

    const local = Buffer.alloc(30 + nameBuf.length);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4); // version needed
    local.writeUInt16LE(0, 6); // flags
    local.writeUInt16LE(8, 8); // deflate
    local.writeUInt16LE(0, 10); // time
    local.writeUInt16LE(0x2821, 12); // date — a fixed one, so output is stable
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(deflated.length, 18);
    local.writeUInt32LE(entry.data.length, 22);
    local.writeUInt16LE(nameBuf.length, 26);
    local.writeUInt16LE(0, 28);
    nameBuf.copy(local, 30);

    locals.push(local, deflated);

    const central = Buffer.alloc(46 + nameBuf.length);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(20, 4);
    central.writeUInt16LE(20, 6);
    central.writeUInt16LE(0, 8);
    central.writeUInt16LE(8, 10);
    central.writeUInt16LE(0, 12);
    central.writeUInt16LE(0x2821, 14);
    central.writeUInt32LE(crc, 16);
    central.writeUInt32LE(deflated.length, 20);
    central.writeUInt32LE(entry.data.length, 24);
    central.writeUInt16LE(nameBuf.length, 28);
    central.writeUInt16LE(0, 30);
    central.writeUInt16LE(0, 32);
    central.writeUInt16LE(0, 34);
    central.writeUInt16LE(0, 36);
    central.writeUInt32LE(0, 38);
    central.writeUInt32LE(offset, 42);
    nameBuf.copy(central, 46);
    centrals.push(central);

    offset += local.length + deflated.length;
  }

  const centralBuf = Buffer.concat(centrals);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(entries.length, 8);
  end.writeUInt16LE(entries.length, 10);
  end.writeUInt32LE(centralBuf.length, 12);
  end.writeUInt32LE(offset, 16);

  return Buffer.concat([...locals, centralBuf, end]);
}

const REL = "http://schemas.openxmlformats.org/officeDocument/2006/relationships";

/** Builds a workbook from one or more sheets. */
export function buildWorkbook(sheets: Sheet[]): Buffer {
  if (sheets.length === 0) throw new Error("A workbook needs at least one sheet.");

  const names = sheets.map((s, i) => {
    const name = safeSheetName(s.name);
    // Excel also refuses two sheets with the same name.
    return sheets.slice(0, i).some((o) => safeSheetName(o.name) === name)
      ? `${name.slice(0, 28)}-${i + 1}`
      : name;
  });

  const layouts = sheets.map(sheetXml);

  // Quoted as a formula reference: apostrophes inside the name are doubled.
  const ref = (name: string) => `'${name.replace(/'/g, "''")}'`;
  const definedNames = layouts
    .flatMap((layout, i) => [
      `<definedName name="_xlnm._FilterDatabase" localSheetId="${i}" hidden="1">${escapeXml(
        `${ref(names[i]!)}!$A$${layout.headerRow}:$${layout.lastColumn}$${layout.lastDataRow}`,
      )}</definedName>`,
      `<definedName name="_xlnm.Print_Titles" localSheetId="${i}">${escapeXml(
        `${ref(names[i]!)}!$${layout.headerRow}:$${layout.headerRow}`,
      )}</definedName>`,
    ])
    .join("");

  const workbook =
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
    `<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="${REL}">` +
    `<bookViews><workbookView xWindow="0" yWindow="0" windowWidth="28800" windowHeight="15000"/></bookViews>` +
    `<sheets>` +
    names
      .map((name, i) => `<sheet name="${escapeXml(name)}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`)
      .join("") +
    `</sheets>` +
    `<definedNames>${definedNames}</definedNames>` +
    `</workbook>`;

  const workbookRels =
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
    `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">` +
    sheets
      .map(
        (_, i) =>
          `<Relationship Id="rId${i + 1}" Type="${REL}/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`,
      )
      .join("") +
    `<Relationship Id="rId${sheets.length + 1}" Type="${REL}/styles" Target="styles.xml"/>` +
    `</Relationships>`;

  const contentTypes =
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
    `<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">` +
    `<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>` +
    `<Default Extension="xml" ContentType="application/xml"/>` +
    `<Default Extension="png" ContentType="image/png"/>` +
    `<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>` +
    sheets
      .map(
        (_, i) =>
          `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>` +
          `<Override PartName="/xl/drawings/drawing${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.drawing+xml"/>`,
      )
      .join("") +
    `<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>` +
    `<Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/>` +
    `<Override PartName="/docProps/app.xml" ContentType="application/vnd.openxmlformats-officedocument.extended-properties+xml"/>` +
    `</Types>`;

  const rootRels =
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
    `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">` +
    `<Relationship Id="rId1" Type="${REL}/officeDocument" Target="xl/workbook.xml"/>` +
    `<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/>` +
    `<Relationship Id="rId3" Type="${REL}/extended-properties" Target="docProps/app.xml"/>` +
    `</Relationships>`;

  const created = `${new Date().toISOString().slice(0, 19)}Z`;
  const core =
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
    `<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" ` +
    `xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" ` +
    `xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">` +
    `<dc:title>${escapeXml(sheets[0]!.title ?? sheets[0]!.name)}</dc:title>` +
    `<dc:creator>Rado Dyeing &amp; Textile</dc:creator>` +
    `<cp:lastModifiedBy>RadoFlow</cp:lastModifiedBy>` +
    `<dcterms:created xsi:type="dcterms:W3CDTF">${created}</dcterms:created>` +
    `<dcterms:modified xsi:type="dcterms:W3CDTF">${created}</dcterms:modified>` +
    `</cp:coreProperties>`;

  const app =
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
    `<Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties">` +
    `<Application>RadoFlow</Application><Company>Rado Dyeing &amp; Textile</Company>` +
    `</Properties>`;

  const logo = Buffer.from(RADO_LOGO_PNG_BASE64, "base64");

  const entries = [
    { name: "[Content_Types].xml", data: Buffer.from(contentTypes, "utf8") },
    { name: "_rels/.rels", data: Buffer.from(rootRels, "utf8") },
    { name: "docProps/core.xml", data: Buffer.from(core, "utf8") },
    { name: "docProps/app.xml", data: Buffer.from(app, "utf8") },
    { name: "xl/workbook.xml", data: Buffer.from(workbook, "utf8") },
    { name: "xl/_rels/workbook.xml.rels", data: Buffer.from(workbookRels, "utf8") },
    { name: "xl/styles.xml", data: Buffer.from(STYLES_XML, "utf8") },
    { name: "xl/media/rado-logo.png", data: logo },
    ...layouts.flatMap((layout, i) => [
      { name: `xl/worksheets/sheet${i + 1}.xml`, data: Buffer.from(layout.xml, "utf8") },
      {
        name: `xl/worksheets/_rels/sheet${i + 1}.xml.rels`,
        data: Buffer.from(
          `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
            `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">` +
            `<Relationship Id="rId1" Type="${REL}/drawing" Target="../drawings/drawing${i + 1}.xml"/>` +
            `</Relationships>`,
          "utf8",
        ),
      },
      { name: `xl/drawings/drawing${i + 1}.xml`, data: Buffer.from(drawingXml(), "utf8") },
      {
        name: `xl/drawings/_rels/drawing${i + 1}.xml.rels`,
        data: Buffer.from(
          `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
            `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">` +
            `<Relationship Id="rId1" Type="${REL}/image" Target="../media/rado-logo.png"/>` +
            `</Relationships>`,
          "utf8",
        ),
      },
    ]),
  ];

  return zip(entries);
}
