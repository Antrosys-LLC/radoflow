import type { Metadata } from "next";

import { isAntrosys } from "@/lib/auth/antrosys";
import { SchemaOutOfDate } from "@/components/schema-out-of-date";
import { requireSession } from "@/lib/auth/session";
import { dictionaryFor } from "@/lib/i18n";
import { isSchemaOutOfDate } from "@/lib/supabase/schema-error";
import { createClient } from "@/lib/supabase/server";

import { ApprovalsScreen, type RequestView } from "./approvals-screen";

export const metadata: Metadata = {
  title: { absolute: "Approvals | Rado Dyeing and Textile" },
  description: "Changes waiting for a decision, and the ones you asked for.",
};

export const dynamic = "force-dynamic";

/**
 * Changes waiting on somebody.
 *
 * Two lists, because there are two reasons to open this screen. A director
 * opens it to decide; everybody else opens it to find out whether the thing
 * they asked for this morning has happened yet. Neither is served by one
 * undifferentiated queue.
 *
 * No permission gate: the row policy already decides what is visible — your
 * own requests, the ones addressed to you, and everything if you can approve.
 * Somebody with nothing to see gets an empty screen, which is the honest
 * answer rather than a refusal.
 */
export default async function ApprovalsPage() {
  const session = await requireSession();
  const supabase = await createClient();

  const { data: rows, error } = await supabase
    .from("change_requests")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(200);

  /*
   * `change_requests` arrives with a migration. Until it is run this read
   * fails, and swallowing it would leave an empty queue — which reads as
   * "nothing is waiting on you" and is the one wrong answer this screen can
   * give. Say what is actually the matter instead.
   */
  if (isSchemaOutOfDate(error)) {
    return <SchemaOutOfDate t={dictionaryFor(session.profile.language)} detail={error?.message} />;
  }

  const requests = rows ?? [];

  // Names for the two people on each row. Read from the pay-free directory in
  // one query rather than embedded per row.
  const ids = [
    ...new Set(
      requests.flatMap((row) =>
        [row.requested_by, row.assigned_to, row.decided_by].filter(Boolean),
      ),
    ),
  ] as string[];

  const { data: people } = ids.length
    ? await supabase.from("employee_directory").select("id, full_name").in("id", ids)
    : { data: [] };

  const nameOf = new Map((people ?? []).map((person) => [person.id, person.full_name ?? ""]));

  const view: RequestView[] = requests.map((row) => ({
    id: row.id,
    kind: row.kind,
    title: row.title,
    summary: row.summary,
    status: row.status,
    createdAt: row.created_at,
    decidedAt: row.decided_at,
    decisionNote: row.decision_note,
    applyError: row.apply_error,
    requestedBy: row.requested_by,
    requestedByName: nameOf.get(row.requested_by) ?? "",
    assignedToName: row.assigned_to ? (nameOf.get(row.assigned_to) ?? "") : null,
    decidedByName: row.decided_by ? (nameOf.get(row.decided_by) ?? "") : null,
  }));

  /*
   * Whether this person may decide. Antrosys and any superuser can; so can
   * anyone holding either approval permission, which is what the row policy
   * tests. Computed here rather than in the client so the buttons are never
   * rendered for somebody the server would refuse.
   */
  const canDecide =
    session.isSuperuser ||
    isAntrosys(session) ||
    session.permissions.has("payroll.approve") ||
    session.permissions.has("attendance.approve");

  return <ApprovalsScreen requests={view} me={session.userId} canDecide={canDecide} />;
}
