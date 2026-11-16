"use client";

import { useState } from "react";

import { ExportButtons } from "@/components/export-buttons";
import { useDictionary } from "@/components/language-provider";
import { cn } from "@/lib/utils";

type Scope = "all" | "person";

/**
 * The payroll download, scoped past what the charts above are showing.
 *
 * The charts stay department-scoped — that is what they were asked to show.
 * But "give me the payroll file for just this one roll number" is a different
 * question from "show me this department's overtime trend", and answering it
 * by first reloading the whole page onto that one person would throw every
 * other chart away to get a file. So this is its own small scope, independent
 * of the filter form above it: whole factory or department (as already
 * chosen there), or one person by name or by the number on their card.
 */
export function ReportsDownload({
  from,
  to,
  dept,
  people,
}: {
  from: string;
  to: string;
  dept: string | undefined;
  people: { id: string; name: string; code: string }[];
}) {
  const t = useDictionary();
  const [scope, setScope] = useState<Scope>("all");
  const [personId, setPersonId] = useState("");

  const ready = scope === "all" || personId !== "";

  return (
    <div className="flex flex-wrap items-end gap-2">
      <label className="block">
        <span className="text-xs font-semibold text-muted-foreground">
          {t.reports.downloadScope}
        </span>
        <select
          value={scope}
          onChange={(event) => {
            const next = event.target.value as Scope;
            setScope(next);
            if (next === "all") setPersonId("");
          }}
          className="mt-1 block rounded-xl border border-input bg-background px-3 py-2 text-xs font-semibold text-foreground outline-none focus:border-primary"
        >
          <option value="all">{t.reports.downloadScopeFiltered}</option>
          <option value="person">{t.reports.downloadScopePerson}</option>
        </select>
      </label>

      {scope === "person" ? (
        <label className="block">
          <span className="text-xs font-semibold text-muted-foreground">{t.common.person}</span>
          <select
            value={personId}
            onChange={(event) => setPersonId(event.target.value)}
            className={cn(
              "mt-1 block rounded-xl border border-input bg-background px-3 py-2 text-xs font-semibold text-foreground outline-none focus:border-primary",
              "max-w-[12rem]",
            )}
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

      <fieldset disabled={!ready} className="disabled:opacity-50">
        <ExportButtons
          key={`${scope}|${personId}`}
          kind="payroll"
          params={{
            from,
            to,
            dept: scope === "all" ? dept : undefined,
            person: scope === "person" ? personId : undefined,
          }}
        />
      </fieldset>
    </div>
  );
}
