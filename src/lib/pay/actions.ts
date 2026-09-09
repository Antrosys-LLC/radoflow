"use server";

import { revalidatePath } from "next/cache";

import { submitChangeRequest } from "@/lib/approvals/actions";
import { describeFieldChanges, money, needsApproval } from "@/lib/approvals/changes";
import { requirePermission } from "@/lib/auth/session";
import { deriveRates } from "@/lib/pay/derived";
import { trackingFlags } from "@/lib/people/tracking";
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
  const session = await requirePermission("people.manage");

  const userId = text(form, "user_id");
  if (!userId) return { ok: false, message: "No user selected." };

  const workerType = (text(form, "worker_type") || "employee") as "employee" | "contractor";
  const payClass = (text(form, "pay_class") || "monthly") as "monthly" | "hourly";
  const monthlySalary = Number(text(form, "monthly_salary") || 0);
  const dutyHoursRaw = text(form, "duty_hours") || "8";

  /*
   * "No attendance needed" is a third answer to "what does the salary cover",
   * and it is not a number of hours — it means the salary is not earned by the
   * clock at all. It arrives on the same select because that is the question
   * the office is answering, and it leaves the person's duty figure untouched:
   * they may go back on the clock next month, and overwriting it with a
   * default would quietly re-band them when they do.
   */
  const noAttendance = dutyHoursRaw === "none";
  const dutyHours = noAttendance ? null : Number(dutyHoursRaw);
  const sundayPolicy = (text(form, "sunday_policy") || "off") as
    "off" | "optional" | "compulsory" | "adjust_in_leave";

  /*
   * An hourly rate left at zero on a monthly salary is derived rather than
   * stored as zero. Every wage here is quoted by the month and settled by the
   * hour — an hour short, twenty minutes late — and a zero rate silently
   * prices all of that at nothing. Typed in explicitly, the figure is honoured
   * as it stands: an agreed rate that differs from the arithmetic is a real
   * arrangement, not a mistake to correct.
   */
  const hourlyRateRaw = Number(text(form, "hourly_rate") || 0);
  const hourlyRate =
    hourlyRateRaw > 0 ? hourlyRateRaw : deriveRates(monthlySalary, dutyHours ?? 8).perHour;

  if (monthlySalary < 0 || hourlyRateRaw < 0) {
    return { ok: false, message: "Pay cannot be negative." };
  }
  if (dutyHours !== null && (!(dutyHours > 0) || dutyHours > 24)) {
    return { ok: false, message: "Duty hours must be between 1 and 24." };
  }

  const supabase = await createClient();

  const payload = {
    worker_type: workerType,
    pay_class: payClass,
    monthly_salary: monthlySalary,
    hourly_rate: hourlyRate,
    ...(dutyHours === null ? {} : { duty_hours: dutyHours }),
    sunday_policy: sundayPolicy,
    ...trackingFlags(noAttendance ? "salary_only" : text(form, "tracking")),
    overtime_eligible: form.get("overtime_eligible") !== null,
  };

  /*
   * What somebody is paid is the change this workflow exists for. It waits for
   * a director unless Antrosys made it — and the summary is built from the row
   * as it stands *now*, because by the time it is read the approver needs to
   * see what they are agreeing to change from.
   */
  if (needsApproval(session)) {
    const { data: before } = await supabase
      .from("profiles")
      .select(
        "full_name, worker_type, pay_class, monthly_salary, hourly_rate, duty_hours, sunday_policy, overtime_eligible, requires_attendance",
      )
      .eq("id", userId)
      .maybeSingle();

    const summary = describeFieldChanges(
      (before ?? {}) as Record<string, unknown>,
      payload as Record<string, unknown>,
      {
        worker_type: "Paid as",
        pay_class: "Pay class",
        monthly_salary: "Salary",
        hourly_rate: "Hourly rate",
        duty_hours: "Salary covers",
        sunday_policy: "Sunday",
        overtime_eligible: "Earns overtime",
        requires_attendance: "Attendance kept",
      },
    );

    return submitChangeRequest({
      kind: "pay_change",
      entityTable: "profiles",
      entityId: userId,
      payload,
      siteId: null,
      title: `Pay for ${before?.full_name ?? "an employee"}`,
      summary: summary || `Salary set to ${money(monthlySalary)}.`,
      assignedTo: text(form, "approver_id") || null,
    });
  }

  const { error } = await supabase
    .from("profiles")
    .update({
      worker_type: workerType,
      pay_class: payClass,
      monthly_salary: monthlySalary,
      hourly_rate: hourlyRate,
      // Left alone when the answer was "no attendance needed" — see above.
      ...(dutyHours === null ? {} : { duty_hours: dutyHours }),
      sunday_policy: sundayPolicy,
      // "No attendance needed" is the same state the tracking select calls
      // `salary_only`, so it resolves to one set of flags either way rather
      // than to two columns that can contradict each other.
      ...trackingFlags(noAttendance ? "salary_only" : text(form, "tracking")),
      overtime_eligible: form.get("overtime_eligible") !== null,
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

/**
 * Sets what a contract firm is owed for a month.
 *
 * One figure for the whole department, because that is what was agreed with
 * the firm. The people inside it cost nothing individually — see
 * `runPayrollForPeriod`, which emits one contract line per department and no
 * payroll item for its people.
 */
export async function setContractAmount(_prev: PayResult, form: FormData): Promise<PayResult> {
  const session = await requirePermission("rates.manage");

  const departmentId = text(form, "department_id");
  const amount = Number(text(form, "contract_amount") || 0);

  if (!departmentId) return { ok: false, message: "Pick a contract firm." };
  if (!Number.isFinite(amount) || amount < 0) {
    return { ok: false, message: "The contract amount cannot be negative." };
  }

  const supabase = await createClient();

  /*
   * A contract amount is the whole of what a firm is paid — one figure billed
   * once a month, with none of its people priced individually. It is the
   * largest single number anybody edits in this app, so it waits like a
   * salary does.
   */
  if (needsApproval(session)) {
    const { data: firm } = await supabase
      .from("departments")
      .select("name, contract_amount, site_id")
      .eq("id", departmentId)
      .maybeSingle();

    return submitChangeRequest({
      kind: "contract_amount",
      entityTable: "departments",
      entityId: departmentId,
      payload: { contract_amount: amount },
      siteId: firm?.site_id ?? null,
      title: `Contract amount for ${firm?.name ?? "a firm"}`,
      summary: `${money(Number(firm?.contract_amount ?? 0))} → ${money(amount)} a month`,
      assignedTo: text(form, "approver_id") || null,
    });
  }

  const { error } = await supabase
    .from("departments")
    .update({ contract_amount: amount })
    .eq("id", departmentId);

  if (error) return { ok: false, message: error.message };

  revalidatePath("/rates");
  revalidatePath("/payroll");

  return { ok: true, message: "Contract amount saved." };
}
