import { payrollBreakdown, type BreakdownLine } from "@/lib/payroll/breakdown";
import {
  hasOtherDeductions,
  totalsOf,
  type RegisterGroup,
  type RegisterRow,
  type RegisterTotals,
} from "@/lib/payroll/register";

import { buildTablePdf, rs, type Column, type TableRow } from "./pdf";
import { buildWorkbook, type Sheet, type SheetColumn, type SheetRow } from "./xlsx";

/**
 * The payroll register as a file — the office's salary sheet, in its own
 * columns and its own order, a department at a time.
 *
 * Both formats are built from the same groups so a printed PDF and a
 * downloaded workbook of one pay run cannot disagree by a rupee.
 */

export interface RegisterMeta {
  /** "PAYROLL REGISTER" or similar. */
  title: string;
  /** The month and the scope: "August 2026 · Whole factory". */
  subtitle: string;
  footer?: string;
}

const whole = (value: number) => Math.round(value);
const hoursValue = (value: number) => Math.round(value * 100) / 100;

function numbers(totals: RegisterTotals, withOther: boolean): number[] {
  return [
    whole(totals.sRate),
    hoursValue(totals.days),
    whole(totals.dayAmount),
    hoursValue(totals.hours),
    whole(totals.hourAmount),
    whole(totals.gross),
    whole(totals.advance),
    whole(totals.advance2),
    whole(totals.loan),
    whole(totals.suit),
    ...(withOther ? [whole(totals.other)] : []),
    whole(totals.net),
  ];
}

function headers(withOther: boolean): string[] {
  return [
    "SR",
    "NAME",
    "DESIGNATION",
    "S RATE",
    "DAYS",
    "AMOUNT",
    "HOURS",
    "AMOUNT",
    "G SALARY",
    "ADVANCE",
    "ADVANCE",
    "LOAN DED.",
    "SUITE DED.",
    ...(withOther ? ["OTHER DED."] : []),
    "NET PAY",
  ];
}

const lineAmount = (lines: readonly BreakdownLine[], label: string) =>
  lines.find((line) => line.label === label)?.amount ?? 0;

/** The breakdown as a sheet: headings as bands, subtotals bold, the last line the net. */
function breakdownSheet(lines: readonly BreakdownLine[], meta: RegisterMeta): Sheet {
  const rows: SheetRow[] = [];
  let last: BreakdownLine | undefined;
  lines.forEach((line, index) => {
    if (index === lines.length - 1 && line.tone === "total") {
      last = line;
    } else if (line.tone === "heading") {
      rows.push({ group: line.label });
    } else if (line.tone === "subtotal") {
      rows.push({ subtotal: [line.label, whole(line.amount ?? 0)] });
    } else {
      rows.push([line.label, whole(line.amount ?? 0)]);
    }
  });

  return {
    name: "Total",
    title: `${meta.title} — how the total is made`,
    subtitle: meta.subtitle,
    orientation: "portrait",
    columns: [
      { header: "ITEM", width: 56, format: "text" },
      { header: "AMOUNT (Rs)", width: 18, format: "money" },
    ],
    rows,
    totals: last ? [last.label.toUpperCase(), whole(last.amount ?? 0)] : undefined,
  };
}

function everyRow(groups: readonly RegisterGroup[]): RegisterRow[] {
  return groups.flatMap((group) => group.rows);
}

export function registerPdf(groups: readonly RegisterGroup[], meta: RegisterMeta): Buffer {
  const all = everyRow(groups);
  const withOther = hasOtherDeductions(all);
  const totals = totalsOf(all);

  const columns: Column[] = headers(withOther).map((header, i) => ({
    header,
    width: i === 0 ? 20 : i === 1 ? 104 : i === 2 ? 64 : i === 4 || i === 6 ? 34 : 52,
    align: i === 0 ? "center" : i <= 2 ? "left" : "right",
  }));

  const rows: TableRow[] = [];
  for (const group of groups) {
    rows.push({ group: `${group.department}  ·  ${group.rows.length} people` });
    group.rows.forEach((row, index) => {
      rows.push([index + 1, row.name, row.designation, ...numbers(row, withOther)]);
    });
    rows.push({
      subtotal: ["", `Total · ${group.department}`, "", ...numbers(group.subtotal, withOther)],
    });
  }

  const breakdown = payrollBreakdown(all);

  return buildTablePdf({
    title: meta.title,
    subtitle: meta.subtitle,
    orientation: "landscape",
    columns,
    rows,
    totals: ["", `GRAND TOTAL · ${all.length} people`, "", ...numbers(totals, withOther)],
    highlights: [
      { label: "People", value: all.length.toLocaleString("en-PK") },
      { label: "Total payroll", value: rs(lineAmount(breakdown, "= Total payroll")) },
      { label: "Total calculated", value: rs(totals.gross) },
      { label: "Deductions", value: rs(totals.gross - totals.net) },
      { label: "To pay", value: rs(totals.net) },
    ],
    breakdown,
    footer:
      meta.footer ??
      "AMOUNT = S Rate / days in month x days.  Hours AMOUNT = S Rate / (days in month x 8) x hours.",
  });
}

export function registerWorkbook(groups: readonly RegisterGroup[], meta: RegisterMeta): Buffer {
  const all = everyRow(groups);
  const withOther = hasOtherDeductions(all);
  const totals = totalsOf(all);

  const columns: SheetColumn[] = headers(withOther).map((header, i) => ({
    header,
    width: i === 0 ? 6 : i === 1 ? 26 : i === 2 ? 15 : i === 4 || i === 6 ? 9 : 13,
    format: i === 0 ? "number" : i <= 2 ? "text" : i === 4 || i === 6 ? "hours" : "money",
  }));

  const rows: SheetRow[] = [];
  for (const group of groups) {
    rows.push({ group: `${group.department}  ·  ${group.rows.length} people` });
    group.rows.forEach((row, index) => {
      rows.push([index + 1, row.name, row.designation, ...numbers(row, withOther)]);
    });
    rows.push({
      subtotal: ["", `Total · ${group.department}`, "", ...numbers(group.subtotal, withOther)],
    });
  }

  // The workbook's first sheet has always been a department summary.
  const summaryColumns: SheetColumn[] = [
    { header: "SR", width: 6, format: "number" },
    { header: "DEPARTMENT", width: 26, format: "text" },
    { header: "PEOPLE", width: 9, format: "number" },
    ...columns.slice(3),
  ];

  const totalSheet: Sheet = breakdownSheet(payrollBreakdown(all), meta);

  return buildWorkbook([
    {
      name: "Register",
      title: meta.title,
      subtitle: meta.subtitle,
      columns,
      rows,
      totals: ["", `GRAND TOTAL · ${all.length} people`, "", ...numbers(totals, withOther)],
    },
    {
      name: "Summary",
      title: `${meta.title} — by department`,
      subtitle: meta.subtitle,
      columns: summaryColumns,
      rows: groups.map((group, index) => [
        index + 1,
        group.department,
        group.rows.length,
        ...numbers(group.subtotal, withOther),
      ]),
      totals: ["", "TOTAL", all.length, ...numbers(totals, withOther)],
    },
    totalSheet,
  ]);
}
