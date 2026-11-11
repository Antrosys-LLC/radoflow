import {
  CONTRACT_FIRM,
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

/**
 * How the grand total is made: everybody's payroll, plus each contract firm
 * billed once, equals the total calculated. Null when no firm is in the run,
 * so a factory without one prints exactly what it always did.
 */
function breakdownOf(
  all: readonly RegisterRow[],
  totals: RegisterTotals,
): { label: string; amount: number }[] | null {
  const firms = all.filter((row) => row.designation === CONTRACT_FIRM);
  if (firms.length === 0) return null;
  const firmsTotal = firms.reduce((sum, firm) => sum + firm.gross, 0);
  return [
    { label: "Payroll of all people", amount: totals.gross - firmsTotal },
    ...firms.map((firm) => ({ label: `+ ${firm.name}`, amount: firm.gross })),
    { label: "= Total calculated", amount: totals.gross },
  ];
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

  const withheld = totals.advance + totals.advance2 + totals.loan + totals.suit + totals.other;
  const breakdown = breakdownOf(all, totals);

  return buildTablePdf({
    title: meta.title,
    subtitle: meta.subtitle,
    orientation: "landscape",
    columns,
    rows,
    totals: ["", `GRAND TOTAL · ${all.length} people`, "", ...numbers(totals, withOther)],
    highlights: breakdown
      ? [
          ...breakdown.map((line) => ({ label: line.label, value: rs(line.amount) })),
          { label: "Deductions", value: rs(withheld) },
          { label: "Net pay", value: rs(totals.net) },
        ]
      : [
          { label: "People", value: all.length.toLocaleString("en-PK") },
          { label: "G salary", value: rs(totals.gross) },
          { label: "Deductions", value: rs(withheld) },
          { label: "Net pay", value: rs(totals.net) },
        ],
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

  const breakdown = breakdownOf(all, totals);
  const withheld = totals.advance + totals.advance2 + totals.loan + totals.suit + totals.other;
  const totalSheet: Sheet[] = breakdown
    ? [
        {
          name: "Total",
          title: `${meta.title} — how the total is made`,
          subtitle: meta.subtitle,
          orientation: "portrait",
          columns: [
            { header: "ITEM", width: 34, format: "text" },
            { header: "AMOUNT", width: 16, format: "money" },
          ],
          rows: [
            ...breakdown.map((line): SheetRow => [line.label, whole(line.amount)]),
            ["Less deductions", whole(withheld)],
          ],
          totals: ["NET PAY", whole(totals.net)],
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
    ...totalSheet,
  ]);
}
