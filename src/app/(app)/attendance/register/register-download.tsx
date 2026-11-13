"use client";

import { useState } from "react";
import { Download } from "lucide-react";

import { ExportButtons } from "@/components/export-buttons";
import { useDictionary } from "@/components/language-provider";
import { Latin } from "@/components/latin";
import { cn } from "@/lib/utils";

type Scope = "all" | "departments" | "person";

const DATE_INPUT =
  "mt-1 rounded-2xl border border-input bg-background px-4 py-2.5 text-sm outline-none focus:border-primary";

/**
 * The check-in / check-out download.
 *
 * Its own dates and its own scope, deliberately separate from the filter form
 * above: that form only takes effect when "Show" is pressed, and a file built
 * from the previous filter would be the wrong day under the right name. Whatever
 * is chosen here is exactly what the file holds.
 *
 * Three scopes — the whole factory, chosen departments, or one person — over any
 * range of days, opening on the day the page is showing.
 */
export function RegisterDownload({
  date,
  today,
  departments,
  people,
}: {
  date: string;
  /** The factory's today, which a till-now report always ends on. */
  today: string;
  departments: { id: string; name: string }[];
  people: { id: string; name: string; code: string }[];
}) {
  const t = useDictionary();
  const [scope, setScope] = useState<Scope>("all");
  const [report, setReport] = useState<"daily" | "till">("daily");
  const [from, setFrom] = useState(date);
  const [to, setTo] = useState(date);
  const [deptIds, setDeptIds] = useState<string[]>([]);
  const [personId, setPersonId] = useState("");

  // A till-now report ends at this moment, whatever the other date says.
  const end = report === "till" ? today : to;
  const rangeOk = Boolean(from) && Boolean(end) && from <= end;
  const scopeOk =
    scope === "all" ||
    (scope === "departments" && deptIds.length > 0) ||
    (scope === "person" && personId !== "");
  const ready = rangeOk && scopeOk;

  const scopes: { value: Scope; label: string }[] = [
    { value: "all", label: t.register.downloadScopeAll },
    { value: "departments", label: t.register.downloadScopeDepartments },
    { value: "person", label: t.register.downloadScopePerson },
  ];

  return (
    <div className="mt-4 rounded-2xl border border-border bg-secondary/40 p-4">
      <p className="flex items-center gap-2 text-sm font-bold text-foreground">
        <Download className="size-4 text-primary" aria-hidden />
        {t.logs.downloadLogTitle}
      </p>
      <p className="mt-0.5 text-xs text-muted-foreground">{t.register.downloadHint}</p>

      <div className="mt-3 flex flex-wrap gap-2" role="radiogroup">
        {(["daily", "till"] as const).map((value) => (
          <button
            key={value}
            type="button"
            role="radio"
            aria-checked={report === value}
            onClick={() => {
              setReport(value);
              // Till now starts from the first of the month unless told otherwise.
              setFrom(value === "till" ? `${today.slice(0, 7)}-01` : date);
            }}
            className={cn(
              "rounded-xl px-4 py-2 text-sm font-semibold transition-colors",
              report === value
                ? "bg-primary text-primary-foreground"
                : "bg-card text-muted-foreground hover:text-foreground",
            )}
          >
            {value === "daily" ? t.register.downloadReportDaily : t.register.downloadReportTill}
          </button>
        ))}
      </div>
      {report === "till" ? (
        <p className="mt-2 text-xs text-muted-foreground">{t.register.downloadTillHint}</p>
      ) : null}

      <div className="mt-3 flex flex-wrap gap-2" role="radiogroup">
        {scopes.map((option) => (
          <button
            key={option.value}
            type="button"
            role="radio"
            aria-checked={scope === option.value}
            onClick={() => setScope(option.value)}
            className={cn(
              "rounded-xl px-4 py-2 text-sm font-semibold transition-colors",
              scope === option.value
                ? "bg-charcoal text-charcoal-foreground"
                : "bg-card text-muted-foreground hover:text-foreground",
            )}
          >
            {option.label}
          </button>
        ))}
      </div>

      {scope === "departments" ? (
        <fieldset className="mt-3">
          <legend className="text-xs font-semibold text-muted-foreground">
            {t.logs.departmentsHint}
          </legend>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {departments.map((d) => (
              <label key={d.id} className="cursor-pointer">
                <input
                  type="checkbox"
                  checked={deptIds.includes(d.id)}
                  onChange={(event) =>
                    setDeptIds((current) =>
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

      {scope === "person" ? (
        <label className="mt-3 block max-w-md">
          <span className="text-xs font-semibold text-muted-foreground">{t.common.person}</span>
          <select
            value={personId}
            onChange={(event) => setPersonId(event.target.value)}
            className={`${DATE_INPUT} block w-full`}
          >
            <option value="">{t.register.downloadPickPerson}</option>
            {people.map((p) => (
              <option key={p.id} value={p.id} dir="ltr" className="font-latin">
                {p.name} · {p.code}
              </option>
            ))}
          </select>
        </label>
      ) : null}

      <div className="mt-3 flex flex-wrap items-end gap-3">
        <label className="block">
          <span className="text-xs font-semibold text-muted-foreground">{t.logs.from}</span>
          <input
            type="date"
            value={from}
            max={end || undefined}
            onChange={(event) => setFrom(event.target.value)}
            className={`${DATE_INPUT} block`}
          />
        </label>
        {report === "daily" ? (
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
        ) : null}

        {/* Remounted by key so a changed choice never reuses a stale closure. */}
        <fieldset disabled={!ready} className="disabled:opacity-50">
          <ExportButtons
            key={`${report}|${scope}|${from}|${end}|${deptIds.join(",")}|${personId}`}
            kind="attendance-log"
            label={report === "till" ? t.register.downloadLabelTill : t.register.downloadLabel}
            params={{
              from,
              to: end,
              order: "date",
              report: report === "till" ? "till" : undefined,
              dept: scope === "departments" ? deptIds.join(",") : undefined,
              person: scope === "person" ? personId : undefined,
            }}
          />
        </fieldset>
      </div>
    </div>
  );
}
