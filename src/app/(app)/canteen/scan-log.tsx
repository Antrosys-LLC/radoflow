"use client";

import { useMemo, useState } from "react";
import { Ban, Check, Clock, HelpCircle, ListChecks } from "lucide-react";

import { useDictionary } from "@/components/language-provider";
import { Latin } from "@/components/latin";
import { Avatar, Card, SectionTitle } from "@/components/ui-kit";
import { formatTime } from "@/lib/time";
import type { Dictionary } from "@/lib/i18n";
import { cn } from "@/lib/utils";

/**
 * Every scan of the day, and what came of it.
 *
 * The counter panel answers one question for one man at the front of the
 * queue, and then forgets him. This is the other half: the office asking who
 * actually ate. A tally alone cannot settle the two arguments that come up —
 * "I never got food today" and "he ate twice" — because a number has no names
 * in it. Each row does: the person, the minute, and the outcome.
 *
 * Refused and unrecognised scans are kept rather than filtered out. A finger
 * the terminal did not know is the reason someone went without lunch, and it
 * is invisible everywhere else in the app.
 *
 * Only shown to `canteen.view`. The counter itself never sees it — the man
 * serving plates does not need a register, and a screen with four hundred
 * names on it is a screen with a queue behind it.
 */

export interface ScanLogRow {
  id: string;
  outcome: "served" | "duplicate" | "unknown_person" | "outside_window";
  fullName: string | null;
  employeeCode: string | null;
  photoUrl: string | null;
  mealName: string | null;
  deviceName: string | null;
  scannedAt: string;
}

/**
 * One entry per `meal_scan_outcome` member.
 *
 * These are the *nouns* — what happened — not the counter's instruction. The
 * counter says "Give food"; a register says "Served". They are different
 * words in every language, which is why this does not reuse `OUTCOME` from
 * the counter screen.
 */
const OUTCOME = {
  served: {
    icon: Check,
    label: (t: Dictionary) => t.canteenLog.served,
    tone: "bg-success-soft text-success",
  },
  duplicate: {
    icon: Ban,
    label: (t: Dictionary) => t.canteenLog.refused,
    tone: "bg-danger-soft text-danger",
  },
  unknown_person: {
    icon: HelpCircle,
    label: (t: Dictionary) => t.canteenLog.notRecognised,
    tone: "bg-secondary text-muted-foreground",
  },
  outside_window: {
    icon: Clock,
    label: (t: Dictionary) => t.canteenLog.counterClosed,
    tone: "bg-secondary text-muted-foreground",
  },
} as const;

type Filter = "all" | "served" | "duplicate" | "unknown_person";

export function ScanLog({ rows }: { rows: ScanLogRow[] }) {
  const t = useDictionary();
  const [filter, setFilter] = useState<Filter>("all");

  const counts = useMemo(
    () => ({
      all: rows.length,
      served: rows.filter((row) => row.outcome === "served").length,
      duplicate: rows.filter((row) => row.outcome === "duplicate").length,
      unknown_person: rows.filter((row) => row.outcome === "unknown_person").length,
    }),
    [rows],
  );

  const visible = filter === "all" ? rows : rows.filter((row) => row.outcome === filter);

  const FILTERS: { key: Filter; label: string }[] = [
    { key: "all", label: t.canteenLog.everyScan },
    { key: "served", label: t.canteenLog.served },
    { key: "duplicate", label: t.canteenLog.refused },
    { key: "unknown_person", label: t.canteenLog.notRecognised },
  ];

  return (
    <Card className="p-4 sm:p-6">
      <SectionTitle icon={ListChecks} title={t.canteenLog.title} subtitle={t.canteenLog.subtitle} />

      <div className="mt-4 flex flex-wrap gap-2">
        {FILTERS.map((option) => (
          <button
            key={option.key}
            type="button"
            onClick={() => setFilter(option.key)}
            aria-pressed={filter === option.key}
            className={cn(
              "inline-flex items-center gap-2 rounded-2xl px-4 py-2 text-xs font-bold transition-all",
              filter === option.key
                ? "bg-primary text-primary-foreground"
                : "bg-secondary text-muted-foreground hover:text-foreground",
            )}
          >
            {option.label}
            <span className="tabular-nums opacity-80">
              <Latin>{counts[option.key]}</Latin>
            </span>
          </button>
        ))}
      </div>

      {visible.length === 0 ? (
        <div className="mt-4 rounded-2xl bg-secondary px-5 py-10 text-center">
          <p className="text-sm font-bold text-foreground">{t.canteenLog.nothingToday}</p>
          <p className="mt-1 text-xs text-muted-foreground">{t.canteenLog.nothingTodayHint}</p>
        </div>
      ) : (
        <ul className="mt-4 space-y-2">
          {visible.map((row) => {
            const style = OUTCOME[row.outcome];
            const Icon = style.icon;

            return (
              <li
                key={row.id}
                className="flex items-center gap-3 rounded-2xl bg-secondary px-3 py-3 sm:px-4"
              >
                {row.photoUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={row.photoUrl}
                    alt=""
                    className="size-11 shrink-0 rounded-2xl object-cover"
                  />
                ) : (
                  <Avatar name={row.fullName ?? "?"} className="size-11 shrink-0 rounded-2xl" />
                )}

                <div className="min-w-0 flex-1">
                  {/* A name and an employee code, so Latin in every language —
                      a code reordered to `1042-RD` on the one screen that says
                      which man ate would be worse than an untranslated label. */}
                  <p className="truncate text-sm font-bold text-foreground">
                    {row.fullName ? <Latin>{row.fullName}</Latin> : t.canteenLog.unknownWorker}
                  </p>
                  <p className="truncate text-xs text-muted-foreground">
                    {row.employeeCode ? <Latin>{row.employeeCode}</Latin> : null}
                    {row.employeeCode && row.mealName ? " · " : null}
                    {row.mealName ? <Latin>{row.mealName}</Latin> : null}
                    {(row.employeeCode || row.mealName) && row.deviceName ? " · " : null}
                    {row.deviceName ? <Latin>{row.deviceName}</Latin> : null}
                  </p>
                </div>

                {/* Digits, always left to right: the minute is what settles
                    an argument, and a reordered clock time invents one. */}
                <span className="shrink-0 text-sm font-bold tabular-nums text-foreground">
                  <Latin>{formatTime(row.scannedAt)}</Latin>
                </span>

                <span
                  className={cn(
                    "inline-flex shrink-0 items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-bold",
                    style.tone,
                  )}
                >
                  <Icon className="size-3.5" aria-hidden />
                  <span className="hidden sm:inline">{style.label(t)}</span>
                </span>
              </li>
            );
          })}
        </ul>
      )}
    </Card>
  );
}
