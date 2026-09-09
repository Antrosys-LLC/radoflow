import type { Metadata } from "next";

import { requireAnyPermission } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { pakistanDayStartUtc, todayInPakistan } from "@/lib/time";

import { GateScreen, type GateEntryView } from "./gate-screen";

export const metadata: Metadata = {
  title: { absolute: "Gate Register | Rado Dyeing and Textile" },
  description: "Who and what came through the gate, and when.",
};

export const dynamic = "force-dynamic";

/** `YYYY-MM-DD` shifted by whole days, parsed as UTC like the rest of the app. */
function shiftDate(date: string, days: number): string {
  const parsed = new Date(`${date}T00:00:00Z`);
  parsed.setUTCDate(parsed.getUTCDate() + days);
  return parsed.toISOString().slice(0, 10);
}

/**
 * The gate register.
 *
 * Opens on today, because the supervisor writing in it is standing at the gate
 * now. A date range is in the URL for the questions asked later — "who came on
 * Tuesday", "did that load ever come back" — which is also what the download
 * exports.
 */
export default async function GatePage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string; to?: string }>;
}) {
  const session = await requireAnyPermission(["gate.log", "gate.view", "gate.manage"]);
  const params = await searchParams;
  const supabase = await createClient();

  const today = todayInPakistan();
  const from = params.from || today;
  const to = params.to || today;

  const { data: rows } = await supabase
    .from("gate_entries")
    .select("*")
    // Bounded by the Pakistan day rather than the database's UTC one — a night
    // shift's gate traffic sits either side of midnight.
    .gte("happened_at", pakistanDayStartUtc(from))
    .lt("happened_at", pakistanDayStartUtc(shiftDate(to, 1)))
    .order("happened_at", { ascending: false })
    .limit(500);

  const entries = rows ?? [];

  // Names for the two people on a row, from the pay-free directory.
  const ids = [
    ...new Set(entries.flatMap((row) => [row.recorded_by, row.edited_by].filter(Boolean))),
  ] as string[];

  const { data: people } = ids.length
    ? await supabase.from("employee_directory").select("id, full_name").in("id", ids)
    : { data: [] };

  const nameOf = new Map((people ?? []).map((person) => [person.id, person.full_name ?? ""]));

  const view: GateEntryView[] = entries.map((row) => ({
    id: row.id,
    kind: row.kind,
    direction: row.direction,
    subject: row.subject,
    party: row.party,
    purpose: row.purpose,
    reference: row.reference,
    quantity: row.quantity,
    remarks: row.remarks,
    happenedAt: row.happened_at,
    createdAt: row.created_at,
    recordedBy: row.recorded_by,
    recordedByName: nameOf.get(row.recorded_by) ?? "",
    editedByName: row.edited_by ? (nameOf.get(row.edited_by) ?? "") : null,
  }));

  return (
    <GateScreen
      entries={view}
      me={session.userId}
      canLog={session.isSuperuser || session.permissions.has("gate.log")}
      canManage={session.isSuperuser || session.permissions.has("gate.manage")}
      siteId={session.profile.siteId}
      from={from}
      to={to}
    />
  );
}
