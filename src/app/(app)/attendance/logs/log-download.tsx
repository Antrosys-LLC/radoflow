"use client";

import { useState } from "react";
import { Download } from "lucide-react";

import { ExportButtons } from "@/components/export-buttons";
import { useDictionary } from "@/components/language-provider";

const DATE_INPUT =
  "mt-1 rounded-2xl border border-input bg-background px-4 py-2.5 text-sm outline-none focus:border-primary";

/**
 * The check-in / check-out download, with a date range of its own.
 *
 * Separate from the filter form above it on purpose: the form only takes effect
 * when "Show" is pressed, and a download that silently used the previous
 * range's dates would be a file for the wrong month. The person and
 * departments still come from that form, because they are already in the URL.
 */
export function LogDownload({
  defaultFrom,
  defaultTo,
  person,
  departments,
}: {
  defaultFrom: string;
  defaultTo: string;
  person?: string | undefined;
  departments: string[];
}) {
  const t = useDictionary();
  const [from, setFrom] = useState(defaultFrom);
  const [to, setTo] = useState(defaultTo);
  const valid = Boolean(from) && Boolean(to) && from <= to;

  return (
    <div className="mt-4 rounded-2xl border border-border bg-secondary/40 p-4">
      <p className="flex items-center gap-2 text-sm font-bold text-foreground">
        <Download className="size-4 text-primary" aria-hidden />
        {t.logs.downloadLogTitle}
      </p>
      <p className="mt-0.5 text-xs text-muted-foreground">{t.logs.downloadLogHint}</p>

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
            key={`${from}|${to}`}
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
