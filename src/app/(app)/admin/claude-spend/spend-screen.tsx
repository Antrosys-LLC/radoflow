"use client";

import { useActionState, useEffect, useSyncExternalStore } from "react";
import { useRouter } from "next/navigation";
import { useFormStatus } from "react-dom";
import { AlertTriangle, Coins, Gauge, Save } from "lucide-react";

import { ClaudeIcon } from "@/components/claude-icon";
import { toast } from "sonner";

import { Fill } from "@/components/fill";
import { useDictionary } from "@/components/language-provider";
import { Latin } from "@/components/latin";
import { Card, SectionTitle } from "@/components/ui-kit";
import type { BudgetState } from "@/lib/assistant/budget";
import { usdToPkr, type DailySpend } from "@/lib/assistant/spend";
import { createTickStore } from "@/lib/tick";
import { formatDate } from "@/lib/time";
import { cn } from "@/lib/utils";

import { saveSpendSettings, type SettingsResult } from "./actions";

/**
 * What Claude is costing, in rupees.
 *
 * The per-second figure is the one that was asked for, and it is the one most
 * likely to be misread — so it is labelled as an average and the window it is
 * averaged over is stated beside it. Anthropic reports cost by the day; there
 * is no per-second measurement to be had, and quoting a derived rate as though
 * it were live would be a lie about somebody's money.
 *
 * The ticker below it is honest about being an estimate too: it is the average
 * rate multiplied by the seconds since midnight, not a reading. It exists
 * because a rate per second means nothing to most people until they watch it
 * add up.
 */

const INITIAL: SettingsResult = { ok: false, message: "" };

const INPUT =
  "mt-1 w-full rounded-2xl border border-input bg-background px-4 py-3 font-latin text-sm text-foreground outline-none transition-all focus:border-primary focus:ring-2 focus:ring-primary/30";

export interface SpendView {
  days: DailySpend[];
  /** Null when the report could not be fetched — see `problem`. */
  problem: { reason: "not-configured" | "refused" | "unreachable"; detail?: string } | null;
  usdToPkrRate: number;
  taxPercent: number;
  /** What this app itself spent, from its own log. Always available. */
  appUsd: number;
  appCalls: number;
  canManage: boolean;
  /** The month's ceiling and what is left of it. */
  budget: BudgetState;
}

function rupees(value: number): string {
  return `Rs ${value.toLocaleString("en-PK", { maximumFractionDigits: 2, minimumFractionDigits: 2 })}`;
}

export function SpendScreen({ view }: { view: SpendView }) {
  const t = useDictionary();

  const today = view.days.at(-1)?.usd ?? 0;
  const monthUsd = view.days.reduce((total, day) => total + day.usd, 0);
  // Averaged over the days actually reported, not over a fixed 30 — a new
  // account has fewer, and dividing by 30 would understate the rate.
  const perSecondUsd = view.days.length > 0 ? monthUsd / (view.days.length * 86_400) : 0;

  const toPkr = (usd: number) => usdToPkr(usd, view.usdToPkrRate, view.taxPercent);

  return (
    <div className="space-y-5 pb-6">
      <Card className="p-4 sm:p-6">
        <SectionTitle icon={ClaudeIcon} title={t.spend.title} subtitle={t.spend.subtitle} />

        {view.problem ? (
          <div className="flex items-start gap-3 rounded-2xl bg-warning-soft px-4 py-3">
            <AlertTriangle className="mt-0.5 size-4 shrink-0 text-warning" />
            <div className="text-sm text-foreground">
              <p className="font-bold">
                {view.problem.reason === "not-configured"
                  ? t.spend.notConfigured
                  : view.problem.reason === "refused"
                    ? t.spend.refused
                    : t.spend.unreachable}
              </p>
              <p className="mt-0.5 text-muted-foreground">
                {view.problem.reason === "not-configured"
                  ? t.spend.notConfiguredHint
                  : t.spend.problemHint}
              </p>
              {/* The API's own words, in English, wrapped: a paraphrase would
                  hide which of the several possible refusals this was. */}
              {view.problem.detail ? (
                <p className="mt-1 break-words font-latin text-[11px] text-muted-foreground">
                  <Latin>{view.problem.detail}</Latin>
                </p>
              ) : null}
            </div>
          </div>
        ) : (
          <>
            <div className="grid gap-3 sm:grid-cols-3">
              <Figure label={t.spend.perSecond} value={rupees(toPkr(perSecondUsd))} tone="primary">
                <Fill template={t.spend.averagedOver} values={{ days: view.days.length }} />
              </Figure>
              <Figure label={t.spend.today} value={rupees(toPkr(today))} />
              <Figure label={t.spend.thisPeriod} value={rupees(toPkr(monthUsd))}>
                <Fill template={t.spend.acrossDays} values={{ days: view.days.length }} />
              </Figure>
            </div>

            <Ticker perSecondPkr={toPkr(perSecondUsd)} label={t.spend.sinceMidnight} />

            {view.days.length > 0 ? (
              <ul className="mt-4 space-y-1.5">
                {[...view.days]
                  .reverse()
                  .slice(0, 10)
                  .map((day) => (
                    <li
                      key={day.day}
                      className="flex items-center justify-between gap-3 rounded-2xl bg-secondary px-4 py-2 text-sm"
                    >
                      <span className="text-muted-foreground">
                        <Latin>{formatDate(day.day)}</Latin>
                      </span>
                      <span className="font-bold tabular-nums text-foreground">
                        <Latin>{rupees(toPkr(day.usd))}</Latin>
                      </span>
                    </li>
                  ))}
              </ul>
            ) : null}
          </>
        )}
      </Card>

      {/*
       * The ceiling, first, and above the account statement on purpose: the
       * statement is what has been spent and this is what may be. It is also
       * the only figure on this screen that changes what the app *does* — over
       * the line, every Ask button stops answering.
       */}
      <Card className="p-4 sm:p-6">
        <SectionTitle icon={Gauge} title={t.spend.budgetTitle} subtitle={t.spend.budgetHint} />

        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <p
            className={cn(
              "text-2xl font-bold tabular-nums",
              view.budget.overBudget ? "text-danger" : "text-foreground",
            )}
          >
            <Latin>{`${rupees(view.budget.spentPkr)} / ${rupees(view.budget.limitPkr)}`}</Latin>
          </p>
          <p className="text-xs font-semibold text-muted-foreground">
            {view.budget.overBudget ? (
              t.spend.budgetSpent
            ) : (
              <Fill
                template={t.spend.budgetLeft}
                values={{ amount: rupees(view.budget.remainingPkr) }}
              />
            )}
          </p>
        </div>

        {/* A bar rather than a percentage: the question is "how much is
            left", and a length answers it without being read. */}
        <div
          className="mt-2 h-2 w-full overflow-hidden rounded-full bg-secondary"
          role="img"
          aria-label={`${Math.round(view.budget.fraction * 100)}%`}
        >
          <div
            className={cn(
              "h-full rounded-full transition-all",
              view.budget.overBudget
                ? "bg-danger"
                : view.budget.fraction > 0.8
                  ? "bg-warning"
                  : "bg-success",
            )}
            style={{ width: `${Math.max(2, view.budget.fraction * 100)}%` }}
          />
        </div>

        {view.budget.overBudget ? (
          <p className="mt-3 rounded-2xl bg-danger-soft px-4 py-3 text-sm font-semibold text-danger">
            {t.spend.budgetReached}
          </p>
        ) : null}
      </Card>

      {/* The app's own tally, always available and always narrower than the
          account's: it counts what this factory asked, and nothing else
          billed to the same Anthropic account. Shown beside the statement
          rather than instead of it, so the two can be compared. */}
      <Card className="p-4 sm:p-6">
        <SectionTitle icon={Gauge} title={t.spend.appTitle} subtitle={t.spend.appSubtitle} />
        <div className="grid gap-3 sm:grid-cols-2">
          <Figure label={t.spend.appSpend} value={rupees(toPkr(view.appUsd))} />
          <Figure label={t.spend.appCalls} value={view.appCalls.toLocaleString("en-PK")} />
        </div>
      </Card>

      <Card className="p-4 sm:p-6">
        <SectionTitle icon={Coins} title={t.spend.settingsTitle} subtitle={t.spend.settingsHint} />
        {view.canManage ? (
          <SettingsForm
            rate={view.usdToPkrRate}
            tax={view.taxPercent}
            limit={view.budget.limitPkr}
          />
        ) : (
          <p className="text-sm text-muted-foreground">{t.spend.settingsReadOnly}</p>
        )}
      </Card>
    </div>
  );
}

function Figure({
  label,
  value,
  tone,
  children,
}: {
  label: string;
  value: string;
  tone?: "primary";
  children?: React.ReactNode;
}) {
  return (
    <div className="rounded-2xl bg-secondary px-4 py-3">
      <p className="text-[11px] font-bold uppercase tracking-wide text-muted-foreground">{label}</p>
      <p
        className={cn(
          "mt-0.5 text-xl font-bold tabular-nums",
          tone === "primary" ? "text-primary" : "text-foreground",
        )}
      >
        <Latin>{value}</Latin>
      </p>
      {children ? <p className="text-[11px] text-muted-foreground">{children}</p> : null}
    </div>
  );
}

/**
 * The rate, added up since midnight.
 *
 * Deliberately an estimate and labelled as one. It ticks because a figure like
 * "Rs 0.004 a second" is unreadable as a rate and obvious as a total.
 */
/**
 * Seconds elapsed since local midnight, as an external store.
 *
 * `useSyncExternalStore` rather than state written from an effect: the server
 * has no clock the browser agrees with, so the first paint must be a fixed
 * zero and the real figure has to arrive after hydration. This is the shape
 * React provides for exactly that, and it keeps the tick out of render.
 */
const seconds = createTickStore(1000);

/** Seconds elapsed today, from the store's cached reading. */
function secondsSinceMidnight(at: number): number {
  if (at === 0) return 0;
  const now = new Date(at);
  return now.getHours() * 3600 + now.getMinutes() * 60 + now.getSeconds();
}

/**
 * The rate, added up since midnight.
 *
 * Deliberately an estimate and labelled as one. It ticks because a figure like
 * "Rs 0.004 a second" is unreadable as a rate and obvious as a total.
 */
function Ticker({ perSecondPkr, label }: { perSecondPkr: number; label: React.ReactNode }) {
  const at = useSyncExternalStore(
    seconds.subscribe,
    seconds.getSnapshot,
    seconds.getServerSnapshot,
  );
  const elapsed = secondsSinceMidnight(at);

  return (
    <div className="mt-3 rounded-2xl bg-primary-soft px-4 py-3">
      <p className="text-[11px] font-bold uppercase tracking-wide text-primary">{label}</p>
      <p className="mt-0.5 text-2xl font-bold tabular-nums text-foreground">
        <Latin>{rupees(perSecondPkr * elapsed)}</Latin>
      </p>
    </div>
  );
}

function SettingsForm({ rate, tax, limit }: { rate: number; tax: number; limit: number }) {
  const t = useDictionary();
  const router = useRouter();
  const [state, action] = useActionState(saveSpendSettings, INITIAL);

  useEffect(() => {
    if (!state.message) return;
    if (state.ok) {
      toast.success(state.message);
      router.refresh();
    } else {
      toast.error(state.message);
    }
    // `state` is the only trigger; the router is stable.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state]);

  return (
    <form action={action} className="grid gap-4 sm:grid-cols-[1fr_1fr_1fr_auto]">
      <label className="block">
        <span className="text-xs font-bold text-muted-foreground">{t.spend.rate}</span>
        <input
          name="usd_to_pkr"
          type="number"
          step="0.01"
          min="1"
          required
          defaultValue={rate}
          dir="ltr"
          className={INPUT}
        />
      </label>
      <label className="block">
        <span className="text-xs font-bold text-muted-foreground">{t.spend.limit}</span>
        <input
          name="monthly_limit_pkr"
          type="number"
          step="50"
          min="1"
          required
          defaultValue={limit}
          dir="ltr"
          className={INPUT}
        />
      </label>
      <label className="block">
        <span className="text-xs font-bold text-muted-foreground">{t.spend.tax}</span>
        <input
          name="tax_percent"
          type="number"
          step="0.1"
          min="0"
          max="100"
          required
          defaultValue={tax}
          dir="ltr"
          className={INPUT}
        />
      </label>
      <div className="flex items-end">
        <SaveButton />
      </div>
    </form>
  );
}

function SaveButton() {
  const t = useDictionary();
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="inline-flex h-[46px] items-center gap-2 rounded-2xl bg-primary px-5 text-sm font-bold text-primary-foreground transition-all hover:-translate-y-0.5 disabled:opacity-60"
    >
      <Save className="size-4" aria-hidden />
      {pending ? t.common.saving : t.common.save}
    </button>
  );
}
