import { autoCheckOutAt } from "@/lib/attendance/auto-check-out";
import { presenceWindowHours } from "@/lib/attendance/shift-detect";
import { pakistanMinutesOfDay, shiftForArrival } from "@/lib/attendance/shift-detect";
import type { ShiftClock } from "@/lib/attendance/shift-now";
import { recomputeAttendanceDay } from "@/lib/devices/ingest";
import { DEFAULT_PAY_RULE } from "@/lib/payroll/types";
import { createServiceClient } from "@/lib/supabase/service";

/**
 * Checks out everybody whose check-out time has passed and who never scanned.
 *
 * "Never scanned" is read from the punches, not from the stored day: a person's
 * latest punch being a check-in is what an open stretch is, and it stays true
 * for a day that was closed once and opened again. The check-out is written as
 * a punch of its own (`source = 'auto'`) at the moment the rule says the person
 * was due out — not at the minute this ran — and the day is rebuilt through
 * `recomputeAttendanceDay`, so hours, overtime and lateness come out exactly as
 * if the terminal had recorded it. A real scan that arrives afterwards finds
 * nothing open and closes nothing: the first check-out stands.
 *
 * Corrected (`is_manual`) and locked days are left to the people who set them,
 * as everywhere else.
 */

/** Long enough to catch a night that crossed two runs; older is a missed check-out for the office. */
export const AUTO_CHECK_OUT_LOOKBACK_HOURS = 36;

export interface AutoCheckOut {
  profileId: string;
  name: string;
  workDate: string;
  checkedInAt: string;
  checkedOutAt: string;
}

export interface AutoCheckOutResult {
  considered: number;
  closed: AutoCheckOut[];
  /** Left alone because the day was corrected or locked by hand. */
  heldByOffice: number;
}

interface PunchRow {
  id: number;
  profile_id: string | null;
  device_user_id: string | null;
  punched_at: string;
  work_date: string;
  direction: "in" | "out" | "unknown";
}

async function recentPunches(sinceIso: string): Promise<PunchRow[]> {
  const supabase = createServiceClient();
  const rows: PunchRow[] = [];
  for (let offset = 0; ; offset += 1000) {
    const { data, error } = await supabase
      .from("punches")
      .select("id, profile_id, device_user_id, punched_at, work_date, direction")
      .gte("punched_at", sinceIso)
      .not("profile_id", "is", null)
      .order("punched_at")
      .order("id")
      .range(offset, offset + 999);
    if (error) throw new Error(`Reading recent punches failed: ${error.message}`);
    rows.push(...(data as PunchRow[]));
    if (data.length < 1000) break;
  }
  return rows;
}

export async function autoCheckOutOverdue(
  options: { now?: Date; lookbackHours?: number; dryRun?: boolean } = {},
): Promise<AutoCheckOutResult> {
  const now = options.now ?? new Date();
  const dryRun = options.dryRun ?? false;
  const since = new Date(
    now.getTime() - (options.lookbackHours ?? AUTO_CHECK_OUT_LOOKBACK_HOURS) * 3_600_000,
  );
  const supabase = createServiceClient();

  const punches = await recentPunches(since.toISOString());

  // Each person's latest punch; only a check-in left standing is an open stretch.
  const latest = new Map<string, PunchRow>();
  for (const punch of punches) latest.set(punch.profile_id!, punch);
  const open = [...latest.values()].filter((punch) => punch.direction === "in");
  if (open.length === 0) return { considered: 0, closed: [], heldByOffice: 0 };

  const [{ data: people, error: peopleError }, { data: shiftRows }, { data: ruleRows }] =
    await Promise.all([
      supabase
        .from("profiles")
        .select(
          "id, full_name, site_id, shift_id, flexible_hours, duty_hours, overtime_eligible, requires_attendance, status",
        )
        .eq("status", "active")
        .eq("requires_attendance", true),
      supabase
        .from("shifts")
        .select("id, code, name, starts_at, ends_at, overtime_until, grace_minutes, site_id")
        .eq("is_active", true)
        .order("sort_order"),
      supabase
        .from("pay_rules")
        .select("site_id, ot_daily_cap_hours, effective_from")
        .order("effective_from", { ascending: false }),
    ]);
  if (peopleError) throw new Error(`Reading people failed: ${peopleError.message}`);

  const personById = new Map((people ?? []).map((person) => [person.id, person]));

  const shiftsBySite = new Map<string, ShiftClock[]>();
  for (const row of shiftRows ?? []) {
    const list = shiftsBySite.get(row.site_id) ?? [];
    list.push({
      id: row.id,
      code: row.code,
      name: row.name,
      startsAt: String(row.starts_at),
      endsAt: String(row.ends_at),
      overtimeUntil: row.overtime_until ? String(row.overtime_until) : null,
      graceMinutes: row.grace_minutes ?? 0,
    });
    shiftsBySite.set(row.site_id, list);
  }

  // Newest rule in force per site; the list is already newest first.
  const today = now.toISOString().slice(0, 10);
  const capBySite = new Map<string, number>();
  for (const rule of ruleRows ?? []) {
    if (rule.effective_from > today || capBySite.has(rule.site_id)) continue;
    capBySite.set(rule.site_id, Number(rule.ot_daily_cap_hours));
  }

  const closed: AutoCheckOut[] = [];
  let heldByOffice = 0;
  let considered = 0;

  for (const punch of open) {
    const person = personById.get(punch.profile_id!);
    if (!person?.site_id) continue;
    considered += 1;

    const shifts = shiftsBySite.get(person.site_id) ?? [];
    const rostered = shifts.find((shift) => shift.id === person.shift_id) ?? null;
    const arrival = pakistanMinutesOfDay(punch.punched_at);
    const against = arrival === null ? rostered : shiftForArrival(shifts, rostered, arrival);

    const due = autoCheckOutAt(
      { at: new Date(punch.punched_at), workDate: punch.work_date },
      {
        shift: against,
        flexibleHours: person.flexible_hours ?? false,
        dutyHours: Number(person.duty_hours ?? 8) || 8,
        overtimeEligible: person.overtime_eligible ?? true,
        overtimeCapHours: capBySite.get(person.site_id) ?? DEFAULT_PAY_RULE.otDailyCapHours,
        windowHours: (rostered ? presenceWindowHours(rostered) : null) ?? 12,
      },
    );
    if (due.getTime() > now.getTime()) continue;

    const { data: day } = await supabase
      .from("attendance_days")
      .select("is_manual, locked")
      .eq("profile_id", person.id)
      .eq("work_date", punch.work_date)
      .maybeSingle();
    if (day?.is_manual || day?.locked) {
      heldByOffice += 1;
      continue;
    }

    if (!dryRun) {
      const { error } = await supabase.from("punches").insert({
        profile_id: person.id,
        device_id: null,
        device_user_id: punch.device_user_id,
        punched_at: due.toISOString(),
        work_date: punch.work_date,
        direction: "out",
        source: "auto",
        raw: { auto: true, reason: "no check-out by end of duty", ranAt: now.toISOString() },
      });
      if (error) throw new Error(`Auto check-out for ${person.full_name} failed: ${error.message}`);
      await recomputeAttendanceDay(person.id, punch.work_date, person.site_id);
    }

    closed.push({
      profileId: person.id,
      name: person.full_name,
      workDate: punch.work_date,
      checkedInAt: punch.punched_at,
      checkedOutAt: due.toISOString(),
    });
  }

  return { considered, closed, heldByOffice };
}

/**
 * Closes the stretches left open on days that are already over.
 *
 * `autoCheckOutOverdue` only looks at each person's latest punch, which is the
 * right test for "still checked in right now". A forgotten check-out in the
 * middle of a month is not that: the person came back the next day, so their
 * latest punch is an ordinary scan, and the earlier day sits at zero hours — a
 * whole day's pay lost to a missed tap. This reads the stored days instead,
 * finds each one whose last check-in was never closed, and stamps the check-out
 * at the same due time the live pass would have used (held before the person's
 * next punch, so it can never overlap their next arrival).
 */
export async function autoCheckOutOpenDays(options: {
  from: string;
  to: string;
  now?: Date;
  dryRun?: boolean;
}): Promise<AutoCheckOutResult> {
  const now = options.now ?? new Date();
  const dryRun = options.dryRun ?? false;
  const supabase = createServiceClient();

  const { data: openDays, error } = await supabase
    .from("attendance_days")
    .select("profile_id, work_date, site_id, is_manual, locked")
    .not("first_in", "is", null)
    .is("last_out", null)
    .gte("work_date", options.from)
    .lte("work_date", options.to);
  if (error) throw new Error(`Reading open days failed: ${error.message}`);
  if (!openDays || openDays.length === 0) return { considered: 0, closed: [], heldByOffice: 0 };

  const sinceIso = new Date(Date.parse(`${options.from}T00:00:00+05:00`) - 86_400_000).toISOString();
  const punches = await recentPunches(sinceIso);
  const byPerson = new Map<string, PunchRow[]>();
  for (const punch of punches) {
    const list = byPerson.get(punch.profile_id!) ?? [];
    list.push(punch);
    byPerson.set(punch.profile_id!, list);
  }

  const [{ data: people }, { data: shiftRows }, { data: ruleRows }] = await Promise.all([
    supabase
      .from("profiles")
      .select("id, full_name, site_id, shift_id, flexible_hours, duty_hours, overtime_eligible, requires_attendance")
      .eq("requires_attendance", true),
    supabase
      .from("shifts")
      .select("id, code, name, starts_at, ends_at, overtime_until, grace_minutes, site_id")
      .eq("is_active", true)
      .order("sort_order"),
    supabase
      .from("pay_rules")
      .select("site_id, ot_daily_cap_hours, effective_from")
      .order("effective_from", { ascending: false }),
  ]);
  const personById = new Map((people ?? []).map((person) => [person.id, person]));

  const shiftsBySite = new Map<string, ShiftClock[]>();
  for (const row of shiftRows ?? []) {
    const list = shiftsBySite.get(row.site_id) ?? [];
    list.push({
      id: row.id,
      code: row.code,
      name: row.name,
      startsAt: String(row.starts_at),
      endsAt: String(row.ends_at),
      overtimeUntil: row.overtime_until ? String(row.overtime_until) : null,
      graceMinutes: row.grace_minutes ?? 0,
    });
    shiftsBySite.set(row.site_id, list);
  }
  const today = now.toISOString().slice(0, 10);
  const capBySite = new Map<string, number>();
  for (const rule of ruleRows ?? []) {
    if (rule.effective_from > today || capBySite.has(rule.site_id)) continue;
    capBySite.set(rule.site_id, Number(rule.ot_daily_cap_hours));
  }

  const closed: AutoCheckOut[] = [];
  let heldByOffice = 0;
  let considered = 0;

  for (const day of openDays) {
    if (day.is_manual || day.locked) {
      heldByOffice += 1;
      continue;
    }
    const person = personById.get(day.profile_id);
    if (!person?.site_id) continue;

    const own = (byPerson.get(day.profile_id) ?? [])
      .slice()
      .sort((a, b) => Date.parse(a.punched_at) - Date.parse(b.punched_at));

    // The check-in still open at the end of this day's own punches.
    let open: PunchRow | null = null;
    for (const punch of own) {
      if (punch.work_date !== day.work_date) continue;
      if (punch.direction === "in" && !open) open = punch;
      else if (punch.direction === "out") open = null;
    }
    if (!open) continue;
    considered += 1;
    const openIn: PunchRow = open;

    const shifts = shiftsBySite.get(person.site_id) ?? [];
    const rostered = shifts.find((shift) => shift.id === person.shift_id) ?? null;
    const arrival = pakistanMinutesOfDay(openIn.punched_at);
    const against = arrival === null ? rostered : shiftForArrival(shifts, rostered, arrival);

    let due = autoCheckOutAt(
      { at: new Date(openIn.punched_at), workDate: openIn.work_date },
      {
        shift: against,
        flexibleHours: person.flexible_hours ?? false,
        dutyHours: Number(person.duty_hours ?? 8) || 8,
        // Duty, plus the overtime ceiling for anyone the sheet gives overtime.
        overtimeEligible: person.overtime_eligible ?? true,
        overtimeCapHours: capBySite.get(person.site_id) ?? DEFAULT_PAY_RULE.otDailyCapHours,
        windowHours: (rostered ? presenceWindowHours(rostered) : null) ?? 12,
      },
    );

    // Never past the person's next scan: that is their next arrival, not a
    // continuation of this one.
    // A later scan on the same work date is a double tap, not an arrival.
    const next = own.find(
      (punch) =>
        Date.parse(punch.punched_at) > Date.parse(openIn.punched_at) &&
        punch.work_date !== openIn.work_date,
    );
    if (next && Date.parse(next.punched_at) <= due.getTime()) {
      due = new Date(Date.parse(next.punched_at) - 60_000);
    }
    if (due.getTime() <= Date.parse(openIn.punched_at) || due.getTime() > now.getTime()) continue;

    if (!dryRun) {
      const { error: insertError } = await supabase.from("punches").insert({
        profile_id: person.id,
        device_id: null,
        device_user_id: openIn.device_user_id,
        punched_at: due.toISOString(),
        work_date: openIn.work_date,
        direction: "out",
        source: "auto",
        raw: { auto: true, reason: "no check-out by end of duty (backfill)", ranAt: now.toISOString() },
      });
      if (insertError) throw new Error(`Auto check-out for ${person.full_name} failed: ${insertError.message}`);
      await recomputeAttendanceDay(person.id, openIn.work_date, person.site_id);
    }

    closed.push({
      profileId: person.id,
      name: person.full_name,
      workDate: openIn.work_date,
      checkedInAt: openIn.punched_at,
      checkedOutAt: due.toISOString(),
    });
  }

  return { considered, closed, heldByOffice };
}
