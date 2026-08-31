import {
  computeDayFromPunches,
  minutesLateAgainstShift,
  type RawPunch,
} from "@/lib/attendance/compute";
import { ingestMealScans } from "@/lib/canteen/ingest";
import { PAKISTAN_TIMEZONE } from "@/lib/time";
import { createServiceClient } from "@/lib/supabase/service";
import type { Json } from "@/lib/supabase/database.types";
import type { DayType } from "@/lib/payroll/types";

import { toWallClockString, workDateFromWallClock, zonedWallClockToUtc } from "./timezone";
import type { IclockPunch } from "./zkteco/iclock";
import { directionFromState, type DeviceAttendanceRecord } from "./zkteco/protocol";

/**
 * Normalises records pulled over TCP into the same shape the push endpoint
 * produces, so both transports share one ingestion path and one timezone rule.
 */
export function recordsToPunches(records: readonly DeviceAttendanceRecord[]): IclockPunch[] {
  return records.map((record) => ({
    deviceUserId: record.deviceUserId,
    localTimestamp: toWallClockString(record.timestamp),
    state: record.state,
    verifyMode: record.verifyMode,
    workCode: null,
    direction: directionFromState(record.state),
  }));
}

/**
 * Persists punches from a biometric terminal and refreshes the derived
 * attendance rows.
 *
 * Runs with the service-role key because the caller is a device, not a signed-in
 * person. Ingestion is idempotent: terminals replay their whole buffer after a
 * network drop, and a unique index on (device, device user, timestamp) makes
 * those replays no-ops rather than double-counted hours.
 */

export interface IngestResult {
  accepted: number;
  duplicates: number;
  unmapped: string[];
  recomputedDays: number;
}

export interface DeviceRecord {
  id: string;
  site_id: string;
  timezone: string;
  /** Canteen terminals record meals, never attendance. */
  purpose: "attendance" | "canteen";
}

/**
 * Marks a terminal as alive and returns it, or null if the serial is unknown.
 *
 * Used by the handshake as well as by ingestion. A push-mode terminal repeats
 * the handshake every few seconds but may not upload a punch for hours, so
 * counting only uploads as a heartbeat leaves a perfectly healthy device
 * reading "offline" all night — and makes a genuinely dead one indistinguishable
 * from a quiet one.
 *
 * `last_error` is cleared on contact: a failed pull-mode test writes one, and
 * without this it would sit on the device page forever while push works fine.
 */
export async function recordDeviceContact(serialNumber: string): Promise<DeviceRecord | null> {
  const supabase = createServiceClient();

  const { data: device, error } = await supabase
    .from("devices")
    .select("id, site_id, timezone, purpose")
    .eq("serial_number", serialNumber)
    .single<DeviceRecord>();

  if (error || !device) return null;

  await supabase
    .from("devices")
    .update({ last_seen_at: new Date().toISOString(), status: "online", last_error: null })
    .eq("id", device.id);

  return device;
}

export async function ingestPunches(
  serialNumber: string,
  punches: readonly IclockPunch[],
): Promise<IngestResult> {
  const supabase = createServiceClient();

  const device = await recordDeviceContact(serialNumber);
  if (!device) {
    throw new Error(`Unknown terminal serial number: ${serialNumber}`);
  }

  /*
   * A canteen terminal's scans are meals, not attendance. Branching here
   * rather than in each route means both transports — the terminal pushing to
   * /iclock/cdata and the on-site agent posting to /api/devices/ingest — route
   * correctly with no change to either, and no path exists that could quietly
   * turn a lunch queue into a shift's worth of paid hours.
   */
  if (device.purpose === "canteen") {
    const meals = await ingestMealScans(device, punches);
    return {
      accepted: meals.served,
      duplicates: meals.duplicates,
      unmapped: [],
      recomputedDays: 0,
    };
  }

  if (punches.length === 0) {
    return { accepted: 0, duplicates: 0, unmapped: [], recomputedDays: 0 };
  }

  // Resolve the terminal's enrolment numbers to people in one round trip.
  const deviceUserIds = [...new Set(punches.map((p) => p.deviceUserId))];
  const { data: enrolments } = await supabase
    .from("device_enrollments")
    .select("device_user_id, profile_id")
    .eq("device_id", device.id)
    .in("device_user_id", deviceUserIds);

  const profileByDeviceUser = new Map<string, string>(
    (enrolments ?? []).map((e) => [e.device_user_id as string, e.profile_id as string]),
  );

  const unmapped = deviceUserIds.filter((id) => !profileByDeviceUser.has(id));

  // The terminal's reading is wall-clock time at the factory, with no zone.
  // Anchor it to the device's timezone rather than the server's, or the same
  // punch would land at a different instant depending on where this is hosted.
  const timeZone = device.timezone || "UTC";

  const rows = punches.flatMap((punch) => {
    const punchedAt = zonedWallClockToUtc(punch.localTimestamp, timeZone);
    const workDate = workDateFromWallClock(punch.localTimestamp);
    if (!punchedAt || !workDate) return [];

    return [
      {
        device_id: device.id,
        device_user_id: punch.deviceUserId,
        profile_id: profileByDeviceUser.get(punch.deviceUserId) ?? null,
        punched_at: punchedAt.toISOString(),
        work_date: workDate,
        direction: punch.direction,
        verify_mode: String(punch.verifyMode),
        source: "device" as const,
        // Kept verbatim so a disputed punch can always be traced back to what
        // the terminal actually sent.
        raw: JSON.parse(JSON.stringify(punch)) as Json,
      },
    ];
  });

  if (rows.length === 0) {
    return { accepted: 0, duplicates: punches.length, unmapped, recomputedDays: 0 };
  }

  // ignoreDuplicates leans on the punches_dedupe unique index so a replayed
  // batch is silently discarded instead of erroring the whole request.
  const { data: inserted, error: insertError } = await supabase
    .from("punches")
    .upsert(rows, {
      onConflict: "device_id,device_user_id,punched_at",
      ignoreDuplicates: true,
    })
    .select("profile_id, work_date");

  if (insertError) {
    throw new Error(`Could not store punches: ${insertError.message}`);
  }

  const accepted = inserted?.length ?? 0;

  const affected = new Map<string, { profileId: string; workDate: string }>();
  for (const row of inserted ?? []) {
    if (!row.profile_id) continue;
    const key = `${row.profile_id}:${row.work_date}`;
    affected.set(key, { profileId: row.profile_id as string, workDate: row.work_date as string });
  }

  for (const { profileId, workDate } of affected.values()) {
    await recomputeAttendanceDay(profileId, workDate, device.site_id);
  }

  return {
    accepted,
    duplicates: rows.length - accepted,
    unmapped,
    recomputedDays: affected.size,
  };
}

/**
 * Rebuilds one person's attendance row for one date from its punches.
 *
 * Always recomputes from the raw punches rather than adjusting in place, so a
 * late-arriving punch or a corrected rate produces the same answer as a clean
 * run. Rows a supervisor edited by hand are left alone.
 */
export async function recomputeAttendanceDay(
  profileId: string,
  workDate: string,
  siteId: string,
): Promise<void> {
  const supabase = createServiceClient();

  const { data: existing } = await supabase
    .from("attendance_days")
    .select("id, is_manual, locked")
    .eq("profile_id", profileId)
    .eq("work_date", workDate)
    .maybeSingle();

  if (existing?.is_manual || existing?.locked) return;

  const [{ data: punchRows }, { data: profile }, dayType] = await Promise.all([
    supabase
      .from("punches")
      .select("punched_at, direction")
      .eq("profile_id", profileId)
      .eq("work_date", workDate)
      .order("punched_at", { ascending: true }),
    supabase
      .from("profiles")
      .select("requires_attendance, shift_id, site_id, flexible_hours")
      .eq("id", profileId)
      .single(),
    resolveDayType(siteId, workDate),
  ]);

  const punches: RawPunch[] = (punchRows ?? []).map((row) => ({
    punchedAt: new Date(row.punched_at as string),
    direction: (row.direction as RawPunch["direction"]) ?? "unknown",
  }));

  const computed = computeDayFromPunches(punches, dayType, {
    requiresAttendance: profile?.requires_attendance ?? true,
  });

  /*
   * Lateness is judged against the shift the person is rostered on, anchored
   * to Pakistan time — the clock the factory floor actually works to.
   *
   * Staff on flexible hours keep no in or out time, so nothing here applies to
   * them. They stay on their shift for the roster: knowing a fitter works
   * nights is useful even when he is never marked late for arriving at ten.
   */
  let minutesLate = 0;
  const flexible = profile?.flexible_hours ?? false;
  const shiftId = profile?.shift_id ?? null;

  if (shiftId && computed.firstIn && !flexible) {
    const { data: shift } = await supabase
      .from("shifts")
      .select("starts_at, grace_minutes")
      .eq("id", shiftId)
      .maybeSingle();

    if (shift) {
      const shiftStart = zonedWallClockToUtc(
        `${workDate} ${String(shift.starts_at).slice(0, 8)}`,
        PAKISTAN_TIMEZONE,
      );
      if (shiftStart) {
        minutesLate = minutesLateAgainstShift(computed.firstIn, shiftStart, shift.grace_minutes);
      }
    }
  }

  await supabase.from("attendance_days").upsert(
    {
      profile_id: profileId,
      site_id: siteId,
      work_date: workDate,
      first_in: computed.firstIn?.toISOString() ?? null,
      last_out: computed.lastOut?.toISOString() ?? null,
      day_type: dayType,
      status: computed.status,
      note: computed.anomaly,
      shift_id: shiftId,
      minutes_late: minutesLate,
      is_late: minutesLate > 0,
      // Hour bucketing belongs to the payroll engine, which reads these totals
      // together with the rate rule in force for the period.
      regular_hours: computed.hoursWorked,
      ot_hours: 0,
      weekend_hours: 0,
      holiday_hours: 0,
      computed_at: new Date().toISOString(),
    },
    { onConflict: "profile_id,work_date" },
  );
}

/** Explicit calendar override first, then the site's weekly pattern. */
export async function resolveDayType(siteId: string, workDate: string): Promise<DayType> {
  const supabase = createServiceClient();

  const { data: override } = await supabase
    .from("calendar_days")
    .select("day_type")
    .eq("site_id", siteId)
    .eq("day", workDate)
    .maybeSingle();

  if (override?.day_type) return override.day_type as DayType;

  // Parsed and read in UTC, the convention the payroll module documents: a
  // date string and a local `getDay()` agree today only because both sides
  // happen to use the server's zone, and the pair is one edit from disagreeing.
  const weekday = new Date(`${workDate}T00:00:00Z`).getUTCDay();
  const { data: pattern } = await supabase
    .from("work_week")
    .select("is_working")
    .eq("site_id", siteId)
    .eq("weekday", weekday)
    .maybeSingle();

  if (pattern && pattern.is_working === false) return "off";
  return "workday";
}
