"use server";

import { listApprovers, type Approver } from "@/lib/approvals/approvers";
import { needsApproval } from "@/lib/approvals/changes";
import { requireSession } from "@/lib/auth/session";

/**
 * Whether this person's changes wait, and who can be asked to release them.
 *
 * Fetched by the picker itself rather than threaded down from each page. Six
 * separate screens carry a guarded form — the calendar, two pay editors, the
 * contract firms, the attendance log — and passing two more props through
 * every layer of each of them would put the same plumbing in six places to
 * answer one question.
 *
 * Cheap enough to be worth it: two small reads, on a control that is only
 * mounted where a guarded change can actually be made.
 */

export interface ApprovalContext {
  required: boolean;
  approvers: Approver[];
}

export async function approvalContext(): Promise<ApprovalContext> {
  const session = await requireSession();
  const required = needsApproval(session);

  // No list is fetched for somebody who never queues — Antrosys sees no picker
  // at all, so the names would be loaded to be thrown away.
  if (!required) return { required: false, approvers: [] };

  return { required: true, approvers: await listApprovers() };
}
