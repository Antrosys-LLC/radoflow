import { unmatchedMeals } from "@/lib/canteen/unmatched";
import type { Metadata } from "next";
import Link from "next/link";
import { History } from "lucide-react";

import { requireAnyPermission } from "@/lib/auth/session";
import { dictionaryFor } from "@/lib/i18n";
import { createClient } from "@/lib/supabase/server";
import { pakistanDayStartUtc, todayInPakistan } from "@/lib/time";

import { shiftDate } from "@/lib/canteen/meals";

import { CounterScreen, type ScanView } from "./counter-screen";
import { ScanLog, type ScanLogRow } from "./scan-log";

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
    .select("id, outcome, profile_id, device_user_id, meal_window_id, scanned_at, served_on")
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
        : fresh.device_user_id
          ? // Nobody was matched at scan time. The number the terminal sent is
            // still shown, with the person it belongs to now if there is one.
            supabase
              .from("employee_directory")
              .select("full_name, employee_code, photo_url")
              .eq("employee_code", fresh.device_user_id)
              .maybeSingle()
          : Promise.resolve({ data: null }),
      fresh.meal_window_id
        ? supabase.from("meal_windows").select("name").eq("id", fresh.meal_window_id).maybeSingle()
        : Promise.resolve({ data: null }),
    ]);

    // When the same person was already served, the counter's real question is
    // "when did they eat?" — showing that time is what settles an argument at
    // the counter without anyone needing to read an explanation. The rule is
    // a rolling 24 hours regardless of window or date, so the lookup has to
    // match that: the earlier meal can be in a different window (dinner then
    // breakfast) or have no window at all (a 03:00 scan), and it is always
    // the most recent claim inside the shadow, not one tied to today's date.
    let earlierAt: string | null = null;
    if (fresh.outcome === "duplicate" && fresh.profile_id) {
      const { data: claim } = await supabase
        .from("meal_claims")
        .select("claimed_at")
        .eq("profile_id", fresh.profile_id)
        .gt(
          "claimed_at",
          new Date(Date.parse(fresh.scanned_at) - 24 * 60 * 60 * 1000).toISOString(),
        )
        .order("claimed_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      earlierAt = claim?.claimed_at ?? null;
    }

    scan = {
      id: String(fresh.id),
      outcome: fresh.outcome,
      fullName: person?.full_name ?? null,
      employeeCode: person?.employee_code ?? null,
      deviceUserId: fresh.device_user_id ?? null,
      photoUrl: person?.photo_url ?? null,
      mealName: window?.name ?? null,
      scannedAt: fresh.scanned_at,
      earlierAt,
    };
  }

  const canSeeCounts = session.permissions.has("canteen.view") || session.isSuperuser;

  /*
   * Both tallies at once. This screen is polled every five seconds with a
   * queue in front of it, so two sequential counts are two sequential waits
   * on every tick.
   *
   * The refusal count is bounded by the Pakistan day, not the database
   * session's UTC one — the night shift eats either side of midnight, and
   * those refusals are the ones worth counting.
   */
  const [{ count: servedClaims }, { count: refusedToday }, { data: strayScans }] = await Promise.all([
    supabase
      .from("meal_claims")
      .select("id", { count: "exact", head: true })
      .eq("served_on", today),
    supabase
      .from("meal_scan_log")
      .select("id", { count: "exact", head: true })
      .eq("outcome", "duplicate")
      .gte("scanned_at", pakistanDayStartUtc(today))
      .lt("scanned_at", pakistanDayStartUtc(shiftDate(today, 1))),
    // A plate handed to somebody RadoFlow does not know is still a plate.
    supabase
      .from("meal_scan_log")
      .select("device_user_id, scanned_at")
      .eq("outcome", "unknown_person")
      .gte("scanned_at", pakistanDayStartUtc(today))
      .lt("scanned_at", pakistanDayStartUtc(shiftDate(today, 1))),
  ]);
  const servedToday = (servedClaims ?? 0) + unmatchedMeals(strayScans ?? []).length;

  /*
   * The day's register, for whoever can read canteen records.
   *
   * Bounded by the same Pakistan day as the refusal tally rather than by
   * `served_on`: an unrecognised finger has no `served_on` at all, and those
   * rows are exactly the ones that explain why somebody went without.
   *
   * The names are joined in one extra query rather than through a foreign-key
   * embed, because the readable name lives on `employee_directory` — the
   * pay-free view — and a canteen supervisor has no read on `profiles`.
   */
  const scanLog: ScanLogRow[] = [];

  if (canSeeCounts) {
    const { data: todaysScans } = await supabase
      .from("meal_scan_log")
      .select("id, outcome, profile_id, device_user_id, meal_window_id, device_id, scanned_at")
      .gte("scanned_at", pakistanDayStartUtc(today))
      .lt("scanned_at", pakistanDayStartUtc(shiftDate(today, 1)))
      .order("scanned_at", { ascending: false })
      .limit(500);

    /*
     * One line per person: a second attempt is not a second entry, and the same
     * unmatched number scanned twice is one number. Oldest scan wins.
     */
    const seen = new Set<string>();
    const rows = (todaysScans ?? [])
      .filter((row) => row.outcome !== "duplicate")
      .reverse()
      .filter((row) => {
        const key = row.profile_id ?? `id:${row.device_user_id ?? row.id}`;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      })
      .reverse();
    const profileIds = [...new Set(rows.map((row) => row.profile_id).filter(Boolean))] as string[];
    const windowIds = [
      ...new Set(rows.map((row) => row.meal_window_id).filter(Boolean)),
    ] as string[];
    const deviceIds = [...new Set(rows.map((row) => row.device_id).filter(Boolean))] as string[];

    // Scans nobody was matched to: the number the terminal sent, and whoever
    // holds that number as an employee code now.
    const strayIds = [
      ...new Set(
        rows.filter((row) => !row.profile_id && row.device_user_id).map((row) => row.device_user_id),
      ),
    ] as string[];

    const [{ data: people }, { data: windows }, { data: terminals }, { data: strays }] =
      await Promise.all([
      profileIds.length
        ? supabase
            .from("employee_directory")
            .select("id, full_name, employee_code, photo_url")
            .in("id", profileIds)
        : Promise.resolve({ data: [] }),
      windowIds.length
        ? supabase.from("meal_windows").select("id, name").in("id", windowIds)
        : Promise.resolve({ data: [] }),
      deviceIds.length
        ? supabase.from("devices").select("id, name").in("id", deviceIds)
        : Promise.resolve({ data: [] }),
      strayIds.length
        ? supabase
            .from("employee_directory")
            .select("employee_code, full_name, photo_url")
            .in("employee_code", strayIds)
        : Promise.resolve({ data: [] }),
    ]);
    const byCode = new Map((strays ?? []).map((row) => [row.employee_code, row]));

    const person = new Map((people ?? []).map((row) => [row.id, row]));
    const mealName = new Map((windows ?? []).map((row) => [row.id, row.name]));
    const deviceName = new Map((terminals ?? []).map((row) => [row.id, row.name]));

    for (const row of rows) {
      const who = row.profile_id
        ? person.get(row.profile_id)
        : row.device_user_id
          ? byCode.get(row.device_user_id)
          : null;
      scanLog.push({
        id: String(row.id),
        outcome: row.outcome,
        fullName: who?.full_name ?? null,
        employeeCode: who?.employee_code ?? null,
        deviceUserId: row.device_user_id ?? null,
        photoUrl: who?.photo_url ?? null,
        mealName: row.meal_window_id ? (mealName.get(row.meal_window_id) ?? null) : null,
        deviceName: row.device_id ? (deviceName.get(row.device_id) ?? null) : null,
        scannedAt: row.scanned_at,
      });
    }
  }

  return (
    <div className="space-y-4">
      {canSeeCounts ? (
        <div className="flex justify-end">
          <Link
            href="/canteen/history"
            className="inline-flex items-center gap-2 rounded-2xl bg-secondary px-4 py-2.5 text-sm font-bold text-foreground transition-colors hover:text-primary"
          >
            <History className="size-4" aria-hidden />
            {dictionaryFor(session.profile.language).canteenHistory.history}
          </Link>
        </div>
      ) : null}
      <CounterScreen
        scan={scan}
        servedToday={servedToday}
        refusedToday={refusedToday ?? 0}
        canSeeCounts={canSeeCounts}
      />
      {canSeeCounts ? <ScanLog rows={scanLog} /> : null}
    </div>
  );
}
