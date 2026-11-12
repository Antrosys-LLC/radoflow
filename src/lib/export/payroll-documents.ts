import { payrollBreakdown, type BreakdownLine } from "@/lib/payroll/breakdown";
import { movementTag } from "@/lib/payroll/movements";
import {
  hasOtherDeductions,
  totalsOf,
  type RegisterGroup,
  type RegisterRow,
  type RegisterTotals,
} from "@/lib/payroll/register";
import { formatDate } from "@/lib/time";

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

/** The four leading text columns: SR, ROLL NO, NAME, DESIGNATION. */
const IDENTITY_COLUMNS = 4;

function headers(withOther: boolean): string[] {
  return [
    "SR",
    "ROLL NO",
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

const tagOf = (row: RegisterRow) =>
  movementTag({ joinedOn: row.joinedOn ?? null, leftOn: row.leftOn ?? null }, formatDate);

/** Somebody who joined or left leads their designation cell with the fact. */
function identityCells(row: RegisterRow, index: number): (string | number)[] {
  const tag = tagOf(row);
  return [
    index + 1,
    row.code,
    row.name,
    tag ? [tag, row.designation].filter(Boolean).join(" · ") : row.designation,
  ];
}

/** The people who joined or left, with the roll number the factory knows them by. */
function movers(all: readonly RegisterRow[]): RegisterRow[] {
  return all
    .filter((row) => row.joinedOn || row.leftOn)
    .sort((a, b) => (a.leftOn ?? a.joinedOn ?? "").localeCompare(b.leftOn ?? b.joinedOn ?? ""));
}

const moverCells = (row: RegisterRow): (string | number)[] => [
  row.code,
  row.name,
  row.department,
  row.leftOn ? "Left" : "Joined",
  formatDate((row.leftOn ?? row.joinedOn) as string),
  whole(row.sRate),
  hoursValue(row.days),
  whole(row.gross),
  whole(row.net),
];

const MOVER_HEADERS = [
  "ROLL NO",
  "NAME",
  "DEPARTMENT",
  "EVENT",
  "DATE",
  "S RATE",
  "DAYS",
  "G SALARY",
  "NET PAY",
];

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
    } else if (line.tone === "note") {
      rows.push([line.label, ""]);
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

  const widthOf = (i: number) =>
    i === 0 ? 20 : i === 1 ? 40 : i === 2 ? 96 : i === 3 ? 72 : i === 5 || i === 7 ? 34 : 52;

  const columns: Column[] = headers(withOther).map((header, i) => ({
    header,
    width: widthOf(i),
    align: i === 0 ? "center" : i < IDENTITY_COLUMNS ? "left" : "right",
  }));

  const rows: TableRow[] = [];
  for (const group of groups) {
    rows.push({ group: `${group.department}  ·  ${group.rows.length} people` });
    group.rows.forEach((row, index) => {
      rows.push([...identityCells(row, index), ...numbers(row, withOther)]);
    });
    rows.push({
      subtotal: ["", "", `Total · ${group.department}`, "", ...numbers(group.subtotal, withOther)],
    });
  }

  const breakdown = payrollBreakdown(all);
  const moving = movers(all);

  return buildTablePdf({
    title: meta.title,
    subtitle: meta.subtitle,
    orientation: "landscape",
    columns,
    rows,
    totals: ["", "", `GRAND TOTAL · ${all.length} people`, "", ...numbers(totals, withOther)],
    highlights: [
      { label: "People", value: all.length.toLocaleString("en-PK") },
      { label: "Total payroll", value: rs(lineAmount(breakdown, "= Total payroll")) },
      { label: "Total calculated", value: rs(totals.gross) },
      { label: "Deductions", value: rs(totals.gross - totals.net) },
      { label: "To pay", value: rs(totals.net) },
    ],
    breakdown,
    appendix:
      moving.length > 0
        ? {
            heading: `PEOPLE WHO JOINED OR LEFT THIS PERIOD · ${moving.length}`,
            headers: MOVER_HEADERS,
            rows: moving.map(moverCells),
          }
        : undefined,
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
    width: i === 0 ? 6 : i === 1 ? 12 : i === 2 ? 26 : i === 3 ? 30 : i === 5 || i === 7 ? 9 : 13,
    format:
      i === 0 ? "number" : i < IDENTITY_COLUMNS ? "text" : i === 5 || i === 7 ? "hours" : "money",
  }));

  const rows: SheetRow[] = [];
  for (const group of groups) {
    rows.push({ group: `${group.department}  ·  ${group.rows.length} people` });
    group.rows.forEach((row, index) => {
      rows.push([...identityCells(row, index), ...numbers(row, withOther)]);
    });
    rows.push({
      subtotal: ["", "", `Total · ${group.department}`, "", ...numbers(group.subtotal, withOther)],
    });
  }

  // The workbook's first sheet has always been a department summary.
  const summaryColumns: SheetColumn[] = [
    { header: "SR", width: 6, format: "number" },
    { header: "DEPARTMENT", width: 26, format: "text" },
    { header: "PEOPLE", width: 9, format: "number" },
    ...columns.slice(IDENTITY_COLUMNS),
  ];

  const moving = movers(all);
  const joinedAndLeft: Sheet[] =
    moving.length > 0
      ? [
          {
            name: "Joined & left",
            title: `${meta.title} — people who joined or left this period`,
            subtitle: meta.subtitle,
            columns: MOVER_HEADERS.map(
              (header, i): SheetColumn => ({
                header,
                width: i === 1 || i === 2 ? 26 : i === 0 || i === 3 || i === 4 ? 14 : 13,
                format: i === 6 ? "hours" : i >= 5 ? "money" : "text",
              }),
            ),
            rows: moving.map((row): SheetRow => moverCells(row)),
          },
        ]
      : [];

  return buildWorkbook([
    {
      name: "Register",
      title: meta.title,
      subtitle: meta.subtitle,
      columns,
      rows,
      totals: ["", "", `GRAND TOTAL · ${all.length} people`, "", ...numbers(totals, withOther)],
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
    breakdownSheet(payrollBreakdown(all), meta),
    ...joinedAndLeft,
  ]);
}
