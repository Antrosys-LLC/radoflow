import { roundMoney } from "./hours";
import type { AttendanceDay, LatePenaltyTier, PayslipLine } from "./types";

/**
 * Late-arrival deductions.
 *
 * Each day's lateness is matched to at most one tier — the bands are read as
 * a ladder, not cumulative, so arriving 90 minutes late costs the 1–2 hour
 * penalty and not the sum of every band beneath it.
 */

export function findTier(
  minutesLate: number,
  tiers: readonly LatePenaltyTier[],
): LatePenaltyTier | null {
  if (minutesLate <= 0) return null;

  // Most specific band first: the narrowest matching range wins, so an
  // open-ended "beyond 2 hours" rule cannot swallow the tighter bands.
  const matching = tiers.filter(
    (tier) =>
      minutesLate >= tier.fromMinutes && (tier.toMinutes === null || minutesLate < tier.toMinutes),
  );

  if (matching.length === 0) return null;

  return matching.reduce((best, tier) => {
    const bestWidth = (best.toMinutes ?? Number.POSITIVE_INFINITY) - best.fromMinutes;
    const width = (tier.toMinutes ?? Number.POSITIVE_INFINITY) - tier.fromMinutes;
    return width < bestWidth ? tier : best;
  });
}

export interface LatePenaltyResult {
  total: number;
  daysLate: number;
  lines: PayslipLine[];
}

/**
 * Totals the month's late deductions.
 *
 * `dayRate` is one day's pay and `monthlyBase` the full month, so a tier can
 * be expressed against either without the caller guessing which was meant.
 */
export function calculateLatePenalties(
  days: readonly AttendanceDay[],
  tiers: readonly LatePenaltyTier[],
  dayRate: number,
  monthlyBase: number,
): LatePenaltyResult {
  if (tiers.length === 0) return { total: 0, daysLate: 0, lines: [] };

  let total = 0;
  let daysLate = 0;
  const byTier = new Map<string, { tier: LatePenaltyTier; count: number; amount: number }>();

  for (const day of days) {
    const minutesLate = day.minutesLate ?? 0;
    const tier = findTier(minutesLate, tiers);
    if (!tier) continue;

    const base = tier.basis === "month" ? monthlyBase : dayRate;
    const amount = roundMoney((base * tier.penaltyPercent) / 100);
    if (amount <= 0) continue;

    daysLate += 1;
    total = roundMoney(total + amount);

    const existing = byTier.get(tier.label);
    if (existing) {
      existing.count += 1;
      existing.amount = roundMoney(existing.amount + amount);
    } else {
      byTier.set(tier.label, { tier, count: 1, amount });
    }
  }

  // One payslip line per tier rather than per day, so a month with twelve
  // small latenesses stays readable.
  const lines: PayslipLine[] = [...byTier.values()].map(({ tier, count, amount }) => ({
    code: `LATE_${tier.fromMinutes}`,
    label: `${tier.label} (${count} day${count === 1 ? "" : "s"} × ${tier.penaltyPercent}% of ${
      tier.basis === "month" ? "monthly pay" : "daily pay"
    })`,
    kind: "deduction",
    amount,
  }));

  return { total, daysLate, lines };
}
