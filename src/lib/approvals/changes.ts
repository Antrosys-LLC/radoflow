import type { Session } from "@/lib/auth/session";
import { isAntrosys } from "@/lib/auth/antrosys";

/**
 * Which changes have to be asked for, and what the asking says.
 *
 * The rule is short and it is the whole point: **anybody but Antrosys queues.**
 * Not "anybody without the permission" — the manager, the accountant and the
 * CEO all hold the permissions for these writes, and the ask is not about
 * capability. It is about a second pair of eyes on money and on the working
 * week, which is exactly what the floor asked for.
 *
 * Antrosys is exempt because they are who fixes this workflow when it goes
 * wrong. A maintainer who cannot correct a stuck request without finding a
 * director is a maintainer who cannot maintain.
 *
 * Pure: no database, no session lookup of its own, no clock. The actions
 * supply the session and the values; this decides and words it.
 */

export type ChangeKind =
  "attendance_correction" | "calendar_day" | "work_week" | "pay_change" | "contract_amount";

export interface ChangeRequestInput {
  kind: ChangeKind;
  entityTable: string;
  /** Null for something that does not exist yet — a calendar day being made. */
  entityId: string | null;
  /** The write itself, applied verbatim on approval. */
  payload: Record<string, unknown>;
  siteId: string | null;
  title: string;
  summary: string;
  requestedBy: string;
  /** The director the requester picked. */
  assignedTo: string | null;
}

export interface ChangeRequestRow {
  kind: ChangeKind;
  entity_table: string;
  entity_id: string | null;
  payload: Record<string, unknown>;
  site_id: string | null;
  title: string;
  summary: string;
  requested_by: string;
  assigned_to: string | null;
  status: "pending";
}

/**
 * Whether this person's change has to wait for somebody else.
 *
 * Everyone queues except Antrosys — see the note above. Written as a function
 * of the session rather than of a role name at each call site so the rule
 * lives in one place and a future exemption is one edit.
 */
export function needsApproval(session: Session | null): boolean {
  return !isAntrosys(session);
}

export function changeRequestRowFor(input: ChangeRequestInput): ChangeRequestRow {
  return {
    kind: input.kind,
    entity_table: input.entityTable,
    entity_id: input.entityId,
    payload: input.payload,
    site_id: input.siteId,
    title: input.title,
    summary: input.summary,
    requested_by: input.requestedBy,
    assigned_to: input.assignedTo,
    status: "pending",
  };
}

/** Rupees the way every other money figure in this app is written. */
export function money(amount: number): string {
  return `Rs ${Math.round(amount).toLocaleString("en-US")}`;
}

/**
 * What changed, in words, for the approver's inbox.
 *
 * Built when the request is made and stored, rather than derived when it is
 * read: the row it describes may have moved on by then, and an approver
 * reading "salary 30,000 → 35,000" needs the 30,000 that was true when
 * somebody asked, not whatever it says now.
 *
 * Values are compared as strings because they arrive from form fields; the
 * point is to show the reader what is different, not to do arithmetic.
 */
export function describeFieldChanges(
  before: Record<string, unknown>,
  after: Record<string, unknown>,
  labels: Record<string, string>,
): string {
  const parts: string[] = [];

  for (const [key, next] of Object.entries(after)) {
    const previous = before[key];
    if (String(previous ?? "") === String(next ?? "")) continue;

    const label = labels[key] ?? key;
    const from = previous === null || previous === undefined || previous === "" ? "—" : previous;
    const to = next === null || next === undefined || next === "" ? "—" : next;
    parts.push(`${label}: ${String(from)} → ${String(to)}`);
  }

  return parts.join(" · ");
}
