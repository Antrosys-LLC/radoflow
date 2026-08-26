"use server";

import { revalidatePath } from "next/cache";

import { requirePermission } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";

/**
 * What one person is paid, and the individual lines attached to them.
 *
 * Kept apart from the user-administration actions because two screens now use
 * them: the people list, where pay is one facet of an employee record, and the
 * pay screen, where it is the whole subject.
 */

export interface PayResult {
  ok: boolean;
  message: string;
}

function text(form: FormData, key: string): string {
  return String(form.get(key) ?? "").trim();
}

/**
 * Updates the pay and duty settings on someone's profile.
 *
 * Duty hours are how many hours their salary covers, not how long their shift
 * is: a guard's twelve are all duty, while an operator on the same twelve-hour
 * shift is paid for eight with the last four as overtime.
 */
export async function updateUserPay(_prev: PayResult, form: FormData): Promise<PayResult> {
  await requirePermission("people.manage");

  const userId = text(form, "user_id");
  if (!userId) return { ok: false, message: "No user selected." };

  const workerType = (text(form, "worker_type") || "employee") as "employee" | "contractor";
  const payClass = (text(form, "pay_class") || "monthly") as "monthly" | "hourly";
  const monthlySalary = Number(text(form, "monthly_salary") || 0);
  const hourlyRate = Number(text(form, "hourly_rate") || 0);
  const dutyHours = Number(text(form, "duty_hours") || 8);
  const sundayPolicy = (text(form, "sunday_policy") || "off") as "off" | "optional" | "compulsory";

  if (monthlySalary < 0 || hourlyRate < 0) {
    return { ok: false, message: "Pay cannot be negative." };
  }
  if (dutyHours <= 0 || dutyHours > 24) {
    return { ok: false, message: "Duty hours must be between 1 and 24." };
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from("profiles")
    .update({
      worker_type: workerType,
      pay_class: payClass,
      monthly_salary: monthlySalary,
      hourly_rate: hourlyRate,
      duty_hours: dutyHours,
      sunday_policy: sundayPolicy,
      requires_attendance: form.get("requires_attendance") !== null,
      flexible_hours: form.get("flexible_hours") !== null,
    })
    .eq("id", userId);

  if (error) return { ok: false, message: error.message };

  revalidatePath("/admin/users");
  revalidatePath("/payroll");

  return {
    ok: true,
    message:
      workerType === "contractor"
        ? "Saved. This person is paid the agreed amount flat — no proration, no overtime."
        : "Pay settings saved.",
  };
}

/**
 * Attaches a recurring allowance or deduction to one person.
 *
 * Kept per-person rather than as a site-wide component because these are
 * individual arrangements — a loan repayment, an advance being recovered — that
 * would be wrong to apply to anyone else.
 */
export async function addUserComponent(_prev: PayResult, form: FormData): Promise<PayResult> {
  await requirePermission("rates.manage");

  const userId = text(form, "user_id");
  const label = text(form, "label");
  const amount = Number(text(form, "amount") || 0);
  const kind = (text(form, "kind") || "deduction") as "earning" | "deduction" | "tax";

  if (!userId) return { ok: false, message: "No user selected." };
  if (!label) return { ok: false, message: "Give the line a name, e.g. Advance recovery." };
  if (!(amount > 0)) return { ok: false, message: "Enter an amount greater than zero." };

  const supabase = await createClient();
  const session = await requirePermission("rates.manage");

  const { error } = await supabase.from("profile_pay_components").insert({
    profile_id: userId,
    // Derived from the label so the payslip line and the code always agree.
    code:
      label
        .toUpperCase()
        .replace(/[^A-Z0-9]+/g, "_")
        .slice(0, 24) || "EXTRA",
    label,
    kind,
    amount,
    effective_from: text(form, "effective_from") || new Date().toISOString().slice(0, 10),
    effective_to: text(form, "effective_to") || null,
    note: text(form, "note") || null,
    created_by: session.userId,
  });

  if (error) return { ok: false, message: error.message };

  revalidatePath("/admin/users");
  revalidatePath("/payroll");
  return { ok: true, message: `${label} added.` };
}

/** Removes a per-person allowance or deduction. */
export async function removeUserComponent(componentId: string): Promise<PayResult> {
  await requirePermission("rates.manage");

  if (!componentId) return { ok: false, message: "Nothing selected." };

  const supabase = await createClient();
  const { error } = await supabase.from("profile_pay_components").delete().eq("id", componentId);

  if (error) return { ok: false, message: error.message };

  revalidatePath("/admin/users");
  revalidatePath("/payroll");
  return { ok: true, message: "Removed." };
}
