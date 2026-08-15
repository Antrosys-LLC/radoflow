"use server";

import { revalidatePath } from "next/cache";

import { requirePermission } from "@/lib/auth/session";
import { runPayrollForPeriod } from "@/lib/payroll/run";
import { createClient } from "@/lib/supabase/server";
import { formatPKR } from "@/lib/time";

export interface PayrollResultMessage {
  ok: boolean;
  message: string;
}

/** Opens a pay period. Its dates bound which attendance the run reads. */
export async function createPeriod(
  _prev: PayrollResultMessage,
  form: FormData,
): Promise<PayrollResultMessage> {
  await requirePermission("payroll.run");

  const siteId = String(form.get("site_id") ?? "").trim();
  const start = String(form.get("period_start") ?? "").trim();
  const end = String(form.get("period_end") ?? "").trim();
  const label = String(form.get("label") ?? "").trim();

  if (!siteId || !start || !end) return { ok: false, message: "Choose a factory and both dates." };
  if (end < start) return { ok: false, message: "The end date must be after the start date." };

  const supabase = await createClient();
  const { error } = await supabase.from("payroll_periods").insert({
    site_id: siteId,
    label: label || `${start} to ${end}`,
    period_start: start,
    period_end: end,
    budget: Number(String(form.get("budget") ?? "0")) || 0,
  });

  if (error) {
    if (error.code === "23505") {
      return { ok: false, message: "A period already covers exactly those dates." };
    }
    return { ok: false, message: error.message };
  }

  revalidatePath("/payroll");
  return { ok: true, message: "Pay period created. Run it when attendance is complete." };
}

/**
 * Calculates the period from the attendance the terminals actually recorded.
 *
 * Safe to repeat: every run recomputes from source, so correcting a punch and
 * running again produces the right answer rather than compounding the last one.
 */
export async function runPeriod(periodId: string): Promise<PayrollResultMessage> {
  await requirePermission("payroll.run");

  try {
    const summary = await runPayrollForPeriod(periodId);
    revalidatePath("/payroll");

    const skippedNote =
      summary.skipped.length > 0
        ? ` ${summary.skipped.length} skipped for missing attendance: ${summary.skipped
            .map((s) => s.name)
            .join(", ")}.`
        : "";

    return {
      ok: true,
      message: `Calculated ${summary.headcount} employee(s). Net payable ${formatPKR(summary.net)}.${skippedNote}`,
    };
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : String(error) };
  }
}

/** Signs the run off. Separate permission from running it, on purpose. */
export async function approvePeriod(periodId: string): Promise<PayrollResultMessage> {
  const session = await requirePermission("payroll.approve");

  const supabase = await createClient();
  const { error } = await supabase
    .from("payroll_periods")
    .update({
      status: "approved",
      approved_by: session.userId,
      approved_at: new Date().toISOString(),
    })
    .eq("id", periodId)
    .eq("status", "review");

  if (error) return { ok: false, message: error.message };

  revalidatePath("/payroll");
  return { ok: true, message: "Payroll approved and ready for disbursement." };
}

/**
 * Closes the run as paid and locks it.
 *
 * Locking is the point: once money has left the account the figures must stop
 * moving, so a later rate change cannot silently rewrite history.
 */
export async function markPeriodPaid(periodId: string): Promise<PayrollResultMessage> {
  await requirePermission("payroll.pay");

  const supabase = await createClient();
  const { error } = await supabase
    .from("payroll_periods")
    .update({ status: "paid", paid_at: new Date().toISOString(), locked: true })
    .eq("id", periodId)
    .eq("status", "approved");

  if (error) return { ok: false, message: error.message };

  revalidatePath("/payroll");
  return { ok: true, message: "Period marked paid and locked." };
}
