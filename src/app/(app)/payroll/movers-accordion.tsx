"use client";

import { useState } from "react";
import { ChevronDown } from "lucide-react";

import { Latin } from "@/components/latin";
import { movementTag } from "@/lib/payroll/movements";
import { registerColumns, type RegisterRow } from "@/lib/payroll/register";
import { formatDate } from "@/lib/time";
import { cn } from "@/lib/utils";

/**
 * People who joined or left inside the period, as an accordion.
 *
 * Closed until opened: the list is short but the table is wide, and most
 * people reading a pay run are not looking for it. Opened, it carries the same
 * figure columns as the register — working days, Sundays, overtime, lates and
 * every deduction — so a joiner or leaver can be checked without going to the
 * department they sit in. The body is built only once opened.
 */

const whole = (value: number) => Math.round(value).toLocaleString("en-PK");
const decimal = (value: number) => value.toLocaleString("en-PK", { maximumFractionDigits: 2 });

export function MoversAccordion({ rows }: { rows: readonly RegisterRow[] }) {
  const [open, setOpen] = useState(false);
  const withOther = rows.some((row) => row.other > 0);
  const columns = registerColumns(withOther);

  return (
    <details
      className="group mb-3 rounded-2xl bg-secondary text-sm"
      onToggle={(event) => setOpen(event.currentTarget.open)}
    >
      <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-4 py-3 [&::-webkit-details-marker]:hidden">
        <span className="border-l-2 border-primary pl-2 text-[11px] font-bold uppercase tracking-wide text-primary">
          People who joined or left this period · {rows.length}
        </span>
        <ChevronDown className="size-4 text-muted-foreground transition-transform group-open:rotate-180" />
      </summary>

      {open ? (
        <div className="overflow-x-auto px-2 pb-3" dir="ltr">
          <table className="w-full min-w-[1500px] text-xs">
            <thead>
              <tr className="bg-charcoal text-white">
                {["ROLL NO", "NAME", "DEPARTMENT", "EVENT", ...columns.map((c) => c.header)].map(
                  (header, index, all) => (
                    <th
                      key={`${header}-${index}`}
                      className={cn(
                        "whitespace-nowrap px-2 py-2 font-bold",
                        index < 4 ? "text-start" : "text-end",
                        index === 0 && "rounded-s-lg",
                        index === all.length - 1 && "rounded-e-lg",
                      )}
                    >
                      {header}
                    </th>
                  ),
                )}
              </tr>
            </thead>
            <tbody>
              {rows.map((row, index) => (
                <tr key={row.profileId} className={cn(index % 2 === 1 && "bg-card/70")}>
                  <td className="whitespace-nowrap px-2 py-2 text-muted-foreground">
                    <Latin>{row.code || "—"}</Latin>
                  </td>
                  <td className="whitespace-nowrap px-2 py-2 font-semibold text-foreground">
                    <Latin>{row.name}</Latin>
                  </td>
                  <td className="whitespace-nowrap px-2 py-2 text-muted-foreground">
                    <Latin>{row.department}</Latin>
                  </td>
                  <td className="whitespace-nowrap px-2 py-2">
                    <span
                      className={cn(
                        "rounded-full px-2 py-0.5 text-[10px] font-bold",
                        row.leftOn ? "bg-danger/15 text-danger" : "bg-success-soft text-success",
                      )}
                    >
                      <Latin>
                        {movementTag(
                          { joinedOn: row.joinedOn ?? null, leftOn: row.leftOn ?? null },
                          formatDate,
                        )}
                      </Latin>
                    </span>
                  </td>
                  {columns.map((column, i) => (
                    <td
                      key={`${column.key}-${i}`}
                      className={cn(
                        "whitespace-nowrap px-2 py-2 text-end tabular-nums",
                        column.key === "net" && "font-bold",
                      )}
                    >
                      <Latin>
                        {column.kind === "money" ? whole(row[column.key]) : decimal(row[column.key])}
                      </Latin>
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
    </details>
  );
}
