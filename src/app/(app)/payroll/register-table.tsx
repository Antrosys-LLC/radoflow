"use client";

import { useMemo } from "react";
import { ChevronDown, Sheet } from "lucide-react";

import { ExportButtons } from "@/components/export-buttons";
import { useDictionary } from "@/components/language-provider";
import { Latin } from "@/components/latin";
import { Card, SectionTitle } from "@/components/ui-kit";
import {
  groupRegister,
  hasOtherDeductions,
  toRegisterRow,
  totalsOf,
  type RegisterItem,
  type RegisterTotals,
} from "@/lib/payroll/register";
import { cn } from "@/lib/utils";

/**
 * The pay run as the office's salary sheet.
 *
 * Same columns, same order, same department-at-a-time layout as the workbook
 * the accounts office has always kept — so checking RadoFlow against it is a
 * matter of reading down two identical columns, not translating between two
 * layouts. Column headings are the sheet's own and stay in English in every
 * language: they are what is printed on the paper this is checked against.
 */

const whole = (value: number) => Math.round(value).toLocaleString("en-PK");
const decimal = (value: number) => value.toLocaleString("en-PK", { maximumFractionDigits: 2 });

function Figures({ totals, withOther }: { totals: RegisterTotals; withOther: boolean }) {
  const cells = [
    whole(totals.sRate),
    decimal(totals.days),
    whole(totals.dayAmount),
    decimal(totals.hours),
    whole(totals.hourAmount),
    whole(totals.gross),
    whole(totals.advance),
    whole(totals.advance2),
    whole(totals.loan),
    whole(totals.suit),
    ...(withOther ? [whole(totals.other)] : []),
    whole(totals.net),
  ];
  return (
    <>
      {cells.map((value, index) => (
        <td
          key={index}
          className={cn(
            "whitespace-nowrap px-2 py-2 text-end tabular-nums",
            index === cells.length - 1 && "font-bold",
          )}
        >
          <Latin>{value}</Latin>
        </td>
      ))}
    </>
  );
}

export function RegisterTable({ items, periodId }: { items: RegisterItem[]; periodId: string }) {
  const t = useDictionary();

  const { groups, withOther, totals, count } = useMemo(() => {
    const rows = items.map(toRegisterRow);
    return {
      groups: groupRegister(rows),
      withOther: hasOtherDeductions(rows),
      totals: totalsOf(rows),
      count: rows.length,
    };
  }, [items]);

  const headers = [
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

  return (
    <Card className="p-4 sm:p-6">
      <SectionTitle
        icon={Sheet}
        title={t.payroll.register}
        subtitle={t.payroll.registerHint}
        action={<ExportButtons kind="register" params={{ period: periodId }} />}
      />

      <div className="space-y-2">
        {groups.map((group) => (
          <details key={group.department} className="group rounded-2xl bg-secondary">
            <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-4 py-3 [&::-webkit-details-marker]:hidden">
              <span className="text-sm font-bold text-foreground">
                <Latin>{`${group.department} · ${group.rows.length}`}</Latin>
              </span>
              <span className="flex items-center gap-3 text-xs text-muted-foreground">
                <Latin>{`G ${whole(group.subtotal.gross)} · NET ${whole(group.subtotal.net)}`}</Latin>
                <ChevronDown className="size-4 transition-transform group-open:rotate-180" />
              </span>
            </summary>

            <div className="overflow-x-auto px-2 pb-3" dir="ltr">
              <table className="w-full min-w-[1100px] text-xs">
                <thead>
                  <tr className="bg-charcoal text-white">
                    {headers.map((header, index) => (
                      <th
                        key={`${header}-${index}`}
                        className={cn(
                          "whitespace-nowrap px-2 py-2 font-bold",
                          index <= 2 ? "text-start" : "text-end",
                          index === 0 && "rounded-s-lg",
                          index === headers.length - 1 && "rounded-e-lg",
                        )}
                      >
                        {header}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {group.rows.map((row, index) => (
                    <tr key={row.profileId} className={cn(index % 2 === 1 && "bg-card/70")}>
                      <td className="px-2 py-2 tabular-nums">{index + 1}</td>
                      <td className="whitespace-nowrap px-2 py-2 font-semibold text-foreground">
                        <Latin>{row.name}</Latin>
                        <span className="ms-1.5 text-[10px] font-normal text-muted-foreground">
                          <Latin>{row.code}</Latin>
                        </span>
                      </td>
                      <td className="whitespace-nowrap px-2 py-2 text-muted-foreground">
                        <Latin>{row.designation}</Latin>
                      </td>
                      <Figures totals={row} withOther={withOther} />
                    </tr>
                  ))}
                  <tr className="border-t border-foreground/30 bg-card font-bold">
                    <td />
                    <td className="px-2 py-2" colSpan={2}>
                      <Latin>{`Total · ${group.department}`}</Latin>
                    </td>
                    <Figures totals={group.subtotal} withOther={withOther} />
                  </tr>
                </tbody>
              </table>
            </div>
          </details>
        ))}
      </div>

      <div className="mt-3 overflow-x-auto rounded-2xl bg-charcoal px-2 text-white" dir="ltr">
        <table className="w-full min-w-[1100px] text-xs">
          <tbody>
            <tr className="font-bold">
              <td className="px-2 py-3" colSpan={3}>
                <Latin>{`GRAND TOTAL · ${count}`}</Latin>
              </td>
              <Figures totals={totals} withOther={withOther} />
            </tr>
          </tbody>
        </table>
      </div>
    </Card>
  );
}
