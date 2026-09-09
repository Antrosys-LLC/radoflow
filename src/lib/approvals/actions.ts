"use server";

import { revalidatePath } from "next/cache";

import { isAntrosys } from "@/lib/auth/antrosys";
import { requireSession, type Session } from "@/lib/auth/session";
import { changeRequestRowFor, type ChangeRequestInput } from "@/lib/approvals/changes";
import { createClient } from "@/lib/supabase/server";

/**
 * Asking for a change, and deciding one.
 *
 * The request holds the write instead of performing it. That is the whole
 * safety property: a salary a manager typed wrong, or a Sunday reopened by
 * mistake, never reaches a payroll run while it waits — the row keeps its old
 * value until somebody senior says yes.
 *
 * Applying is deliberately the same shape as the direct write it replaces:
 * `entity_table` plus `payload`, sent through the *approver's* own client, so
 * Row Level Security judges the write on the person who approved it rather
 * than on the person who asked. An approver who somehow lacks the rights
 * writes nothing and is told so, instead of the request quietly borrowing the
 * requester's authority.
 */

export interface RequestResult {
  ok: boolean;
  message: string;
  /** True when the change was applied outright rather than queued. */
  applied?: boolean;
}

/** The tables a request may write. Anything else is refused, not attempted. */
const WRITABLE = new Set([
  "profiles",
  "departments",
  "calendar_days",
  "work_week",
  "attendance_days",
]);

/**
 * Queues a change for approval.
 *
 * Callers check `needsApproval` first and write directly when it is false;
 * this is only the queueing half, so it never decides policy on its own.
 */
export async function submitChangeRequest(
  input: Omit<ChangeRequestInput, "requestedBy">,
): Promise<RequestResult> {
  const session = await requireSession();

  if (!WRITABLE.has(input.entityTable)) {
    return { ok: false, message: "That change cannot be requested." };
  }

  const supabase = await createClient();
  const row = changeRequestRowFor({ ...input, requestedBy: session.userId });

  /*
   * `payload` is a plain object of column/value pairs; the generated type for
   * the column is `Json`, which is structurally wider. Cast at the boundary
   * rather than typing the payload as `Json` everywhere upstream, where it
   * would stop being readable as "the write to perform".
   */
  const { error } = await supabase
    .from("change_requests")
    .insert({ ...row, payload: row.payload as never });
  if (error) return { ok: false, message: error.message };

  revalidatePath("/approvals");
  return {
    ok: true,
    message: "Sent for approval. It takes effect once it is approved.",
  };
}

/**
 * Approving or rejecting one request.
 *
 * On approval the payload is applied and only then is the request marked
 * decided — in that order, because a request marked approved whose write
 * failed is the worst of both: it reads as done and nothing changed. A failure
 * is stored on the row so a stuck request explains itself instead of sitting
 * there looking ignored.
 */
export async function decideChangeRequest(
  requestId: string,
  decision: "approved" | "rejected",
  note = "",
): Promise<RequestResult> {
  const session = await requireSession();
  const supabase = await createClient();

  const { data: request, error: readError } = await supabase
    .from("change_requests")
    .select("*")
    .eq("id", requestId)
    .maybeSingle();

  if (readError) return { ok: false, message: readError.message };
  if (!request) return { ok: false, message: "That request is no longer there." };
  if (request.status !== "pending") {
    return { ok: false, message: "That request has already been decided." };
  }

  /*
   * You cannot approve your own request, superuser or not. The entire value of
   * this workflow is the second pair of eyes, and a rule that anybody can step
   * around by assigning a request to themselves is decoration.
   */
  if (request.requested_by === session.userId) {
    return { ok: false, message: "Somebody else has to approve your own request." };
  }

  if (!canDecide(session)) {
    return { ok: false, message: "You cannot approve changes." };
  }

  if (decision === "approved") {
    const applied = await applyChange(supabase, request);
    if (!applied.ok) {
      await supabase
        .from("change_requests")
        .update({ apply_error: applied.message })
        .eq("id", requestId);
      return { ok: false, message: `Could not apply the change: ${applied.message}` };
    }
  }

  const { error } = await supabase
    .from("change_requests")
    .update({
      status: decision,
      decided_by: session.userId,
      decided_at: new Date().toISOString(),
      decision_note: note.trim() || null,
      apply_error: null,
    })
    .eq("id", requestId)
    .eq("status", "pending");

  if (error) return { ok: false, message: error.message };

  // The change may have touched any of these, and all of them are cached.
  revalidatePath("/", "layout");

  return {
    ok: true,
    message: decision === "approved" ? "Approved and applied." : "Rejected.",
  };
}

/**
 * Whether this person may decide anything at all.
 *
 * Both approval permissions, because the two kinds of request are judged by
 * different people in principle even though every superuser holds both today.
 */
function canDecide(session: Session): boolean {
  return (
    session.isSuperuser ||
    session.permissions.has("payroll.approve") ||
    session.permissions.has("attendance.approve")
  );
}

type RequestRow = {
  entity_table: string;
  entity_id: string | null;
  payload: unknown;
  site_id: string | null;
};

/**
 * Performs the held write.
 *
 * An insert when there is nothing to point at yet, an update otherwise —
 * except for the two tables whose identity is a pair of columns rather than an
 * id, where the write is an upsert on that pair. `.select()` throughout so a
 * write refused by a policy comes back as zero rows rather than as silence:
 * an approval that changed nothing must not report success.
 */
async function applyChange(
  supabase: Awaited<ReturnType<typeof createClient>>,
  request: RequestRow,
): Promise<{ ok: boolean; message: string }> {
  const table = request.entity_table;
  if (!WRITABLE.has(table)) return { ok: false, message: "unknown table" };

  const payload = (request.payload ?? {}) as Record<string, unknown>;

  // `work_week` is keyed on (site, weekday) and `calendar_days` on (site, day);
  // neither has an id to update by when the row may not exist yet.
  if (table === "work_week") {
    const { data, error } = await supabase
      .from("work_week")
      .upsert(payload as never, { onConflict: "site_id,weekday" })
      .select("weekday");
    if (error) return { ok: false, message: error.message };
    return data && data.length > 0
      ? { ok: true, message: "" }
      : { ok: false, message: "nothing was written" };
  }

  if (table === "calendar_days" && !request.entity_id) {
    const { data, error } = await supabase
      .from("calendar_days")
      .upsert(payload as never, { onConflict: "site_id,day" })
      .select("id");
    if (error) return { ok: false, message: error.message };
    return data && data.length > 0
      ? { ok: true, message: "" }
      : { ok: false, message: "nothing was written" };
  }

  if (!request.entity_id) return { ok: false, message: "nothing to change" };

  const { data, error } = await supabase
    // The table name is checked against WRITABLE above, so this cast is
    // narrowing a validated string rather than trusting the row.
    .from(table as "profiles")
    .update(payload as never)
    .eq("id", request.entity_id)
    .select("id");

  if (error) return { ok: false, message: error.message };
  return data && data.length > 0
    ? { ok: true, message: "" }
    : { ok: false, message: "nothing was written — the row may be gone" };
}

/** Cancels a request you made and nobody has decided yet. */
export async function cancelChangeRequest(requestId: string): Promise<RequestResult> {
  const session = await requireSession();
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("change_requests")
    .update({ status: "cancelled", decided_at: new Date().toISOString() })
    .eq("id", requestId)
    .eq("requested_by", session.userId)
    .eq("status", "pending")
    .select("id");

  if (error) return { ok: false, message: error.message };
  if (!data || data.length === 0) {
    return { ok: false, message: "That request is not yours, or is already decided." };
  }

  revalidatePath("/approvals");
  return { ok: true, message: "Withdrawn." };
}

/** True when this person never queues — see `lib/auth/antrosys.ts`. */
export async function isExemptFromApproval(): Promise<boolean> {
  return isAntrosys(await requireSession());
}
