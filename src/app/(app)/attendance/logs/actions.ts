"use server";

import { revalidatePath } from "next/cache";

import { requirePermission } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";

/**
 * Signing off a person's attendance for a stretch of dates.
 *
 * Approval sets `locked`, which is what stops `recomputeAttendanceDay()`
 * replacing the row on the next terminal sync. Without that, a manager who
 * corrected a missed punch would watch the correction disappear within thirty
 * seconds — the approval would be a label rather than a decision.
 *
 * Scope is enforced by RLS, not here: `app.manages()` keeps a manager to their
 * own reports, so a request naming somebody else's employee updates no rows
 * rather than being refused with a message that confirms the person exists.
 */

export interface ApproveResult {
  ok: boolean;
  message: string;
}

export async function approveAttendanceRange(input: {
  profileId: string;
  from: string;
  to: string;
}): Promise<ApproveResult> {
  const session = await requirePermission("attendance.approve");

  if (!input.profileId || !input.from || !input.to) {
    return { ok: false, message: "Pick a person and a date range." };
  }
  if (input.to < input.from) {
    return { ok: false, message: "The end date cannot be before the start date." };
  }

  const supabase = await createClient();

  const { data, error } = await supabase
    .from("attendance_days")
    .update({
      approved_by: session.userId,
      approved_at: new Date().toISOString(),
      locked: true,
    })
    .eq("profile_id", input.profileId)
    .gte("work_date", input.from)
    .lte("work_date", input.to)
    .select("id");

  if (error) return { ok: false, message: error.message };

  const count = data?.length ?? 0;
  if (count === 0) {
    // Either there is nothing in the range, or the policy filtered it out.
    return {
      ok: false,
      message: "Nothing to approve — no attendance in that range for someone who reports to you.",
    };
  }

  revalidatePath("/attendance/logs");
  revalidatePath("/payroll");

  return {
    ok: true,
    message: `Approved ${count} day${count === 1 ? "" : "s"}. They will not be recalculated.`,
  };
}
