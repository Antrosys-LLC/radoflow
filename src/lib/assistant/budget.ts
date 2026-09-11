/**
 * What the assistant is allowed to spend in a month.
 *
 * A ceiling rather than an alert, because the failure it prevents is not a
 * surprise on a statement — it is a runaway. Every screen in this app now
 * carries an Ask button, each question costs a few rupees, and nothing about a
 * question tells you it is the four hundredth one that hour. A limit that only
 * warns is a limit that gets found out afterwards.
 *
 * A thousand rupees a month is roughly three hundred questions at the rates
 * this app runs at, which is far more than the floor asks and small enough
 * that a bad month costs less than an hour of anybody's time.
 *
 * Pure and dependency-free so the arithmetic can be tested without a database
 * or a clock: the caller supplies the rows, the rate and the month.
 */

import { PAYMENT_TAX_RATE, USD_TO_PKR } from "@/lib/assistant/models";

/** The default ceiling, in rupees, until the office sets its own. */
export const DEFAULT_MONTHLY_LIMIT_PKR = 1000;

export interface UsageRow {
  /** Dollars, before tax or conversion — what the row stored. */
  cost_usd: number;
  /** ISO timestamp. */
  asked_at: string;
}

export interface BudgetState {
  /** Rupees spent so far this month, tax and conversion applied. */
  spentPkr: number;
  limitPkr: number;
  remainingPkr: number;
  /** 0-1, clamped — what a progress bar draws. */
  fraction: number;
  overBudget: boolean;
}

/** The first instant of the month a date falls in, in UTC. */
export function monthStart(when: Date): Date {
  return new Date(Date.UTC(when.getUTCFullYear(), when.getUTCMonth(), 1));
}

/**
 * What the assistant has cost this month, and whether that is over the line.
 *
 * Rows outside the month are ignored rather than trusted to have been filtered
 * by the caller: the query and the arithmetic disagreeing about which month it
 * is would silently reopen the budget on the first of every month at whatever
 * hour the server's clock says.
 */
export function budgetState(
  rows: readonly UsageRow[],
  {
    limitPkr = DEFAULT_MONTHLY_LIMIT_PKR,
    rate = USD_TO_PKR,
    taxPercent = PAYMENT_TAX_RATE * 100,
    now = new Date(),
  }: { limitPkr?: number; rate?: number; taxPercent?: number; now?: Date } = {},
): BudgetState {
  const from = monthStart(now).getTime();

  const usd = rows.reduce((total, row) => {
    const at = Date.parse(row.asked_at);
    if (!Number.isFinite(at) || at < from) return total;
    const cost = Number(row.cost_usd);
    return Number.isFinite(cost) ? total + cost : total;
  }, 0);

  const spentPkr = usd * (1 + taxPercent / 100) * rate;
  const limit = limitPkr > 0 ? limitPkr : DEFAULT_MONTHLY_LIMIT_PKR;

  return {
    spentPkr,
    limitPkr: limit,
    remainingPkr: Math.max(0, limit - spentPkr),
    fraction: Math.min(1, Math.max(0, spentPkr / limit)),
    // At the limit, not past it: the question about to be asked is the one
    // that would take it over, and refusing after the fact is not a ceiling.
    overBudget: spentPkr >= limit,
  };
}
