import { createServiceClient } from "@/lib/supabase/service";

import { parseWallClock } from "@/lib/devices/timezone";
import type { IclockPunch } from "@/lib/devices/zkteco/iclock";

import { decideMealScan, type MealScanOutcome, type MealWindow } from "./meals";

/**
 * Turning canteen terminal scans into servings.
 *
 * Runs with the service-role key for the same reason attendance ingestion
 * does: the caller is a device, not a signed-in person, and the terminal has
 * already been identified by serial number.
 *
 * Scans are processed one at a time rather than as a bulk upsert. A batch
 * insert would either reject the whole replay because one row collided, or
 * discard the collisions silently — and a collision is exactly the event this
 * feature exists to record. Volume makes this affordable: a canteen sees a
 * few hundred scans across a serving, not the continuous stream a gate does.
 */

export interface MealIngestResult {
  served: number;
  duplicates: number;
  unknown: number;
  outsideWindow: number;
}

interface CanteenDevice {
  id: string;
  site_id: string;
  timezone: string;
}

export async function ingestMealScans(
  device: CanteenDevice,
  punches: readonly IclockPunch[],
): Promise<MealIngestResult> {
  const supabase = createServiceClient();
  const result: MealIngestResult = { served: 0, duplicates: 0, unknown: 0, outsideWindow: 0 };

  if (punches.length === 0) return result;

  const [{ data: windowRows }, { data: enrolments }] = await Promise.all([
    supabase
      .from("meal_windows")
      .select("id, code, name, starts_at, ends_at")
      .eq("site_id", device.site_id)
      .eq("is_active", true)
      .order("sort_order"),
    supabase
      .from("device_enrollments")
      .select("device_user_id, profile_id")
      .eq("device_id", device.id)
      .in("device_user_id", [...new Set(punches.map((p) => p.deviceUserId))]),
  ]);

  const windows: MealWindow[] = (windowRows ?? []).map((row) => ({
    id: row.id,
    code: row.code,
    name: row.name,
    startsAt: String(row.starts_at),
    endsAt: String(row.ends_at),
  }));

  const profileByDeviceUser = new Map<string, string>(
    (enrolments ?? []).map((e) => [e.device_user_id as string, e.profile_id as string]),
  );

  for (const punch of punches) {
    // The terminal reports the clock on the factory wall with no zone. Meal
    // windows are written in that same local time, so they are compared
    // directly rather than converted — the instant only matters for the audit
    // trail, which uses the row's own default.
    const wall = parseWallClock(punch.localTimestamp);
    if (!wall) continue;

    const localDate = `${wall.year}-${String(wall.month).padStart(2, "0")}-${String(wall.day).padStart(2, "0")}`;
    const localTime = `${String(wall.hour).padStart(2, "0")}:${String(wall.minute).padStart(2, "0")}:${String(wall.second).padStart(2, "0")}`;

    const profileId = profileByDeviceUser.get(punch.deviceUserId) ?? null;

    // Resolve the window first so the "already eaten" lookup is scoped to the
    // right meal — asking before that would be a question with no subject.
    const provisional = decideMealScan({
      profileId,
      windows,
      localDate,
      localTime,
      alreadyClaimed: false,
    });

    let outcome: MealScanOutcome = provisional.outcome;

    if (
      provisional.outcome === "served" &&
      profileId &&
      provisional.window &&
      provisional.servedOn
    ) {
      /*
       * Insert first and let the unique index answer, rather than checking
       * for an existing row and then writing. A read-then-write races: two
       * terminals, or one replayed batch, can both see "not yet claimed" and
       * both insert. The constraint cannot be raced, so a 23505 here *is* the
       * duplicate detection.
       */
      const { error } = await supabase.from("meal_claims").insert({
        profile_id: profileId,
        site_id: device.site_id,
        meal_window_id: provisional.window.id,
        served_on: provisional.servedOn,
        device_id: device.id,
        device_user_id: punch.deviceUserId,
        source: "device",
      });

      if (error) {
        if (error.code === "23505") outcome = "duplicate";
        else throw new Error(`Could not record a meal claim: ${error.message}`);
      }
    }

    await supabase.from("meal_scan_log").insert({
      device_id: device.id,
      device_user_id: punch.deviceUserId,
      profile_id: profileId,
      site_id: device.site_id,
      meal_window_id: provisional.window?.id ?? null,
      outcome,
      served_on: provisional.servedOn,
    });

    if (outcome === "served") result.served += 1;
    else if (outcome === "duplicate") result.duplicates += 1;
    else if (outcome === "unknown_person") result.unknown += 1;
    else result.outsideWindow += 1;
  }

  return result;
}
