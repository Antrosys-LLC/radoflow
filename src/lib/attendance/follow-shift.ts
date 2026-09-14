import { belongsToPreviousNight, detectShift } from "@/lib/attendance/shift-detect";
import { workDateFromWallClock, zonedWallClockToUtc } from "@/lib/devices/timezone";
import type { IclockPunch } from "@/lib/devices/zkteco/iclock";
import type { createServiceClient } from "@/lib/supabase/service";

/**
 * The two places the punch path needs to know about shifts.
 *
 * Both run on the service client inside ingestion, and both fail soft: a
 * database that has not had the shift migration yet — or a query that simply
 * fails — leaves the punch credited by the old rule and the roster as it was.
 * A punch is never refused because the roster could not be read.
 */

type Service = ReturnType<typeof createServiceClient>;

/** Attended days in a row before somebody's shift is moved. */
const DEFAULT_STREAK = 3;

function previousDate(date: string): string {
  const parsed = new Date(`${date}T00:00:00Z`);
  parsed.setUTCDate(parsed.getUTCDate() - 1);
  return parsed.toISOString().slice(0, 10);
}

/** `YYYY-MM-DD HH:MM:SS` → its calendar date and hour. */
function wallParts(localTimestamp: string): { date: string; hour: number } | null {
  const match = localTimestamp.match(/^(\d{4}-\d{2}-\d{2})[ T](\d{2}):/);
  return match ? { date: match[1]!, hour: Number(match[2]) } : null;
}

/**
 * The work date for each punch in a batch.
 *
 * Everything takes the long-standing rule — before 05:00 belongs to the night
 * before — except a night-shift worker's punch between 05:00 and 10:00 while a
 * check-in from the previous evening is still open. That is the tail of the
 * night shift's overtime, which now runs to 08:00, and crediting it to the new
 * date would split one night into two half days.
 */
export async function creditWorkDates(
  supabase: Service,
  punches: readonly IclockPunch[],
  profileByDeviceUser: ReadonlyMap<string, string>,
  timeZone: string,
): Promise<Map<IclockPunch, string>> {
  const dates = new Map<IclockPunch, string>();

  const candidates: { punch: IclockPunch; profileId: string; date: string }[] = [];
  for (const punch of punches) {
    const base = workDateFromWallClock(punch.localTimestamp);
    if (!base) continue;
    dates.set(punch, base);

    const parts = wallParts(punch.localTimestamp);
    const profileId = profileByDeviceUser.get(punch.deviceUserId);
    if (parts && profileId && parts.hour >= 5 && parts.hour < 10) {
      candidates.push({ punch, profileId, date: parts.date });
    }
  }

  if (candidates.length === 0) return dates;

  try {
    const profileIds = [...new Set(candidates.map((c) => c.profileId))];
    const { data: people, error } = await supabase
      .from("profiles")
      .select("id, shift_id")
      .in("id", profileIds);
    if (error || !people) return dates;

    const shiftIds = [...new Set(people.map((p) => p.shift_id).filter(Boolean))] as string[];
    if (shiftIds.length === 0) return dates;

    const { data: shifts } = await supabase.from("shifts").select("id, code").in("id", shiftIds);
    const nightShifts = new Set((shifts ?? []).filter((s) => s.code === "NIGHT").map((s) => s.id));
    const onNights = new Set(
      people.filter((p) => p.shift_id && nightShifts.has(p.shift_id)).map((p) => p.id),
    );

    for (const candidate of candidates) {
      if (!onNights.has(candidate.profileId)) continue;

      const previous = previousDate(candidate.date);
      const punchedAt = zonedWallClockToUtc(candidate.punch.localTimestamp, timeZone);
      if (!punchedAt) continue;

      // An evening check-in in this same upload counts as open too.
      const inBatch = punches.some((other) => {
        if (other.deviceUserId !== candidate.punch.deviceUserId) return false;
        const parts = wallParts(other.localTimestamp);
        return Boolean(parts && parts.date === previous && parts.hour >= 14);
      });

      let open = inBatch;
      if (!open) {
        const { data: evening } = await supabase
          .from("punches")
          .select("id")
          .eq("profile_id", candidate.profileId)
          .eq("work_date", previous)
          .gte("punched_at", new Date(punchedAt.getTime() - 16 * 3_600_000).toISOString())
          .lt("punched_at", punchedAt.toISOString())
          .limit(1);
        open = (evening ?? []).length > 0;
      }

      const hour = wallParts(candidate.punch.localTimestamp)!.hour;
      if (belongsToPreviousNight({ hour, onNightShift: true, openFromPreviousEvening: open })) {
        dates.set(candidate.punch, previous);
      }
    }
  } catch {
    // The old rule stands for this batch.
  }

  return dates;
}

/**
 * Moves people onto the shift their check-ins say they are working.
 *
 * Only for somebody whose shift follows attendance, who keeps in and out times
 * at all, and who is paid from attendance. The run length comes from
 * `shifts.auto_switch_after_days`. Somebody with no shift yet is given the one
 * their check-ins agree on.
 */
export async function followShifts(supabase: Service, profileIds: readonly string[]) {
  if (profileIds.length === 0) return;

  try {
    const [{ data: setting }, { data: people, error }] = await Promise.all([
      supabase
        .from("app_settings")
        .select("value")
        .eq("key", "shifts.auto_switch_after_days")
        .maybeSingle(),
      supabase
        .from("profiles")
        .select(
          "id, site_id, shift_id, shift_follows_attendance, flexible_hours, requires_attendance",
        )
        .in("id", [...profileIds]),
    ]);

    // A database without the migration has no such column: leave the roster.
    if (error || !people) return;

    const configured = Number(setting?.value);
    const streak = Number.isInteger(configured) && configured >= 1 ? configured : DEFAULT_STREAK;

    const eligible = people.filter(
      (person) =>
        person.shift_follows_attendance &&
        !person.flexible_hours &&
        person.requires_attendance &&
        person.site_id,
    );
    if (eligible.length === 0) return;

    const siteIds = [...new Set(eligible.map((person) => person.site_id!))];
    const { data: shifts } = await supabase
      .from("shifts")
      .select("id, site_id, code")
      .in("site_id", siteIds)
      .in("code", ["DAY", "NIGHT"])
      .eq("is_active", true);

    for (const person of eligible) {
      const { data: days } = await supabase
        .from("attendance_days")
        .select("work_date, first_in")
        .eq("profile_id", person.id)
        .not("first_in", "is", null)
        .order("work_date", { ascending: false })
        .limit(streak);

      const detected = detectShift(
        (days ?? []).map((day) => ({ workDate: day.work_date, firstIn: day.first_in })),
        streak,
      );
      if (!detected) continue;

      const target = (shifts ?? []).find(
        (shift) => shift.site_id === person.site_id && shift.code === detected,
      );
      if (!target || target.id === person.shift_id) continue;

      await supabase
        .from("profiles")
        .update({ shift_id: target.id, shift_changed_at: new Date().toISOString() })
        .eq("id", person.id);
    }
  } catch {
    // The roster catches up on the next punch.
  }
}
