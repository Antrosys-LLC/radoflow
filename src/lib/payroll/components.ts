import { roundMoney } from "./hours";
import type { PayClass, PayComponent, PayslipLine, Slab } from "./types";

/**
 * Evaluates a progressive slab table against a base amount.
 *
 * Each bracket's rate applies only to the portion of the base that falls
 * inside it, which is how Pakistani income-tax slabs work — a raise into a
 * higher bracket never reduces take-home pay.
 */
export function evaluateSlabs(base: number, slabs: readonly Slab[]): number {
  if (base <= 0 || slabs.length === 0) return 0;

  // "and above" (upto: null) always sorts last.
  const ordered = [...slabs].sort((a, b) => (a.upto ?? Infinity) - (b.upto ?? Infinity));

  let lowerBound = 0;
  let total = 0;

  for (const slab of ordered) {
    const upperBound = slab.upto ?? Number.POSITIVE_INFINITY;
    const portion = Math.min(base, upperBound) - lowerBound;
    if (portion > 0) {
      total += portion * (slab.rate / 100);
    }
    lowerBound = upperBound;
    if (base <= upperBound) break;
  }

  return roundMoney(total);
}

/** Resolves one component to a money amount for the given base. */
export function evaluateComponent(component: PayComponent, base: number): number {
  switch (component.calc) {
    case "fixed":
      return roundMoney(component.amount);
    case "percent":
      return roundMoney((base * component.percent) / 100);
    case "slab":
      return evaluateSlabs(base, component.slabs ?? []);
    default:
      return 0;
  }
}

export interface ComponentTotals {
  earnings: number;
  deductions: number;
  tax: number;
  lines: PayslipLine[];
}

/**
 * Applies every component that is in scope for this employee.
 *
 * `earningsBase` drives percentage earnings (allowances on base pay), while
 * `deductionBase` drives deductions and tax — normally gross, so a percentage
 * deduction accounts for overtime the worker actually earned.
 */
export function applyComponents(
  components: readonly PayComponent[],
  payClass: PayClass,
  earningsBase: number,
  deductionBase: number,
): ComponentTotals {
  const inScope = components
    .filter((c) => c.appliesTo == null || c.appliesTo === payClass)
    .sort((a, b) => a.sortOrder - b.sortOrder);

  const lines: PayslipLine[] = [];
  let earnings = 0;
  let deductions = 0;
  let tax = 0;

  for (const component of inScope) {
    const base = component.kind === "earning" ? earningsBase : deductionBase;
    const amount = evaluateComponent(component, base);
    if (amount === 0) continue;

    lines.push({
      code: component.code,
      label: component.label,
      kind: component.kind,
      amount,
    });

    if (component.kind === "earning") earnings = roundMoney(earnings + amount);
    else if (component.kind === "deduction") deductions = roundMoney(deductions + amount);
    else tax = roundMoney(tax + amount);
  }

  return { earnings, deductions, tax, lines };
}
