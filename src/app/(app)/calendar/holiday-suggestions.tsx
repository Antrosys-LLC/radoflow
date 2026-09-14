"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { CalendarCheck, Check, Loader2, Sparkles } from "lucide-react";
import { toast } from "sonner";

import { ClaudeIcon } from "@/components/claude-icon";
import { Fill } from "@/components/fill";
import { useDictionary } from "@/components/language-provider";
import { Latin } from "@/components/latin";
import { Card, SectionTitle } from "@/components/ui-kit";
import type { HolidaySuggestion } from "@/lib/calendar/holidays";
import { formatDate } from "@/lib/time";
import { cn } from "@/lib/utils";

import { saveCalendarDay, type CalendarResult } from "./actions";

const INITIAL: CalendarResult = { ok: false, message: "" };

/**
 * Upcoming Pakistani holidays, looked up by Claude and added by a person.
 *
 * Nothing lands on the calendar on its own: a holiday changes what the day
 * pays, so each suggestion is a button, not a write.
 */
export function HolidaySuggestions({
  siteId,
  approverId,
  canManage,
  existingDays,
}: {
  siteId: string;
  approverId: string;
  canManage: boolean;
  /** Dates the factory calendar already answers for, so they are not offered again. */
  existingDays: string[];
}) {
  const t = useDictionary();
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [suggestions, setSuggestions] = useState<HolidaySuggestion[] | null>(null);
  const [cost, setCost] = useState<number | null>(null);
  const [added, setAdded] = useState<Set<string>>(new Set());
  const [pending, startTransition] = useTransition();

  async function lookUp() {
    setLoading(true);
    try {
      const response = await fetch("/api/calendar/suggestions", { method: "POST" });
      const body = (await response.json().catch(() => null)) as {
        suggestions?: HolidaySuggestion[];
        costPkr?: number;
        error?: string;
      } | null;
      if (!response.ok || !body?.suggestions) {
        toast.error(body?.error ?? t.calendarScope.suggestFailed);
        return;
      }
      setSuggestions(body.suggestions);
      setCost(typeof body.costPkr === "number" ? body.costPkr : null);
    } catch {
      toast.error(t.calendarScope.suggestFailed);
    } finally {
      setLoading(false);
    }
  }

  function add(suggestion: HolidaySuggestion) {
    const data = new FormData();
    data.set("site_id", siteId);
    data.set("day", suggestion.date);
    data.set("day_type", "holiday");
    data.set("reason", suggestion.name);
    data.set("approver_id", approverId);

    startTransition(async () => {
      const result = await saveCalendarDay(INITIAL, data);
      if (result.ok) {
        toast.success(result.message);
        setAdded((was) => new Set(was).add(suggestion.date));
      } else {
        toast.error(result.message || t.calendar.saveFailed);
      }
      router.refresh();
    });
  }

  const taken = new Set(existingDays);

  return (
    <Card className="p-4 sm:p-6">
      <SectionTitle
        icon={CalendarCheck}
        title={t.calendarScope.suggestTitle}
        subtitle={t.calendarScope.suggestHint}
        action={
          <button
            type="button"
            onClick={lookUp}
            disabled={loading}
            className="inline-flex items-center gap-2 rounded-2xl bg-secondary px-4 py-2.5 text-sm font-bold text-foreground transition-all hover:bg-primary-soft hover:text-primary disabled:opacity-60"
          >
            {loading ? (
              <Loader2 className="size-4 animate-spin" aria-hidden />
            ) : (
              <ClaudeIcon className="size-4" />
            )}
            {loading ? t.calendarScope.suggesting : t.calendarScope.suggest}
          </button>
        }
      />

      {suggestions === null ? null : suggestions.length === 0 ? (
        <p className="rounded-2xl bg-secondary px-5 py-8 text-center text-sm text-muted-foreground">
          {t.calendarScope.noSuggestions}
        </p>
      ) : (
        <ul className="space-y-2">
          {suggestions.map((suggestion) => {
            const done = added.has(suggestion.date) || taken.has(suggestion.date);
            return (
              <li
                key={suggestion.date}
                className="flex flex-wrap items-center gap-3 rounded-2xl bg-secondary px-4 py-3"
              >
                <span className="text-sm font-bold text-foreground">
                  <Latin>{formatDate(suggestion.date)}</Latin>
                </span>
                <span className="text-sm font-semibold text-foreground">
                  <Latin>{suggestion.name}</Latin>
                </span>
                <span
                  className={cn(
                    "inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[11px] font-bold",
                    suggestion.status === "announced"
                      ? "bg-success-soft text-success"
                      : "bg-warning-soft text-warning",
                  )}
                >
                  {suggestion.status === "announced" ? (
                    <Check className="size-3" aria-hidden />
                  ) : (
                    <Sparkles className="size-3" aria-hidden />
                  )}
                  {suggestion.status === "announced"
                    ? t.calendarScope.announced
                    : t.calendarScope.expected}
                </span>
                {suggestion.note ? (
                  <span className="w-full text-xs text-muted-foreground sm:w-auto">
                    <Latin>{suggestion.note}</Latin>
                  </span>
                ) : null}
                {canManage ? (
                  <button
                    type="button"
                    disabled={pending || done}
                    onClick={() => add(suggestion)}
                    className={cn(
                      "ms-auto rounded-xl px-3 py-1.5 text-xs font-bold transition-all disabled:opacity-70",
                      done ? "bg-success-soft text-success" : "bg-primary text-primary-foreground",
                    )}
                  >
                    {done ? t.calendarScope.added : t.calendarScope.addToCalendar}
                  </button>
                ) : null}
              </li>
            );
          })}
        </ul>
      )}

      {cost !== null ? (
        <p className="mt-3 text-xs text-muted-foreground">
          <Fill template={t.calendarScope.suggestCost} values={{ amount: `Rs ${cost}` }} />
        </p>
      ) : null}
    </Card>
  );
}
