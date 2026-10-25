"use client";

import { useState } from "react";
import { FileDown } from "lucide-react";

import { ExportButtons } from "@/components/export-buttons";
import { Card, SectionTitle } from "@/components/ui-kit";
import { cn } from "@/lib/utils";

const fieldClass =
  "mt-1 block rounded-2xl border border-input bg-background px-4 py-2.5 font-latin text-sm";

/**
 * Pick what to download: one date or a range, the whole factory or some
 * departments, as a register (people, with the working) or an invoice (days
 * and menus). The files are built by `/api/export/canteen[-invoice]`.
 */
export function CanteenDownloadPanel({
  from,
  to,
  departments,
}: {
  from: string;
  to: string;
  departments: { id: string; name: string }[];
}) {
  const [mode, setMode] = useState<"range" | "day">(from === to ? "day" : "range");
  const [start, setStart] = useState(from);
  const [end, setEnd] = useState(to);
  const [picked, setPicked] = useState<string[]>([]);
  const [kind, setKind] = useState<"canteen" | "canteen-invoice">("canteen");

  const rangeFrom = mode === "day" ? start : start <= end ? start : end;
  const rangeTo = mode === "day" ? start : start <= end ? end : start;
  const toggle = (id: string) =>
    setPicked((now) => (now.includes(id) ? now.filter((x) => x !== id) : [...now, id]));

  return (
    <Card className="p-4 sm:p-6">
      <SectionTitle
        icon={FileDown}
        title="Download report"
        subtitle="PDF or Excel for a date or a range, the whole factory or chosen departments, with the full working."
      />

      <div className="flex flex-wrap items-end gap-3">
        <div className="flex gap-2">
          {(
            [
              ["day", "One date"],
              ["range", "Date range"],
            ] as const
          ).map(([value, label]) => (
            <button
              key={value}
              type="button"
              onClick={() => setMode(value)}
              className={cn(
                "rounded-2xl px-3 py-2.5 text-xs font-bold transition-all",
                mode === value
                  ? "bg-primary-soft text-primary"
                  : "bg-secondary text-muted-foreground hover:text-foreground",
              )}
            >
              {label}
            </button>
          ))}
        </div>

        <label className="block">
          <span className="text-xs font-bold text-muted-foreground">
            {mode === "day" ? "Date" : "From"}
          </span>
          <input
            type="date"
            value={start}
            onChange={(e) => e.target.value && setStart(e.target.value)}
            dir="ltr"
            className={fieldClass}
          />
        </label>
        {mode === "range" ? (
          <label className="block">
            <span className="text-xs font-bold text-muted-foreground">To</span>
            <input
              type="date"
              value={end}
              onChange={(e) => e.target.value && setEnd(e.target.value)}
              dir="ltr"
              className={fieldClass}
            />
          </label>
        ) : null}

        <div className="flex gap-2">
          {(
            [
              ["canteen", "Register (by person)"],
              ["canteen-invoice", "Invoice (by day)"],
            ] as const
          ).map(([value, label]) => (
            <button
              key={value}
              type="button"
              onClick={() => setKind(value)}
              className={cn(
                "rounded-2xl px-3 py-2.5 text-xs font-bold transition-all",
                kind === value
                  ? "bg-primary-soft text-primary"
                  : "bg-secondary text-muted-foreground hover:text-foreground",
              )}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      <div className="mt-4">
        <p className="text-xs font-bold text-muted-foreground">
          Departments {picked.length === 0 ? "· whole factory" : `· ${picked.length} chosen`}
        </p>
        <div className="mt-2 flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => setPicked([])}
            className={cn(
              "rounded-2xl px-3 py-2 text-xs font-bold transition-all",
              picked.length === 0
                ? "bg-primary-soft text-primary"
                : "bg-secondary text-muted-foreground hover:text-foreground",
            )}
          >
            Whole factory
          </button>
          {departments.map((department) => (
            <button
              key={department.id}
              type="button"
              onClick={() => toggle(department.id)}
              className={cn(
                "rounded-2xl px-3 py-2 text-xs font-bold transition-all",
                picked.includes(department.id)
                  ? "bg-primary-soft text-primary"
                  : "bg-secondary text-muted-foreground hover:text-foreground",
              )}
            >
              {department.name}
            </button>
          ))}
        </div>
      </div>

      <div className="mt-4">
        <ExportButtons
          kind={kind}
          params={{ from: rangeFrom, to: rangeTo, dept: picked.join(",") || undefined }}
          label="Report"
        />
      </div>
    </Card>
  );
}
