"use client";

import { useEffect, useId, useRef, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Search, X } from "lucide-react";

/**
 * Search and filters for any list of people, written into the URL.
 *
 * The URL rather than local state, for three reasons: a filtered list can be
 * sent to someone, the back button behaves the way people expect, and the
 * server components that render these lists can read the filters directly
 * instead of shipping every row to the browser to be hidden again.
 */

export interface FilterSpec {
  /** Query-string key. */
  name: string;
  label: string;
  options: { value: string; label: string }[];
  /** Shown as the "no choice made" option. */
  allLabel: string;
}

/** How long to wait after the last keystroke before navigating. */
const SEARCH_DEBOUNCE_MS = 300;

export function FilterBar({
  placeholder = "Search by name, code or CNIC",
  filters = [],
  total,
  showing,
}: {
  placeholder?: string;
  filters?: FilterSpec[];
  /** Rows before filtering, for the "showing x of y" line. */
  total?: number;
  showing?: number;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const searchId = useId();

  const urlQuery = params.get("q") ?? "";
  const [query, setQuery] = useState(urlQuery);

  /*
   * The field follows the URL when the URL changes for some other reason —
   * a filter chip, the back button — but is not otherwise controlled by it,
   * so typing is never interrupted by a navigation landing mid-word.
   */
  const lastPushed = useRef(urlQuery);
  useEffect(() => {
    if (urlQuery !== lastPushed.current) {
      lastPushed.current = urlQuery;
      setQuery(urlQuery);
    }
  }, [urlQuery]);

  // Debounced: navigating on every keystroke re-renders the whole list.
  useEffect(() => {
    if (query === urlQuery) return;

    const timer = setTimeout(() => {
      const next = new URLSearchParams(params.toString());
      if (query) next.set("q", query);
      else next.delete("q");
      lastPushed.current = query;
      router.replace(`${pathname}?${next.toString()}`, { scroll: false });
    }, SEARCH_DEBOUNCE_MS);

    return () => clearTimeout(timer);
  }, [query, urlQuery, params, pathname, router]);

  function setFilter(name: string, value: string) {
    const next = new URLSearchParams(params.toString());
    if (value) next.set(name, value);
    else next.delete(name);
    router.replace(`${pathname}?${next.toString()}`, { scroll: false });
  }

  const active = filters.some((f) => params.get(f.name)) || Boolean(urlQuery);

  return (
    <div className="mb-4 space-y-3">
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative min-w-[14rem] flex-1">
          <Search className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <input
            id={searchId}
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={placeholder}
            aria-label={placeholder}
            className="w-full rounded-2xl border border-input bg-background py-2.5 pl-10 pr-4 text-sm outline-none transition-colors focus:border-primary focus:ring-2 focus:ring-primary/30"
          />
        </div>

        {filters.map((filter) => (
          <label key={filter.name} className="shrink-0">
            <span className="sr-only">{filter.label}</span>
            <select
              value={params.get(filter.name) ?? ""}
              onChange={(event) => setFilter(filter.name, event.target.value)}
              className="rounded-2xl border border-input bg-background px-3 py-2.5 text-sm font-semibold outline-none focus:border-primary"
            >
              <option value="">{filter.allLabel}</option>
              {filter.options.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
        ))}

        {active ? (
          <button
            type="button"
            onClick={() => router.replace(pathname, { scroll: false })}
            className="inline-flex shrink-0 items-center gap-1.5 rounded-2xl px-3 py-2.5 text-sm font-semibold text-muted-foreground transition-colors hover:text-danger"
          >
            <X className="size-4" />
            Clear
          </button>
        ) : null}
      </div>

      {total !== undefined && showing !== undefined && showing !== total ? (
        <p className="text-xs text-muted-foreground">
          Showing {showing} of {total}
        </p>
      ) : null}
    </div>
  );
}

/**
 * Whether one person matches a free-text search.
 *
 * Matches name, employee code and CNIC, because the office searches by
 * whichever of the three is in front of them — a card, a payslip, or a
 * terminal display.
 */
export function matchesPerson(
  person: { full_name: string; employee_code: string; cnic?: string | null },
  query: string,
): boolean {
  const needle = query.trim().toLowerCase();
  if (!needle) return true;

  // Digits only, so "3520112345678" finds a CNIC stored with dashes.
  const digits = needle.replace(/\D/g, "");

  return (
    person.full_name.toLowerCase().includes(needle) ||
    person.employee_code.toLowerCase().includes(needle) ||
    (digits.length > 0 && (person.cnic ?? "").replace(/\D/g, "").includes(digits))
  );
}
