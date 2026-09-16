/**
 * A minimal PDF writer, for payslips and report tables.
 *
 * A PDF is a text format with a byte-offset index at the end, so it can be
 * assembled directly. This supports what these documents need — the two
 * built-in Helvetica faces, text, rules, filled bands, one embedded image (the
 * company mark), and pagination — and nothing more.
 *
 * Written by hand rather than pulled in for the same reason as the workbook
 * writer: a table with a header on it does not justify several megabytes of
 * dependency, and this runs on every request that asks for a download.
 *
 * Text is encoded WinAnsi, which is what the built-in fonts speak. The rupee
 * sign is not in that character set, so amounts are written "Rs" — a document
 * that renders a placeholder glyph is worse than one that spells it out.
 */

import { deflateSync } from "node:zlib";

import { COMPANY_NAME, generatedStamp } from "./brand";
import { RADO_LOGO_PNG_BASE64 } from "./brand-logo";
import { decodePng } from "./png";
import { rupeesInWords } from "./words";

export interface Column {
  header: string;
  /** Relative width in points; the table is scaled to fill the page. */
  width: number;
  align?: "left" | "right" | "center";
}

/**
 * One line of a table.
 *
 * A plain array is a data row. The two object forms are what a register
 * printed by department needs: a heading that opens a department, and the
 * bold line that closes it with its own totals.
 */
export type TableRow = (string | number)[] | { group: string } | { subtotal: (string | number)[] };

export interface TableDoc {
  title: string;
  subtitle?: string | undefined;
  columns: Column[];
  rows: TableRow[];
  totals?: (string | number)[] | undefined;
  /** Printed small at the foot of every page. */
  footer?: string | undefined;
  /** Wide registers — the payroll sheet has fourteen columns — go landscape. */
  orientation?: "portrait" | "landscape" | undefined;
  /** Headline figures in boxes above the table, on the first page only. */
  highlights?: { label: string; value: string }[] | undefined;
}

interface Rgb {
  r: number;
  g: number;
  b: number;
}

const INK: Rgb = { r: 0.11, g: 0.11, b: 0.12 };
const MUTED: Rgb = { r: 0.42, g: 0.42, b: 0.44 };
const WHITE: Rgb = { r: 1, g: 1, b: 1 };
/** The red of the Rado mark. */
const RED: Rgb = { r: 0.878, g: 0.118, b: 0.137 };
const RED_DEEP: Rgb = { r: 0.62, g: 0.07, b: 0.09 };
const RED_TINT: Rgb = { r: 0.992, g: 0.933, b: 0.933 };
const BAND: Rgb = { r: 0.137, g: 0.137, b: 0.149 };
const TINT: Rgb = { r: 0.957, g: 0.953, b: 0.945 };
const ZEBRA: Rgb = { r: 0.982, g: 0.98, b: 0.975 };
const HAIRLINE = 0.88;

const MARGIN = 36;
const PORTRAIT = { width: 595, height: 842 };
const LANDSCAPE = { width: 842, height: 595 };

/*
 * Glyph widths of the two built-in faces for printable ASCII, in thousandths
 * of the font size, from Adobe's published metrics. Right-aligned money only
 * lines up when it is measured with the real widths — an average character
 * width puts "1,111" and "8,888" at visibly different right edges.
 */
// prettier-ignore
const HELVETICA = [
  278,278,355,556,556,889,667,191,333,333,389,584,278,333,278,278,556,556,556,556,556,556,556,556,556,556,278,278,584,584,584,556,
  1015,667,667,722,722,667,611,778,722,278,500,667,556,833,722,778,667,778,722,667,611,722,667,944,667,667,611,278,278,278,469,556,
  333,556,556,500,556,556,278,556,556,222,222,500,222,833,556,556,556,556,333,500,278,556,500,722,500,500,500,334,260,334,584,
];
// prettier-ignore
const HELVETICA_BOLD = [
  278,333,474,556,556,889,722,238,333,333,389,584,278,333,278,278,556,556,556,556,556,556,556,556,556,556,333,333,584,584,584,611,
  975,722,722,722,722,667,611,778,722,278,556,722,611,833,722,778,667,778,722,667,611,722,667,944,667,667,611,333,278,333,584,556,
  333,556,611,556,611,556,333,611,611,278,278,556,278,889,611,611,611,611,389,556,333,611,556,778,556,556,500,389,280,389,584,
];

/** Escapes the three characters that terminate or nest a PDF string. */
function pdfString(text: string): string {
  return text.replace(/\\/g, "\\\\").replace(/\(/g, "\\(").replace(/\)/g, "\\)");
}

/**
 * Drops anything the built-in fonts cannot encode.
 *
 * A character outside WinAnsi does not raise an error — the viewer renders a
 * blank or a wrong glyph, so a name with an unusual mark would silently print
 * as something else. Replacing it with a question mark makes the loss visible.
 */
function toWinAnsi(text: string): string {
  return text
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/[–—]/g, "-")
    .replace(/…/g, "...")
    .replace(/₨/g, "Rs")
    .replace(/[^\x20-\x7e\xa0-\xff]/g, "?");
}

export function textWidth(text: string, size: number, bold = false): number {
  const table = bold ? HELVETICA_BOLD : HELVETICA;
  let units = 0;
  for (const char of toWinAnsi(text)) {
    const code = char.charCodeAt(0);
    units += code >= 32 && code <= 126 ? table[code - 32]! : 556;
  }
  return (units * size) / 1000;
}

function truncate(text: string, size: number, maxWidth: number, bold = false): string {
  const clean = toWinAnsi(text);
  if (textWidth(clean, size, bold) <= maxWidth) return clean;
  let cut = clean;
  while (cut.length > 1 && textWidth(`${cut}...`, size, bold) > maxWidth) cut = cut.slice(0, -1);
  return `${cut.trimEnd()}...`;
}

const fmt = (value: string | number) =>
  typeof value === "number"
    ? value.toLocaleString("en-PK", { maximumFractionDigits: 2 })
    : String(value);

/** Rupees, whole, grouped: "Rs 46,585". */
export const rs = (value: number) =>
  `Rs ${Math.round(value).toLocaleString("en-PK", { maximumFractionDigits: 0 })}`;

/** The content stream for one page, plus drawing helpers. */
class Page {
  ops: string[] = [];
  // Plain fields rather than constructor parameter properties: the scripts
  // load this file through Node's type stripping, which cannot erase those.
  readonly width: number;
  readonly height: number;

  constructor(width: number, height: number) {
    this.width = width;
    this.height = height;
  }

  text(x: number, y: number, value: string, size = 9, bold = false, colour: Rgb = INK) {
    const font = bold ? "/F2" : "/F1";
    this.ops.push(
      `BT ${font} ${size} Tf ${colour.r} ${colour.g} ${colour.b} rg ${x.toFixed(2)} ${y.toFixed(2)} Td (${pdfString(toWinAnsi(value))}) Tj ET`,
    );
  }

  rightText(right: number, y: number, value: string, size = 9, bold = false, colour: Rgb = INK) {
    this.text(right - textWidth(value, size, bold), y, value, size, bold, colour);
  }

  centreText(centre: number, y: number, value: string, size = 9, bold = false, colour = INK) {
    this.text(centre - textWidth(value, size, bold) / 2, y, value, size, bold, colour);
  }

  rect(x: number, y: number, w: number, h: number, colour: Rgb) {
    this.ops.push(
      `${colour.r} ${colour.g} ${colour.b} rg ${x.toFixed(2)} ${y.toFixed(2)} ${w.toFixed(2)} ${h.toFixed(2)} re f`,
    );
  }

  line(x1: number, y1: number, x2: number, y2: number, grey = 0.8, width = 0.5) {
    this.ops.push(
      `${grey} G ${width} w ${x1.toFixed(2)} ${y1.toFixed(2)} m ${x2.toFixed(2)} ${y2.toFixed(2)} l S`,
    );
  }

  colourLine(x1: number, y1: number, x2: number, y2: number, colour: Rgb, width = 1) {
    this.ops.push(
      `${colour.r} ${colour.g} ${colour.b} RG ${width} w ${x1.toFixed(2)} ${y1.toFixed(2)} m ${x2.toFixed(2)} ${y2.toFixed(2)} l S`,
    );
  }

  /** Draws the company mark, `size` points tall. */
  logo(x: number, y: number, size: number) {
    const w = (size * LOGO.width) / LOGO.height;
    this.ops.push(`q ${w.toFixed(2)} 0 0 ${size} ${x.toFixed(2)} ${y.toFixed(2)} cm /Logo Do Q`);
  }

  /**
   * The factory's mark, faint and centred behind the page.
   *
   * Drawn before anything else so the table and its figures sit on top of it,
   * and through `/GSW` — a fill alpha of a few percent — so it marks the paper
   * as Rado's without competing with a single figure on it.
   */
  watermark() {
    const size = this.width * 0.62;
    const w = (size * LOGO.width) / LOGO.height;
    const x = (this.width - w) / 2;
    const y = (this.height - size) / 2;
    this.ops.push(
      `q /GSW gs ${w.toFixed(2)} 0 0 ${size.toFixed(2)} ${x.toFixed(2)} ${y.toFixed(2)} cm /Logo Do Q`,
    );
  }

  toString() {
    return this.ops.join("\n");
  }
}

/*
 * Decoded once per process. The mark never changes between requests, and
 * inflating and unfiltering 22,000 pixels on every payslip is waste.
 */
/** How much of the mark shows through as a watermark. */
const WATERMARK_ALPHA = 0.06;

const LOGO = (() => {
  const decoded = decodePng(Buffer.from(RADO_LOGO_PNG_BASE64, "base64"));
  return {
    width: decoded.width,
    height: decoded.height,
    rgb: deflateSync(decoded.rgb),
    alpha: decoded.alpha ? deflateSync(decoded.alpha) : null,
  };
})();

function pdfDate(when: Date): string {
  const p = (n: number) => String(n).padStart(2, "0");
  return `D:${when.getUTCFullYear()}${p(when.getUTCMonth() + 1)}${p(when.getUTCDate())}${p(when.getUTCHours())}${p(when.getUTCMinutes())}${p(when.getUTCSeconds())}Z`;
}

/** Assembles pages into a PDF file with a correct cross-reference table. */
function assemble(pages: Page[], title: string): Buffer {
  // Kept as byte strings throughout: latin1 maps every byte to one char, so
  // binary image data survives the round trip and lengths are char counts.
  const objects: string[] = [];
  const pageCount = Math.max(1, pages.length);
  const size = pages[0] ?? new Page(PORTRAIT.width, PORTRAIT.height);

  // 1 catalog, 2 pages, 3–4 fonts, 5–6 logo and its mask, 7 the watermark's
  // transparency, 8 info, then pages.
  const firstPageObj = 9;
  const pageIds = pages.map((_, i) => firstPageObj + i * 2);

  objects[1] = `<< /Type /Catalog /Pages 2 0 R >>`;
  objects[2] = `<< /Type /Pages /Count ${pageCount} /Kids [${pageIds.map((id) => `${id} 0 R`).join(" ")}] >>`;
  objects[3] = `<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>`;
  objects[4] = `<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>`;

  const mask = LOGO.alpha ? ` /SMask 6 0 R` : "";
  objects[5] =
    `<< /Type /XObject /Subtype /Image /Width ${LOGO.width} /Height ${LOGO.height} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /FlateDecode${mask} /Length ${LOGO.rgb.length} >>\n` +
    `stream\n${LOGO.rgb.toString("latin1")}\nendstream`;
  objects[6] = LOGO.alpha
    ? `<< /Type /XObject /Subtype /Image /Width ${LOGO.width} /Height ${LOGO.height} /ColorSpace /DeviceGray /BitsPerComponent 8 /Filter /FlateDecode /Length ${LOGO.alpha.length} >>\n` +
      `stream\n${LOGO.alpha.toString("latin1")}\nendstream`
    : `<< >>`;
  // What makes the watermark faint: a fill alpha the mark is painted through.
  objects[7] = `<< /Type /ExtGState /ca ${WATERMARK_ALPHA} /CA ${WATERMARK_ALPHA} >>`;
  objects[8] =
    `<< /Title (${pdfString(toWinAnsi(title))}) /Author (Rado Dyeing & Textile) ` +
    `/Creator (RadoFlow) /Producer (RadoFlow) /CreationDate (${pdfDate(new Date())}) >>`;

  pages.forEach((page, i) => {
    const id = pageIds[i]!;
    const streamId = id + 1;
    const content = page.toString();

    objects[id] =
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${size.width} ${size.height}] ` +
      `/Resources << /Font << /F1 3 0 R /F2 4 0 R >> /XObject << /Logo 5 0 R >> ` +
      `/ExtGState << /GSW 7 0 R >> >> /Contents ${streamId} 0 R >>`;
    objects[streamId] =
      `<< /Length ${Buffer.byteLength(content, "latin1")} >>\nstream\n${content}\nendstream`;
  });

  // The second line marks the file as binary for transfer tools that sniff.
  const chunks: string[] = ["%PDF-1.4\n%\xe2\xe3\xcf\xd3\n"];
  let length = chunks[0]!.length;
  const offsets: number[] = [];

  for (let i = 1; i < objects.length; i++) {
    const body = objects[i];
    if (body === undefined) continue;
    offsets[i] = length;
    const chunk = `${i} 0 obj\n${body}\nendobj\n`;
    chunks.push(chunk);
    length += chunk.length;
  }

  const xrefOffset = length;
  const count = objects.length;

  let tail = `xref\n0 ${count}\n0000000000 65535 f \n`;
  for (let i = 1; i < count; i++) {
    // Every slot must be present and exactly 20 bytes, or the file is rejected.
    tail += `${String(offsets[i] ?? 0).padStart(10, "0")} 00000 n \n`;
  }
  tail += `trailer\n<< /Size ${count} /Root 1 0 R /Info 8 0 R >>\nstartxref\n${xrefOffset}\n%%EOF`;
  chunks.push(tail);

  return Buffer.from(chunks.join(""), "latin1");
}

/**
 * The letterhead: mark, company name, document title, and a red rule.
 * Returns the y coordinate content may start below.
 */
function letterhead(page: Page, title: string, subtitle: string | undefined, continued: boolean) {
  const top = page.height - MARGIN;
  const right = page.width - MARGIN;

  page.logo(MARGIN, top - 42, 42);
  page.text(MARGIN + 52, top - 17, COMPANY_NAME, 15, true, INK);
  page.text(
    MARGIN + 52,
    top - 31,
    "Attendance · Payroll · Canteen  |  RadoFlow",
    7.5,
    false,
    MUTED,
  );

  const heading = continued ? `${title} (continued)` : title;
  page.rightText(right, top - 14, truncate(heading, 12, page.width / 2, true), 12, true, INK);
  if (subtitle) {
    page.rightText(right, top - 27, truncate(subtitle, 8.5, page.width / 2), 8.5, false, MUTED);
  }
  page.rightText(right, top - 39, generatedStamp(), 7, false, MUTED);

  page.colourLine(MARGIN, top - 50, right, top - 50, RED, 1.6);
  page.line(MARGIN, top - 53, right, top - 53, 0.2, 0.4);

  return top - 66;
}

/**
 * The one sentence every document closes on.
 *
 * It replaced a footer that also carried the period, the Sunday rule and a
 * "computer-generated" line, and — on a payslip — three signature rules for
 * preparing, approving and receiving. Nobody signs these: the document says
 * plainly that it is machine-made, which is the whole of what a recipient
 * needs, and the period is already in the letterhead above.
 */
export const MACHINE_NOTICE =
  "This document is electronically generated by an automated system for Rado Dyeing & Textile; " +
  "therefore, an official seal or signature is not required.";

function pageFooter(page: Page, pageNumber: number, pageTotal: number) {
  const y = MARGIN - 12;
  const right = page.width - MARGIN;
  page.line(MARGIN, y + 11, right, y + 11, HAIRLINE);
  page.text(
    MARGIN,
    y,
    truncate(MACHINE_NOTICE, 6.5, page.width - MARGIN * 2 - 60),
    6.5,
    false,
    MUTED,
  );
  page.rightText(right, y, `Page ${pageNumber} of ${pageTotal}`, 7, false, MUTED);
}

function drawHighlights(page: Page, y: number, items: { label: string; value: string }[]) {
  const gap = 8;
  const usable = page.width - MARGIN * 2;
  const w = (usable - gap * (items.length - 1)) / items.length;
  const h = 38;

  items.forEach((item, i) => {
    const x = MARGIN + i * (w + gap);
    page.rect(x, y - h, w, h, TINT);
    page.rect(x, y - 2, w, 2, RED);
    page.text(
      x + 8,
      y - 14,
      truncate(item.label.toUpperCase(), 6.5, w - 16, true),
      6.5,
      true,
      MUTED,
    );
    page.text(x + 8, y - 30, truncate(item.value, 12, w - 16, true), 12, true, INK);
  });

  return y - h - 12;
}

const isGroup = (row: TableRow): row is { group: string } => !Array.isArray(row) && "group" in row;
const isSubtotal = (row: TableRow): row is { subtotal: (string | number)[] } =>
  !Array.isArray(row) && "subtotal" in row;

/**
 * A paginated table.
 *
 * Rows are laid out first and the page count is known before anything is
 * drawn, so "Page 1 of 4" is right on the first page rather than only on the
 * last — which is the usual bug when pages are emitted as they fill.
 */
export function buildTablePdf(doc: TableDoc): Buffer {
  const size = doc.orientation === "landscape" ? LANDSCAPE : PORTRAIT;
  const ROW = 15;
  const HEADER = 18;
  const usableWidth = size.width - MARGIN * 2;
  const bottom = MARGIN + 14;

  // Scale the requested widths to the page rather than letting them overflow.
  const requested = doc.columns.reduce((t, c) => t + c.width, 0);
  const scale = requested > 0 ? usableWidth / requested : 1;
  const widths = doc.columns.map((c) => c.width * scale);

  const contentTop = size.height - MARGIN - 66;
  const firstTop = contentTop - (doc.highlights?.length ? 50 : 0);
  const capacity = (top: number) => Math.max(1, Math.floor((top - bottom - HEADER) / ROW));

  // Lay out rows onto pages.
  const chunks: TableRow[][] = [[]];
  for (const row of doc.rows) {
    let current = chunks[chunks.length - 1]!;
    const room = capacity(chunks.length === 1 ? firstTop : contentTop) - current.length;
    // A department heading alone at the foot of a page belongs on the next.
    if (room <= 0 || (isGroup(row) && room <= 1)) {
      current = [];
      chunks.push(current);
    }
    current.push(row);
  }
  if (doc.totals) {
    const last = chunks[chunks.length - 1]!;
    if (last.length >= capacity(chunks.length === 1 ? firstTop : contentTop)) chunks.push([]);
  }

  const drawCells = (
    page: Page,
    y: number,
    cells: (string | number)[],
    fontSize: number,
    bold: boolean,
    colour: Rgb,
  ) => {
    let x = MARGIN;
    doc.columns.forEach((column, i) => {
      const w = widths[i]!;
      const value = truncate(fmt(cells[i] ?? ""), fontSize, w - 8, bold);
      if (column.align === "right") page.rightText(x + w - 4, y, value, fontSize, bold, colour);
      else if (column.align === "center")
        page.centreText(x + w / 2, y, value, fontSize, bold, colour);
      else page.text(x + 4, y, value, fontSize, bold, colour);
      x += w;
    });
  };

  const pages = chunks.map((chunk, pageIndex) => {
    const page = new Page(size.width, size.height);
    page.watermark();
    let y = letterhead(page, doc.title, doc.subtitle, pageIndex > 0);
    if (pageIndex === 0 && doc.highlights?.length) y = drawHighlights(page, y, doc.highlights);

    // Column headings, on the dark band.
    page.rect(MARGIN, y - HEADER, usableWidth, HEADER, BAND);
    drawCells(
      page,
      y - 12,
      doc.columns.map((c) => c.header),
      7.5,
      true,
      WHITE,
    );
    y -= HEADER;

    let zebra = 0;
    for (const row of chunk) {
      if (isGroup(row)) {
        page.rect(MARGIN, y - ROW, usableWidth, ROW, RED_TINT);
        page.rect(MARGIN, y - ROW, 2.5, ROW, RED);
        page.text(
          MARGIN + 8,
          y - 10.5,
          truncate(row.group, 8.5, usableWidth - 16, true),
          8.5,
          true,
          RED_DEEP,
        );
        zebra = 0;
      } else if (isSubtotal(row)) {
        page.rect(MARGIN, y - ROW, usableWidth, ROW, TINT);
        page.line(MARGIN, y, MARGIN + usableWidth, y, 0.35, 0.6);
        drawCells(page, y - 10.5, row.subtotal, 8, true, INK);
      } else {
        if (zebra++ % 2 === 1) page.rect(MARGIN, y - ROW, usableWidth, ROW, ZEBRA);
        drawCells(page, y - 10.5, row, 8, false, INK);
        page.line(MARGIN, y - ROW, MARGIN + usableWidth, y - ROW, 0.93, 0.3);
      }
      y -= ROW;
    }

    // Totals only on the last page, where they mean the whole table.
    if (doc.totals && pageIndex === chunks.length - 1) {
      page.rect(MARGIN, y - ROW - 2, usableWidth, ROW + 2, BAND);
      drawCells(page, y - 12, doc.totals, 8.5, true, WHITE);
    }

    pageFooter(page, pageIndex + 1, chunks.length);
    return page;
  });

  return assemble(pages, doc.title);
}

export interface PayslipLineAmount {
  label: string;
  amount: number;
}

export interface PayslipDoc {
  employeeName: string;
  employeeCode: string;
  department: string;
  designation?: string | undefined;
  period: string;
  /** A stable number to quote when somebody disputes the slip. */
  reference?: string | undefined;
  /** How the pay was arrived at: salary, days, rates. */
  facts: { label: string; value: string }[];
  earnings: PayslipLineAmount[];
  deductions: PayslipLineAmount[];
  net: number;
  /** What actually left the cash box, when it has. */
  paid?: { amount: number; note?: string | undefined; on?: string | undefined } | undefined;
  /** Loans still being recovered, so the worker sees what is left. */
  loans?: { label: string; installment: number; balance: number }[] | undefined;
  footer?: string | undefined;
}

/** One person's payslip, on one page. */
export function buildPayslipPdf(slip: PayslipDoc): Buffer {
  const page = new Page(PORTRAIT.width, PORTRAIT.height);
  page.watermark();
  const left = MARGIN;
  const right = PORTRAIT.width - MARGIN;
  const usable = right - left;

  let y = letterhead(page, "SALARY SLIP", slip.period, false);

  // ---- Who ------------------------------------------------------------------
  const panelHeight = 66;
  page.rect(left, y - panelHeight, usable, panelHeight, TINT);
  page.rect(left, y - panelHeight, 3, panelHeight, RED);

  page.text(
    left + 14,
    y - 20,
    truncate(slip.employeeName, 15, usable / 2 - 20, true),
    15,
    true,
    INK,
  );
  page.text(
    left + 14,
    y - 34,
    truncate([slip.designation, slip.department].filter(Boolean).join("  ·  "), 9, usable / 2 - 20),
    9,
    false,
    MUTED,
  );

  const identity: [string, string][] = [
    ["Unique ID", slip.employeeCode],
    ["Pay period", slip.period],
    ["Payslip no.", slip.reference ?? `${slip.employeeCode}-${slip.period}`],
  ];
  const colX = left + usable / 2 + 10;
  identity.forEach(([label, value], i) => {
    const rowY = y - 18 - i * 15;
    page.text(colX, rowY, label, 8, false, MUTED);
    page.rightText(right - 12, rowY, truncate(value, 9, usable / 2 - 90, true), 9, true, INK);
  });
  y -= panelHeight + 18;

  // ---- How this was calculated ---------------------------------------------
  if (slip.facts.length > 0) {
    page.text(left, y, "How this was calculated", 9.5, true, INK);
    y -= 8;
    const perRow = 4;
    const gap = 6;
    const boxW = (usable - gap * (perRow - 1)) / perRow;
    const boxH = 32;
    slip.facts.forEach((fact, i) => {
      const col = i % perRow;
      const row = Math.floor(i / perRow);
      const x = left + col * (boxW + gap);
      const top = y - row * (boxH + gap);
      page.rect(x, top - boxH, boxW, boxH, ZEBRA);
      page.line(x, top - boxH, x + boxW, top - boxH, HAIRLINE, 0.4);
      page.text(x + 7, top - 12, truncate(fact.label, 7, boxW - 14), 7, false, MUTED);
      page.text(x + 7, top - 25, truncate(fact.value, 10, boxW - 14, true), 10, true, INK);
    });
    y -= Math.ceil(slip.facts.length / perRow) * (boxH + gap) + 14;
  }

  // ---- Earnings | Deductions ------------------------------------------------
  const halfGap = 14;
  const colW = (usable - halfGap) / 2;
  const ROW = 17;
  const lines = Math.max(slip.earnings.length, slip.deductions.length, 1);

  const column = (x: number, heading: string, items: PayslipLineAmount[], totalLabel: string) => {
    page.rect(x, y - 18, colW, 18, BAND);
    page.text(x + 8, y - 12.5, heading, 8.5, true, WHITE);
    page.rightText(x + colW - 8, y - 12.5, "AMOUNT (Rs)", 8, true, WHITE);

    let rowY = y - 18;
    let total = 0;
    for (let i = 0; i < lines; i++) {
      const item = items[i];
      if (i % 2 === 1) page.rect(x, rowY - ROW, colW, ROW, ZEBRA);
      if (item) {
        total += item.amount;
        page.text(x + 8, rowY - 11.5, truncate(item.label, 8.5, colW - 90), 8.5, false, INK);
        page.rightText(x + colW - 8, rowY - 11.5, fmt(Math.round(item.amount)), 8.5, false, INK);
      }
      page.line(x, rowY - ROW, x + colW, rowY - ROW, 0.92, 0.3);
      rowY -= ROW;
    }

    page.rect(x, rowY - ROW - 2, colW, ROW + 2, TINT);
    page.line(x, rowY, x + colW, rowY, 0.3, 0.7);
    page.text(x + 8, rowY - 12.5, totalLabel, 9, true, INK);
    page.rightText(x + colW - 8, rowY - 12.5, fmt(Math.round(total)), 9, true, INK);
    return total;
  };

  const gross = column(left, "EARNINGS", slip.earnings, "Gross salary");
  const withheld = column(left + colW + halfGap, "DEDUCTIONS", slip.deductions, "Total deductions");
  y -= 18 + lines * ROW + ROW + 2 + 16;

  // ---- Net pay --------------------------------------------------------------
  const bandH = 50;
  page.rect(left, y - bandH, usable, bandH, BAND);
  page.rect(left, y - bandH, 5, bandH, RED);
  page.text(left + 18, y - 20, "NET PAY", 10, true, WHITE);
  page.text(left + 18, y - 36, truncate(rupeesInWords(slip.net), 8, usable * 0.6), 8, false, {
    r: 0.82,
    g: 0.82,
    b: 0.84,
  });
  page.rightText(right - 16, y - 32, rs(slip.net), 20, true, WHITE);
  page.rightText(
    right - 16,
    y - 44,
    `Gross ${fmt(Math.round(gross))}  -  Deductions ${fmt(Math.round(withheld))}`,
    7,
    false,
    { r: 0.75, g: 0.75, b: 0.77 },
  );
  y -= bandH + 16;

  // ---- Paid in cash ---------------------------------------------------------
  if (slip.paid) {
    const difference = Math.round(slip.paid.amount - slip.net);
    const boxH = 34;
    page.rect(left, y - boxH, usable, boxH, difference === 0 ? TINT : RED_TINT);
    page.text(left + 12, y - 14, "Amount handed over", 8, false, MUTED);
    page.text(left + 12, y - 27, rs(slip.paid.amount), 11, true, INK);
    const status =
      difference === 0
        ? "Paid in full"
        : difference < 0
          ? `Short by ${rs(-difference)}`
          : `Over by ${rs(difference)}`;
    page.centreText(
      left + usable / 2,
      y - 21,
      status,
      9.5,
      true,
      difference === 0 ? INK : RED_DEEP,
    );
    const detail = [slip.paid.on, slip.paid.note].filter(Boolean).join("  ·  ");
    if (detail)
      page.rightText(right - 12, y - 21, truncate(detail, 8, usable / 3), 8, false, MUTED);
    y -= boxH + 14;
  }

  // ---- Loans ----------------------------------------------------------------
  if (slip.loans && slip.loans.length > 0) {
    page.text(left, y, "Loans being recovered", 9.5, true, INK);
    y -= 6;
    page.rect(left, y - 16, usable, 16, TINT);
    page.text(left + 8, y - 11, "Loan", 7.5, true, MUTED);
    page.rightText(right - 150, y - 11, "Installment", 7.5, true, MUTED);
    page.rightText(right - 8, y - 11, "Balance after this slip", 7.5, true, MUTED);
    y -= 16;
    for (const loan of slip.loans) {
      page.text(left + 8, y - 11, truncate(loan.label, 8.5, usable - 260), 8.5, false, INK);
      page.rightText(right - 150, y - 11, rs(loan.installment), 8.5, false, INK);
      page.rightText(right - 8, y - 11, rs(loan.balance), 8.5, true, INK);
      page.line(left, y - 16, right, y - 16, 0.92, 0.3);
      y -= 16;
    }
    y -= 12;
  }

  pageFooter(page, 1, 1);
  return assemble([page], `Salary slip - ${slip.employeeName} - ${slip.period}`);
}
