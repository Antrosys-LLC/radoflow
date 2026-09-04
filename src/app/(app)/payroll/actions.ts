"use server";

import { revalidatePath } from "next/cache";

import { reviewPayrollAnomalies } from "@/lib/assistant/payroll-review";
import { requirePermission } from "@/lib/auth/session";
import { approvalRowFor, needsApproval } from "@/lib/payroll/approval";
import { runPayrollForPeriod } from "@/lib/payroll/run";
import { createClient } from "@/lib/supabase/server";
import { formatPKR } from "@/lib/time";

export interface PayrollResultMessage {
  ok: boolean;
  message: string;
}

/**
 * Shown when a write passed its permission check but changed no row.
 *
 * In practice that means the row-level policy and the permission catalogue
 * disagree. Saying so plainly beats a cheerful success message that leaves
 * the money unrecorded, and names the thing an administrator would need to
 * look at.
 */
const NOT_WRITTEN =
  "Nothing was saved — your role can reach this screen but is not permitted to write the change. Ask an administrator to check the payroll permissions.";

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
  const session = await requirePermission("payroll.run");

  try {
    const summary = await runPayrollForPeriod(periodId);

    /*
     * Accounts computes; an admin releases. Queuing the run rather than
     * leaving it in `review` is what actually puts it in front of someone —
     * `public.approvals` is what the approval panels read.
     */
    if (needsApproval(session.permissions)) {
      const supabase = await createClient();
      const { data: period } = await supabase
        .from("payroll_periods")
        .select("site_id, label")
        .eq("id", periodId)
        .maybeSingle();

      if (period) {
        const { error: approvalError } = await supabase.from("approvals").insert(
          approvalRowFor({
            periodId,
            siteId: period.site_id,
            label: period.label,
            requestedBy: session.userId,
            headcount: summary.headcount,
            net: summary.net,
          }),
        );

        if (approvalError) {
          /*
           * The run itself succeeded and its numbers are correct, so this must not
           * fail the action — but a queue nobody was added to is exactly the silence
           * this approval exists to prevent, so it cannot be swallowed either.
           */
          console.error(
            `[payroll] period ${periodId} calculated but its approval could not be queued: ${approvalError.message}`,
          );
        }
      }
    }

    revalidatePath("/payroll");

    const skippedNote =
      summary.skipped.length > 0
        ? ` ${summary.skipped.length} skipped for missing attendance: ${summary.skipped
            .map((s) => s.name)
            .join(", ")}.`
        : "";

    // Best-effort: explains what excessHours and the other anomaly checks
    // already found, in plain language, and writes it onto each flagged
    // line for the payroll screen to show. If the assistant isn't
    // configured or the call fails, fall back to the plain hours-dropped
    // note that needs no AI at all — either way, nothing about the money
    // already calculated above is affected.
    let flaggedNote = "";
    try {
      const review = await reviewPayrollAnomalies(periodId);
      if (review.flagged.length > 0) {
        flaggedNote = ` ${review.flagged.length} need a look before you approve: ${review.flagged
          .map((f) => f.fullName)
          .join(", ")}.`;
      }
    } catch {
      if (summary.flagged.length > 0) {
        flaggedNote = ` ${summary.flagged.length} need a look before you approve — hours the overtime ceiling dropped for: ${summary.flagged
          .map((f) => `${f.name} (${f.hours}h)`)
          .join(", ")}.`;
      }
    }

    return {
      ok: true,
      message: `Calculated ${summary.headcount} employee(s). Net payable ${formatPKR(summary.net)}.${skippedNote}${flaggedNote}`,
    };
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : String(error) };
  }
}

/** Signs the run off. Separate permission from running it, on purpose. */
export async function approvePeriod(periodId: string): Promise<PayrollResultMessage> {
  const session = await requirePermission("payroll.approve");

  const supabase = await createClient();

  /*
   * `.select()` so a period that did not move can be told apart from one that
   * did. The `status = review` guard means matching nothing is an ordinary
   * outcome here, not just an RLS edge case: the run was approved by someone
   * else a moment ago, or it was never calculated. Both leave the update
   * matching zero rows and raising nothing, so without this the second person
   * to press Approve is told they approved a payroll they did not.
   */
  const { data, error } = await supabase
    .from("payroll_periods")
    .update({
      status: "approved",
      approved_by: session.userId,
      approved_at: new Date().toISOString(),
    })
    .eq("id", periodId)
    .eq("status", "review")
    .select("id");

  if (error) return { ok: false, message: error.message };
  if (!data || data.length === 0) {
    return { ok: false, message: await explainUnmovedPeriod(supabase, periodId, "review") };
  }

  revalidatePath("/payroll");
  return { ok: true, message: "Payroll approved and ready for disbursement." };
}

/**
 * Why a status-guarded update changed nothing.
 *
 * Re-reads the period so the message names the real reason. The status is
 * readable even when the write was refused, and "someone approved this
 * already" and "your role may not write this" call for completely different
 * responses from whoever is standing at the screen.
 */
async function explainUnmovedPeriod(
  supabase: Awaited<ReturnType<typeof createClient>>,
  periodId: string,
  expected: "review" | "approved",
): Promise<string> {
  const { data: period } = await supabase
    .from("payroll_periods")
    .select("status")
    .eq("id", periodId)
    .maybeSingle();

  if (!period) return "That pay period no longer exists.";
  if (period.status === expected) return NOT_WRITTEN;

  return `This period is "${period.status}", not "${expected}" — someone else may have moved it. Reload the page to see where it stands.`;
}

/**
 * Closes the run as paid and locks it.
 *
 * Locking is the point: once money has left the account the figures must stop
 * moving, so a later rate change cannot silently rewrite history. Anyone not
 * already individually marked paid — a staggered cash handout that never quite
 * finished — is marked paid in the same stroke, so this still works as a
 * single "pay everyone now" action when the whole run is settled in one
 * sitting.
 */
export async function markPeriodPaid(periodId: string): Promise<PayrollResultMessage> {
  const session = await requirePermission("payroll.pay");

  const supabase = await createClient();
  const now = new Date().toISOString();

  /*
   * The period's state is checked before a single line is touched.
   *
   * Marking everyone paid and only then discovering the period cannot be
   * closed would leave the run's lines settled under a period that is still
   * open — and on a stale tab, on a period somebody else already paid, that
   * is the likely outcome rather than a rare one.
   */
  const { data: period } = await supabase
    .from("payroll_periods")
    .select("status")
    .eq("id", periodId)
    .maybeSingle();

  if (!period) return { ok: false, message: "That pay period no longer exists." };
  if (period.status !== "approved") {
    return { ok: false, message: await explainUnmovedPeriod(supabase, periodId, "approved") };
  }

  /*
   * Lines first, period second, and the error is checked.
   *
   * This order matters: closing the period sets `locked`, and a locked period
   * cannot be recalculated. Locking it and only then failing to settle its
   * lines would strand the run in a state nobody can repair from the app.
   * Settling the lines and failing to lock is recoverable — the marks can be
   * undone and the button pressed again.
   */
  const { error: itemsError } = await supabase
    .from("payroll_items")
    .update({ paid_at: now, paid_by: session.userId })
    .eq("period_id", periodId)
    .is("paid_at", null)
    .select("id");

  if (itemsError) {
    return { ok: false, message: `Nothing was closed — ${itemsError.message}` };
  }

  const { data: closed, error } = await supabase
    .from("payroll_periods")
    .update({ status: "paid", paid_at: now, locked: true })
    .eq("id", periodId)
    .eq("status", "approved")
    .select("id");

  if (error) return { ok: false, message: error.message };
  if (!closed || closed.length === 0) {
    return {
      ok: false,
      message:
        "Everyone is marked paid, but the period could not be closed and locked. Check the payroll permissions, then press this again.",
    };
  }

  revalidatePath("/payroll");
  return { ok: true, message: "Period marked paid and locked." };
}

/**
 * Records that one person was actually handed their cash.
 *
 * Kept separate from `markPeriodPaid`, which closes and locks the whole run:
 * salaries here are paid in cash, by hand, over however many days it takes to
 * reach everyone, and the office needs to know who still hasn't been paid
 * while that is still in progress — not only once the run is fully settled.
 */
export async function markItemPaid(itemId: string): Promise<PayrollResultMessage> {
  const session = await requirePermission("payroll.pay");

  const supabase = await createClient();
  const guardError = await requirePayableItem(supabase, itemId);
  if (guardError) return { ok: false, message: guardError };

  /*
   * `.select()` so the affected rows come back and can be counted.
   *
   * An UPDATE refused by an RLS USING clause matches zero rows and raises
   * nothing, so without this a policy that disagrees with the permission
   * check above would leave the cashier told the money was recorded when no
   * row moved. On a cash payroll that is the worst possible failure — it is
   * the record of who has actually been paid.
   */
  const { data, error } = await supabase
    .from("payroll_items")
    .update({ paid_at: new Date().toISOString(), paid_by: session.userId })
    .eq("id", itemId)
    .select("id");

  if (error) return { ok: false, message: error.message };
  if (!data || data.length === 0) return { ok: false, message: NOT_WRITTEN };

  revalidatePath("/payroll");
  return { ok: true, message: "Marked as paid." };
}

/** Undoes a mistaken tap — the cash was not actually handed over. */
export async function markItemUnpaid(itemId: string): Promise<PayrollResultMessage> {
  await requirePermission("payroll.pay");

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("payroll_items")
    .update({ paid_at: null, paid_by: null })
    .eq("id", itemId)
    .select("id");

  if (error) return { ok: false, message: error.message };
  if (!data || data.length === 0) return { ok: false, message: NOT_WRITTEN };

  revalidatePath("/payroll");
  return { ok: true, message: "Payment mark undone." };
}

/**
 * Refuses to mark a payment before the run behind it has been approved — a
 * cash handout should never run ahead of the sign-off that decided the
 * amount.
 */
async function requirePayableItem(
  supabase: Awaited<ReturnType<typeof createClient>>,
  itemId: string,
): Promise<string | null> {
  const { data: item } = await supabase
    .from("payroll_items")
    .select("period_id")
    .eq("id", itemId)
    .maybeSingle();
  if (!item) return "Payroll line not found.";

  const { data: period } = await supabase
    .from("payroll_periods")
    .select("status")
    .eq("id", item.period_id)
    .maybeSingle();
  if (!period || (period.status !== "approved" && period.status !== "paid")) {
    return "This period must be approved before payments can be marked.";
  }

  return null;
}
