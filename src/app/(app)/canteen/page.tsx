import type { Metadata } from "next";

import { requireAnyPermission } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { pakistanDayStartUtc, todayInPakistan } from "@/lib/time";

import { shiftDate } from "@/lib/canteen/meals";

import { CounterScreen, type ScanView } from "./counter-screen";

export const metadata: Metadata = {
  title: { absolute: "Canteen | Rado Dyeing and Textile" },
  description: "The serving counter: one meal per person, confirmed by fingerprint.",
};

export const dynamic = "force-dynamic";

/**
 * The canteen counter screen.
 *
 * Read by people who do not read English and may not read confidently at all,
 * standing at a serving counter with a queue in front of them. So the answer
 * is carried by colour, a single large symbol, and the worker's own
 * photograph — the text is a courtesy, not the message.
 *
 * The last scan is always fetched; deciding when it has gone stale belongs to
 * the client, which can expire it on a timer. Doing it here would tie how
 * long a result stays up to when the next poll happens to land — so a green
 * tick could sit there well past its welcome and the next person in the queue
 * would read it as their own.
 */
export default async function CanteenPage() {
  const session = await requireAnyPermission(["canteen.serve", "canteen.view"]);
  const supabase = await createClient();
  const today = todayInPakistan();

  const { data: recent } = await supabase
    .from("meal_scan_log")
    .select("id, outcome, profile_id, meal_window_id, scanned_at, served_on")
    .order("scanned_at", { ascending: false })
    .limit(1);

  const fresh = recent?.[0] ?? null;

  let scan: ScanView | null = null;

  if (fresh) {
    const [{ data: person }, { data: window }] = await Promise.all([
      fresh.profile_id
        ? supabase
            .from("employee_directory")
            .select("full_name, employee_code, photo_url")
            .eq("id", fresh.profile_id)
            .maybeSingle()
        : Promise.resolve({ data: null }),
      fresh.meal_window_id
        ? supabase.from("meal_windows").select("name").eq("id", fresh.meal_window_id).maybeSingle()
        : Promise.resolve({ data: null }),
    ]);

    // When the same person was already served, the counter's real question is
    // "when did they eat?" — showing that time is what settles an argument at
    // the counter without anyone needing to read an explanation.
    let earlierAt: string | null = null;
    if (fresh.outcome === "duplicate" && fresh.profile_id && fresh.meal_window_id) {
      const { data: claim } = await supabase
        .from("meal_claims")
        .select("claimed_at")
        .eq("profile_id", fresh.profile_id)
        .eq("meal_window_id", fresh.meal_window_id)
        .eq("served_on", fresh.served_on ?? today)
        .maybeSingle();
      earlierAt = claim?.claimed_at ?? null;
    }

    scan = {
      id: String(fresh.id),
      outcome: fresh.outcome,
      fullName: person?.full_name ?? null,
      employeeCode: person?.employee_code ?? null,
      photoUrl: person?.photo_url ?? null,
      mealName: window?.name ?? null,
      scannedAt: fresh.scanned_at,
      earlierAt,
    };
  }

  const { count: servedToday } = await supabase
    .from("meal_claims")
    .select("id", { count: "exact", head: true })
    .eq("served_on", today);

  // Bounded by the Pakistan day, not the database session's UTC one — the
  // night shift eats either side of midnight, and those refusals are the ones
  // worth counting.
  const { count: refusedToday } = await supabase
    .from("meal_scan_log")
    .select("id", { count: "exact", head: true })
    .eq("outcome", "duplicate")
    .gte("scanned_at", pakistanDayStartUtc(today))
    .lt("scanned_at", pakistanDayStartUtc(shiftDate(today, 1)));

  return (
    <CounterScreen
      scan={scan}
      servedToday={servedToday ?? 0}
      refusedToday={refusedToday ?? 0}
      canSeeCounts={session.permissions.has("canteen.view") || session.isSuperuser}
    />
  );
}
