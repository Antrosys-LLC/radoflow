"use server";

import { revalidatePath } from "next/cache";

import { isLeadership } from "@/lib/auth/antrosys";
import { requireSession, type Session } from "@/lib/auth/session";
import {
  changeRequestRowFor,
  undoMinutesLeft,
  type ChangeRequestInput,
} from "@/lib/approvals/changes";
import { createClient } from "@/lib/supabase/server";

/**
 * Asking for a change, deciding one, and taking a decision back.
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
 *
 * An approval also records what the row held before it (`previous_values`), so
 * that for an hour afterwards it can be reversed exactly — not by guessing at
 * the old value, but by writing back the one that was there.
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
  "calendar_day_overrides",
  "work_week",
  "attendance_days",
]);

type Client = Awaited<ReturnType<typeof createClient>>;

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

  let previous: { values: Record<string, unknown> | null; createdRow: boolean } = {
    values: null,
    createdRow: false,
  };

  if (decision === "approved") {
    previous = await capturePrevious(supabase, request);
    const applied = await applyChange(supabase, request);
    if (!applied.ok) {
      await supabase
        .from("change_requests")
        .update({ apply_error: applied.message })
        .eq("id", requestId);
      return { ok: false, message: `Could not apply the change: ${applied.message}` };
    }
    await refreshCalendarPricing(supabase, request);
  }

  const { error } = await supabase
    .from("change_requests")
    .update({
      status: decision,
      decided_by: session.userId,
      decided_at: new Date().toISOString(),
      decision_note: note.trim() || null,
      apply_error: null,
      previous_values: previous.values as never,
      created_row: previous.createdRow,
    })
    .eq("id", requestId)
    .eq("status", "pending");

  if (error) return { ok: false, message: error.message };

  // The change may have touched any of these, and all of them are cached.
  revalidatePath("/", "layout");

  return {
    ok: true,
    message:
      decision === "approved"
        ? "Approved and applied. You can undo this for the next hour."
        : "Rejected. You can undo this for the next hour.",
  };
}

/**
 * Takes a decision back, within an hour of it.
 *
 * - An approval is reversed by writing back what the row held before it, or by
 *   removing the row the approval created. The request returns to the queue.
 * - A rejection simply returns to the queue.
 * - A withdrawal is restored by the person who withdrew it.
 *
 * Only whoever decided may undo it — or another member of leadership, so a
 * decision cannot be stranded by the director who made it going home.
 */
export async function undoChangeDecision(requestId: string): Promise<RequestResult> {
  const session = await requireSession();
  const supabase = await createClient();

  const { data: request, error: readError } = await supabase
    .from("change_requests")
    .select("*")
    .eq("id", requestId)
    .maybeSingle();

  if (readError) return { ok: false, message: readError.message };
  if (!request) return { ok: false, message: "That request is no longer there." };

  if (undoMinutesLeft(request.decided_at) <= 0) {
    return { ok: false, message: "It has been more than an hour — this decision stands now." };
  }

  if (request.status === "cancelled") {
    if (request.requested_by !== session.userId) {
      return { ok: false, message: "Only the person who withdrew a request can restore it." };
    }

    const { data, error } = await supabase
      .from("change_requests")
      .update({ status: "pending", decided_at: null })
      .eq("id", requestId)
      .eq("status", "cancelled")
      .select("id");

    if (error) return { ok: false, message: error.message };
    if (!data || data.length === 0) return { ok: false, message: "Nothing was restored." };

    revalidatePath("/approvals");
    return { ok: true, message: "Restored. It is waiting for a decision again." };
  }

  if (request.status !== "approved" && request.status !== "rejected") {
    return { ok: false, message: "There is no decision on this request to undo." };
  }

  if (!canDecide(session)) {
    return { ok: false, message: "You cannot change decisions." };
  }
  if (request.decided_by !== session.userId && !isLeadership(session)) {
    return { ok: false, message: "Only the person who decided this can undo it." };
  }

  if (request.status === "approved") {
    const reverted = await revertChange(supabase, request);
    if (!reverted.ok) {
      return { ok: false, message: `Could not undo the change: ${reverted.message}` };
    }
    await refreshCalendarPricing(supabase, request);
  }

  const { error } = await supabase
    .from("change_requests")
    .update({
      status: "pending",
      decided_by: null,
      decided_at: null,
      decision_note: null,
      apply_error: null,
      previous_values: null,
      created_row: false,
      undone_at: new Date().toISOString(),
      undone_by: session.userId,
    })
    .eq("id", requestId)
    .eq("status", request.status);

  if (error) return { ok: false, message: error.message };

  revalidatePath("/", "layout");
  return {
    ok: true,
    message:
      request.status === "approved"
        ? "Undone. The change was reversed and the request is waiting again."
        : "Undone. The request is waiting for a decision again.",
  };
}

/**
 * Whether this person may decide anything at all.
 *
 * Both approval permissions, because the two kinds of request are judged by
 * different people in principle even though every director holds both today.
 */
function canDecide(session: Session): boolean {
  return (
    session.isSuperuser ||
    isLeadership(session) ||
    session.permissions.has("payroll.approve") ||
    session.permissions.has("attendance.approve")
  );
}

type RequestRow = {
  entity_table: string;
  entity_id: string | null;
  payload: unknown;
  site_id: string | null;
  previous_values?: unknown;
  created_row?: boolean | null;
};

const payloadOf = (request: RequestRow) => (request.payload ?? {}) as Record<string, unknown>;

/** The columns that name a calendar override's row, whichever scope it is. */
function overrideKey(payload: Record<string, unknown>) {
  return {
    scope: String(payload["scope"] ?? ""),
    department_id: (payload["department_id"] as string | null | undefined) ?? null,
    profile_id: (payload["profile_id"] as string | null | undefined) ?? null,
    day: String(payload["day"] ?? ""),
  };
}

/**
 * What the target row holds right now, for the columns the payload changes.
 *
 * Read through the approver's own client — the same one that is about to
 * write — so this sees exactly the row the write will land on.
 */
async function capturePrevious(
  supabase: Client,
  request: RequestRow,
): Promise<{ values: Record<string, unknown> | null; createdRow: boolean }> {
  const payload = payloadOf(request);
  const keys = Object.keys(payload);

  const pick = (row: Record<string, unknown> | null) =>
    row ? Object.fromEntries(keys.map((key) => [key, row[key] ?? null])) : null;

  if (request.entity_table === "work_week") {
    const { data } = await supabase
      .from("work_week")
      .select("*")
      .eq("site_id", String(payload["site_id"]))
      .eq("weekday", Number(payload["weekday"]))
      .maybeSingle();
    return data ? { values: pick(data), createdRow: false } : { values: null, createdRow: true };
  }

  if (request.entity_table === "calendar_days" && !request.entity_id) {
    const { data } = await supabase
      .from("calendar_days")
      .select("*")
      .eq("site_id", String(payload["site_id"]))
      .eq("day", String(payload["day"]))
      .maybeSingle();
    return data ? { values: pick(data), createdRow: false } : { values: null, createdRow: true };
  }

  if (request.entity_table === "calendar_day_overrides" && !request.entity_id) {
    const key = overrideKey(payload);
    let query = supabase
      .from("calendar_day_overrides")
      .select("*")
      .eq("scope", key.scope)
      .eq("day", key.day);
    query = key.department_id
      ? query.eq("department_id", key.department_id)
      : query.eq("profile_id", key.profile_id ?? "");
    const { data } = await query.maybeSingle();
    return data ? { values: pick(data), createdRow: false } : { values: null, createdRow: true };
  }

  if (!request.entity_id) return { values: null, createdRow: false };

  const { data } = await supabase
    .from(request.entity_table as "profiles")
    .select("*")
    .eq("id", request.entity_id)
    .maybeSingle();

  return { values: pick(data as Record<string, unknown> | null), createdRow: false };
}

/**
 * Performs the held write.
 *
 * An insert when there is nothing to point at yet, an update otherwise —
 * except for the tables whose identity is a set of columns rather than an id,
 * where the write is an upsert on those columns. `.select()` throughout so a
 * write refused by a policy comes back as zero rows rather than as silence:
 * an approval that changed nothing must not report success.
 */
async function applyChange(
  supabase: Client,
  request: RequestRow,
): Promise<{ ok: boolean; message: string }> {
  const table = request.entity_table;
  if (!WRITABLE.has(table)) return { ok: false, message: "unknown table" };

  const payload = payloadOf(request);

  const written = (data: unknown[] | null, error: { message: string } | null) =>
    error
      ? { ok: false, message: error.message }
      : data && data.length > 0
        ? { ok: true, message: "" }
        : { ok: false, message: "nothing was written" };

  if (table === "work_week") {
    const { data, error } = await supabase
      .from("work_week")
      .upsert(payload as never, { onConflict: "site_id,weekday" })
      .select("weekday");
    return written(data, error);
  }

  if (table === "calendar_days" && !request.entity_id) {
    const { data, error } = await supabase
      .from("calendar_days")
      .upsert(payload as never, { onConflict: "site_id,day" })
      .select("id");
    return written(data, error);
  }

  if (table === "calendar_day_overrides" && !request.entity_id) {
    const { data, error } = await supabase
      .from("calendar_day_overrides")
      .upsert(payload as never, { onConflict: "scope,scope_id,day" })
      .select("id");
    return written(data, error);
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

/** Puts a row back the way `capturePrevious` found it. */
async function revertChange(
  supabase: Client,
  request: RequestRow,
): Promise<{ ok: boolean; message: string }> {
  const table = request.entity_table;
  if (!WRITABLE.has(table)) return { ok: false, message: "unknown table" };

  const payload = payloadOf(request);
  const previous = (request.previous_values ?? null) as Record<string, unknown> | null;

  if (request.created_row) {
    if (table === "work_week") {
      const { error } = await supabase
        .from("work_week")
        .delete()
        .eq("site_id", String(payload["site_id"]))
        .eq("weekday", Number(payload["weekday"]));
      return error ? { ok: false, message: error.message } : { ok: true, message: "" };
    }
    if (table === "calendar_days") {
      const { error } = await supabase
        .from("calendar_days")
        .delete()
        .eq("site_id", String(payload["site_id"]))
        .eq("day", String(payload["day"]));
      return error ? { ok: false, message: error.message } : { ok: true, message: "" };
    }
    if (table === "calendar_day_overrides") {
      const key = overrideKey(payload);
      let query = supabase
        .from("calendar_day_overrides")
        .delete()
        .eq("scope", key.scope)
        .eq("day", key.day);
      query = key.department_id
        ? query.eq("department_id", key.department_id)
        : query.eq("profile_id", key.profile_id ?? "");
      const { error } = await query;
      return error ? { ok: false, message: error.message } : { ok: true, message: "" };
    }
    return { ok: false, message: "cannot remove that row" };
  }

  if (!previous) {
    return { ok: false, message: "what the row held before was not recorded" };
  }

  if (table === "work_week") {
    const { error } = await supabase
      .from("work_week")
      .update(previous as never)
      .eq("site_id", String(payload["site_id"]))
      .eq("weekday", Number(payload["weekday"]));
    return error ? { ok: false, message: error.message } : { ok: true, message: "" };
  }

  if (table === "calendar_days" && !request.entity_id) {
    const { error } = await supabase
      .from("calendar_days")
      .update(previous as never)
      .eq("site_id", String(payload["site_id"]))
      .eq("day", String(payload["day"]));
    return error ? { ok: false, message: error.message } : { ok: true, message: "" };
  }

  if (table === "calendar_day_overrides" && !request.entity_id) {
    const key = overrideKey(payload);
    let query = supabase
      .from("calendar_day_overrides")
      .update(previous as never)
      .eq("scope", key.scope)
      .eq("day", key.day);
    query = key.department_id
      ? query.eq("department_id", key.department_id)
      : query.eq("profile_id", key.profile_id ?? "");
    const { error } = await query;
    return error ? { ok: false, message: error.message } : { ok: true, message: "" };
  }

  if (!request.entity_id) return { ok: false, message: "nothing to put back" };

  const { data, error } = await supabase
    .from(table as "profiles")
    .update(previous as never)
    .eq("id", request.entity_id)
    .select("id");

  if (error) return { ok: false, message: error.message };
  return data && data.length > 0
    ? { ok: true, message: "" }
    : { ok: false, message: "the row is gone" };
}

/**
 * Re-prices recorded attendance on the date a calendar change touched.
 *
 * Best effort: on a database without the function the change itself still
 * stands, and the date is priced correctly the next time a punch arrives.
 */
async function refreshCalendarPricing(supabase: Client, request: RequestRow) {
  const payload = payloadOf(request);
  const table = request.entity_table;
  if (table !== "calendar_days" && table !== "calendar_day_overrides") return;

  const siteId = String(payload["site_id"] ?? request.site_id ?? "");
  let day = typeof payload["day"] === "string" ? payload["day"] : "";

  if (!day && request.entity_id) {
    const { data } = await supabase
      .from(table as "calendar_days")
      .select("day, site_id")
      .eq("id", request.entity_id)
      .maybeSingle();
    day = data?.day ?? "";
  }

  if (siteId && day) {
    await supabase.rpc("refresh_day_types" as never, { p_site: siteId, p_day: day } as never);
  }
}

/** Withdraws a request you made and nobody has decided yet. */
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
  return { ok: true, message: "Withdrawn. You can restore it for the next hour." };
}

/** True when this person never queues — C-Level, an owner, or Antrosys. */
export async function isExemptFromApproval(): Promise<boolean> {
  return isLeadership(await requireSession());
}
