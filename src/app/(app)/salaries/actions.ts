"use server";

import { revalidatePath } from "next/cache";

import { markItemPaid, markItemUnpaid } from "@/app/(app)/payroll/actions";
import { requireAnyPermission } from "@/lib/auth/session";
import {
  loanBalance,
  monthOf,
  planLoan,
  type LoanRow,
  type RecoveryRow,
} from "@/lib/payroll/ledger";
import { createClient } from "@/lib/supabase/server";
import { todayInPakistan } from "@/lib/time";

/**
 * The salary ledger, written from the salaries screen.
 *
 * Whoever runs or pays payroll keeps these, which is the same line the table
 * policies draw. Every write revalidates payroll as well: an advance added
 * today changes what this month's run takes off, and the pay screen has to
 * say so the next time it is opened.
 */

export interface SalaryResult {
  ok: boolean;
  message: string;
}

const KINDS = ["advance", "advance_2", "suit", "allowance", "deduction"] as const;
type Kind = (typeof KINDS)[number];

function text(form: FormData, key: string): string {
  return String(form.get(key) ?? "").trim();
}

function refresh() {
  revalidatePath("/salaries");
  revalidatePath("/payroll");
}

/** `YYYY-MM` from a month input, as the first of that month. */
function readMonth(value: string): string | null {
  return /^\d{4}-\d{2}$/.test(value)
    ? `${value}-01`
    : /^\d{4}-\d{2}-\d{2}$/.test(value)
      ? monthOf(value)
      : null;
}

function readDate(value: string): string | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const parsed = new Date(`${value}T00:00:00Z`);
  return Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== value
    ? null
    : value;
}

export async function addAdjustment(_prev: SalaryResult, form: FormData): Promise<SalaryResult> {
  const session = await requireAnyPermission(["payroll.pay", "payroll.run"]);

  const profileId = text(form, "profile_id");
  const kind = text(form, "kind") as Kind;
  const amount = Number(text(form, "amount"));
  const month = readMonth(text(form, "month"));
  const givenOn = text(form, "given_on") ? readDate(text(form, "given_on")) : null;

  if (!profileId) return { ok: false, message: "Choose who this is for." };
  if (!KINDS.includes(kind)) return { ok: false, message: "Choose what kind of entry this is." };
  if (!(amount > 0)) return { ok: false, message: "Enter an amount greater than zero." };
  if (!month) return { ok: false, message: "Choose the month it belongs to." };

  const supabase = await createClient();
  const { error } = await supabase.from("salary_adjustments").insert({
    profile_id: profileId,
    kind,
    amount: Math.round(amount * 100) / 100,
    month,
    label: text(form, "label") || null,
    note: text(form, "note") || null,
    given_on: givenOn,
    created_by: session.userId,
  });

  if (error) return { ok: false, message: error.message };
  refresh();
  return {
    ok: true,
    message: "Added. It comes off — or onto — this month's pay when payroll runs.",
  };
}

export async function deleteAdjustment(id: string): Promise<SalaryResult> {
  await requireAnyPermission(["payroll.pay", "payroll.run"]);
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("salary_adjustments")
    .delete()
    .eq("id", id)
    .select("id");
  if (error) return { ok: false, message: error.message };
  if (!data || data.length === 0) return { ok: false, message: "That entry is no longer there." };

  refresh();
  return { ok: true, message: "Removed." };
}

export async function addLoan(_prev: SalaryResult, form: FormData): Promise<SalaryResult> {
  const session = await requireAnyPermission(["payroll.pay", "payroll.run"]);

  const profileId = text(form, "profile_id");
  const principal = Number(text(form, "principal"));
  const mode = text(form, "mode") === "months" ? "months" : "installment";
  const value = Number(text(form, "plan_value"));
  const firstMonth = readMonth(text(form, "first_month"));
  const takenOn = readDate(text(form, "taken_on")) ?? todayInPakistan();

  if (!profileId) return { ok: false, message: "Choose who took the loan." };
  if (!(principal > 0)) return { ok: false, message: "Enter the loan amount." };
  if (!firstMonth)
    return { ok: false, message: "Choose the first month an installment comes off pay." };

  const plan = planLoan(principal, mode === "months" ? { months: value } : { installment: value });
  if (!plan) {
    return {
      ok: false,
      message:
        mode === "months"
          ? "Enter how many months it is paid back over."
          : "Enter how much comes off pay each month.",
    };
  }

  const supabase = await createClient();
  const { error } = await supabase.from("employee_loans").insert({
    profile_id: profileId,
    principal: Math.round(principal * 100) / 100,
    installment: plan.installment,
    installments: plan.installments,
    first_month: firstMonth,
    taken_on: takenOn,
    note: text(form, "note") || null,
    created_by: session.userId,
  });

  if (error) return { ok: false, message: error.message };
  refresh();
  return {
    ok: true,
    message: `Loan added: ${plan.installments} installments of Rs ${plan.installment.toLocaleString("en-PK")}.`,
  };
}

/**
 * Cash paid back by hand, outside payroll.
 *
 * Added to any cash already recorded for the month rather than replacing it,
 * and the loan is marked settled the moment nothing is left.
 */
export async function recordRepayment(loanId: string, amount: number): Promise<SalaryResult> {
  await requireAnyPermission(["payroll.pay", "payroll.run"]);

  if (!(amount > 0)) return { ok: false, message: "Enter the amount repaid." };

  const supabase = await createClient();
  const [{ data: loan }, { data: recoveries }] = await Promise.all([
    supabase
      .from("employee_loans")
      .select("id, profile_id, principal, installment, installments, first_month, status")
      .eq("id", loanId)
      .maybeSingle(),
    supabase.from("loan_recoveries").select("loan_id, month, amount, source").eq("loan_id", loanId),
  ]);

  if (!loan) return { ok: false, message: "That loan is no longer there." };
  if (loan.status !== "active") return { ok: false, message: "That loan is not being paid back." };

  const balance = loanBalance(loan as LoanRow, (recoveries ?? []) as RecoveryRow[]);
  if (amount > balance) {
    return {
      ok: false,
      message: `Only Rs ${balance.toLocaleString("en-PK")} is left on this loan.`,
    };
  }

  const month = monthOf(todayInPakistan());
  const existing = (recoveries ?? []).find((row) => row.month === month && row.source === "manual");
  const total = Math.round((Number(existing?.amount ?? 0) + amount) * 100) / 100;

  const { error } = await supabase
    .from("loan_recoveries")
    .upsert(
      { loan_id: loanId, month, amount: total, source: "manual", note: "Cash repayment" },
      { onConflict: "loan_id,month,source" },
    );
  if (error) return { ok: false, message: error.message };

  if (balance - amount <= 0) {
    await supabase.from("employee_loans").update({ status: "settled" }).eq("id", loanId);
  }

  refresh();
  return {
    ok: true,
    message:
      balance - amount <= 0
        ? "Repayment recorded. The loan is paid off."
        : `Repayment recorded. Rs ${(balance - amount).toLocaleString("en-PK")} left.`,
  };
}

export async function cancelLoan(loanId: string): Promise<SalaryResult> {
  await requireAnyPermission(["payroll.pay", "payroll.run"]);
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("employee_loans")
    .update({ status: "cancelled" })
    .eq("id", loanId)
    .eq("status", "active")
    .select("id");

  if (error) return { ok: false, message: error.message };
  if (!data || data.length === 0) return { ok: false, message: "That loan is not active." };

  refresh();
  return { ok: true, message: "Loan cancelled. Nothing more will come off pay for it." };
}

/** What was actually handed over, against the calculated salary. */
export async function markSalaryPaid(
  itemId: string,
  amount: number | null,
  note: string,
): Promise<SalaryResult> {
  const result = await markItemPaid(itemId, amount, note.trim() || null);
  if (result.ok) refresh();
  return result;
}

export async function unmarkSalaryPaid(itemId: string): Promise<SalaryResult> {
  const result = await markItemUnpaid(itemId);
  if (result.ok) refresh();
  return result;
}
