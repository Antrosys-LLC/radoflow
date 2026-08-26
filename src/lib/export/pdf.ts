/**
 * A minimal PDF writer, for payslips and report tables.
 *
 * A PDF is a text format with a byte-offset index at the end, so it can be
 * assembled directly. This supports what these documents need — the fourteen
 * built-in fonts, text, rules, filled bands, and pagination — and nothing more.
 *
 * Written by hand rather than pulled in for the same reason as the workbook
 * writer: a table with a header on it does not justify several megabytes of
 * dependency, and this runs on every request that asks for a download.
 *
 * Text is encoded WinAnsi, which is what the built-in fonts speak. The rupee
 * sign is not in that character set, so amounts are written "Rs" — a document
 * that renders a placeholder glyph is worse than one that spells it out.
 */

export interface Column {
  header: string;
  /** Width in points. 1pt = 1/72 inch; A4 is 595 wide. */
  width: number;
  align?: "left" | "right";
}

export interface TableDoc {
  title: string;
  subtitle?: string | undefined;
  columns: Column[];
  rows: (string | number)[][];
  totals?: (string | number)[] | undefined;
  /** Printed small at the foot of every page. */
  footer?: string | undefined;
}

const PAGE = { width: 595, height: 842, margin: 40 };
const BRAND = { r: 0.078, g: 0.216, b: 0.247 };

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
    .replace(/₨/g, "Rs")
    .replace(/[^\x20-\x7e\xa0-\xff]/g, "?");
}

/** Helvetica's average character width, near enough for truncation. */
function textWidth(text: string, size: number): number {
  return text.length * size * 0.5;
}

function truncate(text: string, size: number, maxWidth: number): string {
  if (textWidth(text, size) <= maxWidth) return text;
  const chars = Math.max(1, Math.floor(maxWidth / (size * 0.5)) - 1);
  return `${text.slice(0, chars)}…`.replace("…", "...");
}

/** Builds the content stream for one page, plus the ops helpers. */
class Page {
  ops: string[] = [];

  text(x: number, y: number, value: string, size = 9, bold = false, grey = 0) {
    const font = bold ? "/F2" : "/F1";
    this.ops.push(
      `BT ${font} ${size} Tf ${grey} g ${x} ${y} Td (${pdfString(toWinAnsi(value))}) Tj ET`,
    );
  }

  rightText(right: number, y: number, value: string, size = 9, bold = false, grey = 0) {
    const clean = toWinAnsi(value);
    this.text(right - textWidth(clean, size), y, value, size, bold, grey);
  }

  rect(x: number, y: number, w: number, h: number, colour: { r: number; g: number; b: number }) {
    this.ops.push(`${colour.r} ${colour.g} ${colour.b} rg ${x} ${y} ${w} ${h} re f`);
  }

  line(x1: number, y1: number, x2: number, y2: number, grey = 0.8) {
    this.ops.push(`${grey} G 0.5 w ${x1} ${y1} m ${x2} ${y2} l S`);
  }

  toString() {
    return this.ops.join("\n");
  }
}

/** Assembles pages into a PDF file with a correct cross-reference table. */
function assemble(pages: Page[]): Buffer {
  const objects: string[] = [];
  const pageCount = Math.max(1, pages.length);

  // 1 catalog, 2 pages, 3 & 4 fonts, then page objects and their streams.
  const firstPageObj = 5;
  const pageIds = pages.map((_, i) => firstPageObj + i * 2);

  objects[1] = `<< /Type /Catalog /Pages 2 0 R >>`;
  objects[2] = `<< /Type /Pages /Count ${pageCount} /Kids [${pageIds.map((id) => `${id} 0 R`).join(" ")}] >>`;
  objects[3] = `<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>`;
  objects[4] = `<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>`;

  pages.forEach((page, i) => {
    const id = pageIds[i]!;
    const streamId = id + 1;
    const content = page.toString();

    objects[id] =
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${PAGE.width} ${PAGE.height}] ` +
      `/Resources << /Font << /F1 3 0 R /F2 4 0 R >> >> /Contents ${streamId} 0 R >>`;
    objects[streamId] =
      `<< /Length ${Buffer.byteLength(content, "latin1")} >>\nstream\n${content}\nendstream`;
  });

  let pdf = "%PDF-1.4\n";
  const offsets: number[] = [];

  for (let i = 1; i < objects.length; i++) {
    const body = objects[i];
    if (body === undefined) continue;
    offsets[i] = Buffer.byteLength(pdf, "latin1");
    pdf += `${i} 0 obj\n${body}\nendobj\n`;
  }

  const xrefOffset = Buffer.byteLength(pdf, "latin1");
  const count = objects.length;

  pdf += `xref\n0 ${count}\n0000000000 65535 f \n`;
  for (let i = 1; i < count; i++) {
    // Every slot must be present and exactly 20 bytes, or the file is rejected.
    const offset = offsets[i] ?? 0;
    pdf += `${String(offset).padStart(10, "0")} 00000 n \n`;
  }

  pdf += `trailer\n<< /Size ${count} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF`;

  return Buffer.from(pdf, "latin1");
}

/** Draws the brand band and title at the top of a page. */
function header(page: Page, title: string, subtitle: string | undefined, continued: boolean) {
  const top = PAGE.height - PAGE.margin;

  page.rect(0, top - 8, PAGE.width, 56, BRAND);
  page.text(PAGE.margin, top + 22, "Rado Dyeing & Textile", 15, true, 1);
  page.text(PAGE.margin, top + 6, continued ? `${title} (continued)` : title, 10, false, 1);

  if (subtitle) page.text(PAGE.margin, top - 26, subtitle, 9, false, 0.4);

  return top - (subtitle ? 46 : 30);
}

function footer(page: Page, note: string | undefined, pageNumber: number, pageTotal: number) {
  const y = PAGE.margin - 14;
  page.line(PAGE.margin, y + 14, PAGE.width - PAGE.margin, y + 14, 0.85);
  if (note) page.text(PAGE.margin, y, note, 7.5, false, 0.55);
  page.rightText(
    PAGE.width - PAGE.margin,
    y,
    `Page ${pageNumber} of ${pageTotal}`,
    7.5,
    false,
    0.55,
  );
}

const fmt = (value: string | number) =>
  typeof value === "number"
    ? value.toLocaleString("en-PK", { maximumFractionDigits: 2 })
    : String(value);

/**
 * A paginated table.
 *
 * Rows are laid out first and the page count is known before anything is
 * drawn, so "Page 1 of 4" is right on the first page rather than only on the
 * last — which is the usual bug when pages are emitted as they fill.
 */
export function buildTablePdf(doc: TableDoc): Buffer {
  const ROW_HEIGHT = 16;
  const usableWidth = PAGE.width - PAGE.margin * 2;

  // Scale the requested widths to the page rather than letting them overflow.
  const requested = doc.columns.reduce((t, c) => t + c.width, 0);
  const scale = requested > 0 ? usableWidth / requested : 1;
  const widths = doc.columns.map((c) => c.width * scale);

  const firstTop = PAGE.height - PAGE.margin - (doc.subtitle ? 46 : 30);
  const bottom = PAGE.margin + 10;
  const perPage = Math.max(1, Math.floor((firstTop - bottom - ROW_HEIGHT * 2) / ROW_HEIGHT));

  const chunks: (string | number)[][][] = [];
  for (let i = 0; i < doc.rows.length; i += perPage) chunks.push(doc.rows.slice(i, i + perPage));
  if (chunks.length === 0) chunks.push([]);

  const pages = chunks.map((chunk, pageIndex) => {
    const page = new Page();
    let y = header(page, doc.title, doc.subtitle, pageIndex > 0);

    // Column headings, on a tinted band.
    page.rect(PAGE.margin, y - 4, usableWidth, ROW_HEIGHT, { r: 0.95, g: 0.94, b: 0.91 });
    let x = PAGE.margin;
    doc.columns.forEach((column, i) => {
      const w = widths[i]!;
      if (column.align === "right") page.rightText(x + w - 4, y, column.header, 8.5, true, 0.2);
      else page.text(x + 4, y, truncate(column.header, 8.5, w - 8), 8.5, true, 0.2);
      x += w;
    });
    y -= ROW_HEIGHT;

    for (const row of chunk) {
      x = PAGE.margin;
      doc.columns.forEach((column, i) => {
        const w = widths[i]!;
        const value = fmt(row[i] ?? "");
        if (column.align === "right") page.rightText(x + w - 4, y, value, 8.5, false, 0.15);
        else page.text(x + 4, y, truncate(value, 8.5, w - 8), 8.5, false, 0.15);
        x += w;
      });
      page.line(PAGE.margin, y - 4, PAGE.width - PAGE.margin, y - 4, 0.9);
      y -= ROW_HEIGHT;
    }

    // Totals only on the last page, where they mean the whole table.
    if (doc.totals && pageIndex === chunks.length - 1) {
      page.line(PAGE.margin, y + 11, PAGE.width - PAGE.margin, y + 11, 0.3);
      x = PAGE.margin;
      doc.columns.forEach((column, i) => {
        const w = widths[i]!;
        const value = fmt(doc.totals![i] ?? "");
        if (column.align === "right") page.rightText(x + w - 4, y, value, 9, true, 0);
        else page.text(x + 4, y, truncate(value, 9, w - 8), 9, true, 0);
        x += w;
      });
    }

    footer(page, doc.footer, pageIndex + 1, chunks.length);
    return page;
  });

  return assemble(pages);
}

export interface PayslipDoc {
  employeeName: string;
  employeeCode: string;
  department: string;
  designation?: string | undefined;
  period: string;
  /** Left column: how the pay was arrived at. */
  facts: { label: string; value: string }[];
  earnings: { label: string; amount: number }[];
  deductions: { label: string; amount: number }[];
  net: number;
  footer?: string | undefined;
}

/** One person's payslip, on one page. */
export function buildPayslipPdf(slip: PayslipDoc): Buffer {
  const page = new Page();
  let y = header(page, `Payslip — ${slip.period}`, undefined, false);

  y -= 6;
  page.text(PAGE.margin, y, slip.employeeName, 13, true);
  y -= 14;
  page.text(
    PAGE.margin,
    y,
    [slip.employeeCode, slip.department, slip.designation].filter(Boolean).join("  ·  "),
    9,
    false,
    0.4,
  );

  y -= 22;
  page.line(PAGE.margin, y, PAGE.width - PAGE.margin, y, 0.85);
  y -= 16;

  // How the figure was reached, before the figure itself: the payslip has to
  // answer "why this number" without a second document.
  page.text(PAGE.margin, y, "How this was calculated", 9, true, 0.3);
  y -= 14;

  for (const fact of slip.facts) {
    page.text(PAGE.margin + 6, y, fact.label, 8.5, false, 0.35);
    page.rightText(PAGE.width / 2 - 10, y, fact.value, 8.5, false, 0.1);
    y -= 13;
  }

  let right = PAGE.height - PAGE.margin - (slip.facts.length > 0 ? 92 : 60);
  const rightX = PAGE.width / 2 + 10;

  page.text(rightX, right, "Earnings", 9, true, 0.3);
  right -= 14;
  let grossTotal = 0;
  for (const line of slip.earnings) {
    grossTotal += line.amount;
    page.text(rightX + 6, right, line.label, 8.5, false, 0.35);
    page.rightText(PAGE.width - PAGE.margin, right, fmt(line.amount), 8.5, false, 0.1);
    right -= 13;
  }
  page.line(rightX, right + 9, PAGE.width - PAGE.margin, right + 9, 0.85);
  page.text(rightX + 6, right - 2, "Gross", 8.5, true, 0.2);
  page.rightText(PAGE.width - PAGE.margin, right - 2, fmt(grossTotal), 8.5, true, 0);
  right -= 24;

  let deductionTotal = 0;
  if (slip.deductions.length > 0) {
    page.text(rightX, right, "Deductions", 9, true, 0.3);
    right -= 14;
    for (const line of slip.deductions) {
      deductionTotal += line.amount;
      page.text(rightX + 6, right, line.label, 8.5, false, 0.35);
      page.rightText(PAGE.width - PAGE.margin, right, `- ${fmt(line.amount)}`, 8.5, false, 0.1);
      right -= 13;
    }
    right -= 6;
  }

  // Net pay, on the brand band, because it is the one figure being looked for.
  const bandY = Math.min(right, y) - 30;
  page.rect(PAGE.margin, bandY - 6, PAGE.width - PAGE.margin * 2, 34, BRAND);
  page.text(PAGE.margin + 12, bandY + 8, "NET PAY", 10, true, 1);
  page.rightText(PAGE.width - PAGE.margin - 12, bandY + 6, `Rs ${fmt(slip.net)}`, 16, true, 1);

  footer(page, slip.footer ?? "Computer generated — no signature required.", 1, 1);
  return assemble([page]);
}
