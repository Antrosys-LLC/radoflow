"use client";

import { useState } from "react";
import { Download } from "lucide-react";

import { ExportButtons } from "@/components/export-buttons";
import { Latin } from "@/components/latin";
import { useDictionary } from "@/components/language-provider";
import { cn } from "@/lib/utils";

const DATE_INPUT =
  "mt-1 rounded-2xl border border-input bg-background px-4 py-2.5 text-sm outline-none focus:border-primary";

/**
 * The check-in / check-out download, with a date range of its own.
 *
 * Separate from the filter form above it on purpose: the form only takes effect
 * when "Show" is pressed, and a download that silently used the previous
 * range's dates would be a file for the wrong month. The same goes for the
 * departments: they are picked here, seeded from the form's selection, so the
 * file always matches what is ticked beside the button. The person still comes
 * from the form, because it is already in the URL.
 */
export function LogDownload({
  defaultFrom,
  defaultTo,
  person,
  departments: selectedDepartments,
  allDepartments,
}: {
  defaultFrom: string;
  defaultTo: string;
  person?: string | undefined;
  departments: string[];
  allDepartments: { id: string; name: string }[];
}) {
  const t = useDictionary();
  const [from, setFrom] = useState(defaultFrom);
  const [to, setTo] = useState(defaultTo);
  const [departments, setDepartments] = useState<string[]>(selectedDepartments);
  const valid = Boolean(from) && Boolean(to) && from <= to;

  return (
    <div className="mt-4 rounded-2xl border border-border bg-secondary/40 p-4">
      <p className="flex items-center gap-2 text-sm font-bold text-foreground">
        <Download className="size-4 text-primary" aria-hidden />
        {t.logs.downloadLogTitle}
      </p>
      <p className="mt-0.5 text-xs text-muted-foreground">{t.logs.downloadLogHint}</p>

      {allDepartments.length > 0 && !person ? (
        <fieldset className="mt-3">
          <legend className="text-xs font-semibold text-muted-foreground">
            {t.logs.departmentsHint}
          </legend>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {allDepartments.map((d) => (
              <label key={d.id} className="cursor-pointer">
                <input
                  type="checkbox"
                  checked={departments.includes(d.id)}
                  onChange={(event) =>
                    setDepartments((current) =>
                      event.target.checked
                        ? [...current, d.id]
                        : current.filter((id) => id !== d.id),
                    )
                  }
                  className="peer sr-only"
                />
                <span
                  className={cn(
                    "block rounded-xl border px-3 py-1.5 text-xs font-semibold transition-colors",
                    "border-border bg-card text-muted-foreground hover:text-foreground",
                    "peer-checked:border-primary peer-checked:bg-primary/10 peer-checked:text-primary",
                    "peer-focus-visible:ring-2 peer-focus-visible:ring-primary peer-focus-visible:ring-offset-1",
                  )}
                >
                  <Latin>{d.name}</Latin>
                </span>
              </label>
            ))}
          </div>
        </fieldset>
      ) : null}

      <div className="mt-3 flex flex-wrap items-end gap-3">
        <label className="block">
          <span className="text-xs font-semibold text-muted-foreground">{t.logs.from}</span>
          <input
            type="date"
            value={from}
            max={to || undefined}
            onChange={(event) => setFrom(event.target.value)}
            className={`${DATE_INPUT} block`}
          />
        </label>
        <label className="block">
          <span className="text-xs font-semibold text-muted-foreground">{t.logs.to}</span>
          <input
            type="date"
            value={to}
            min={from || undefined}
            onChange={(event) => setTo(event.target.value)}
            className={`${DATE_INPUT} block`}
          />
        </label>

        {/* Remounted by key so a changed range never reuses a stale closure. */}
        <fieldset disabled={!valid} className="disabled:opacity-50">
          <ExportButtons
            key={`${from}|${to}|${departments.join(",")}`}
            kind="attendance-log"
            label={t.logs.downloadLogLabel}
            params={{
              from,
              to,
              person,
              dept: departments.length > 0 ? departments.join(",") : undefined,
            }}
          />
        </fieldset>
      </div>
    </div>
  );
}
