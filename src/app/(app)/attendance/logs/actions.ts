"use server";

import { revalidatePath } from "next/cache";

import { requirePermission } from "@/lib/auth/session";
import { dictionaryFor } from "@/lib/i18n";
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
 *
 * `message` comes back already translated. The permission check hands back the
 * whole session, so the action knows the reader's language without a second
 * load and without the caller telling it — which is the only way an Urdu
 * screen avoids toasting an English sentence at somebody. The one exception is
 * a Postgres error, which is passed through untouched: it is developer-facing
 * and untranslatable, and an invented Urdu wrapper would hide what failed.
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
  const t = dictionaryFor(session.profile.language);

  if (!input.profileId || !input.from || !input.to) {
    return { ok: false, message: t.logs.pickPersonAndRange };
  }
  if (input.to < input.from) {
    return { ok: false, message: t.logs.endBeforeStart };
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
    return { ok: false, message: t.logs.nothingToApprove };
  }

  revalidatePath("/attendance/logs");
  revalidatePath("/payroll");

  /*
   * A slot rather than a concatenation: Urdu orders the sentence differently,
   * so the count has to be dropped into a whole sentence rather than glued to
   * a fragment. `String.replace` is right here and wrong in a component —
   * this is a plain string bound for a toast, not React children, so there is
   * no `<Latin>` to render through and no bidi run to isolate.
   */
  const template = count === 1 ? t.logs.approvedOne : t.logs.approvedMany;
  return { ok: true, message: template.replace("{count}", String(count)) };
}
