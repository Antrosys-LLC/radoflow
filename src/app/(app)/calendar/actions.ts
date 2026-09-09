"use server";

import { revalidatePath } from "next/cache";

import { submitChangeRequest } from "@/lib/approvals/actions";
import { needsApproval } from "@/lib/approvals/changes";
import { requirePermission } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";

/**
 * Changing which days the factory works.
 *
 * Two decisions live here and they are deliberately separate. The weekly
 * pattern is the standing rule — "Sunday is off" — and changing it changes
 * every future Sunday. A calendar day is one dated exception: this Sunday we
 * are running, that Tuesday we are not. Collapsing the two into one control
 * would mean a manager opening a single Sunday quietly reprices every Sunday
 * of the year, which is exactly the mistake this shape prevents.
 *
 * Both write through RLS, which tests `calendar.manage` against the row's own
 * site. The permission check here is the earlier, friendlier gate; the policy
 * is the one that actually holds.
 */

export interface CalendarResult {
  ok: boolean;
  message: string;
}

/** The five day types a calendar row may carry, as the enum spells them. */
const DAY_TYPES = ["workday", "off", "holiday", "weekend_working", "special_working"] as const;
type DayType = (typeof DAY_TYPES)[number];

function readDayType(value: FormDataEntryValue | null): DayType | null {
  const text = String(value ?? "").trim();
  return (DAY_TYPES as readonly string[]).includes(text) ? (text as DayType) : null;
}

/** `YYYY-MM-DD`, and a real date rather than 2026-02-31. */
function readDate(value: FormDataEntryValue | null): string | null {
  const text = String(value ?? "").trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) return null;
  const parsed = new Date(`${text}T00:00:00Z`);
  return Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== text ? null : text;
}

/**
 * Weekday and day-type names for the request summaries.
 *
 * English and at module scope on purpose: a summary is written once, stored,
 * and read later by somebody whose language is not known when it is written.
 * Translating it at write time would freeze the requester's language onto the
 * approver's screen.
 */
const WEEKDAY_NAMES = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
] as const;

const DAY_TYPE_NAMES: Record<DayType, string> = {
  workday: "Working day",
  off: "Day off",
  holiday: "Holiday",
  weekend_working: "Working weekend",
  special_working: "Extra working day",
};

function refresh() {
  // Attendance, the live board and payroll all read the calendar, so the
  // stale page is never only this one.
  revalidatePath("/calendar");
  revalidatePath("/attendance");
  revalidatePath("/", "layout");
}

/**
 * Switches one weekday of the standing pattern on or off, for one factory.
 *
 * Upserted rather than updated: a site set up before the pattern was seeded
 * has no row for the weekday at all, and an update would report success
 * having changed nothing.
 */
export async function setWeekdayWorking(
  _prev: CalendarResult,
  form: FormData,
): Promise<CalendarResult> {
  const session = await requirePermission("calendar.manage");

  const siteId = String(form.get("site_id") ?? "").trim();
  const weekday = Number(String(form.get("weekday") ?? ""));
  const isWorking = String(form.get("is_working") ?? "") === "true";
  const approverId = String(form.get("approver_id") ?? "").trim() || null;

  if (!siteId) return { ok: false, message: "Choose a factory." };
  if (!Number.isInteger(weekday) || weekday < 0 || weekday > 6) {
    return { ok: false, message: "That is not a day of the week." };
  }

  /*
   * Changing the standing pattern changes every future week, which is the
   * largest thing anybody can do from this screen — so it is asked for rather
   * than done, unless Antrosys is the one doing it.
   */
  if (needsApproval(session)) {
    const day = WEEKDAY_NAMES[weekday] ?? String(weekday);
    return submitChangeRequest({
      kind: "work_week",
      entityTable: "work_week",
      entityId: null,
      payload: { site_id: siteId, weekday, is_working: isWorking },
      siteId,
      title: isWorking ? `Open every ${day}` : `Close every ${day}`,
      summary: isWorking
        ? `${day} becomes a working day, from now on.`
        : `${day} becomes a day off, from now on.`,
      assignedTo: approverId,
    });
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from("work_week")
    .upsert({ site_id: siteId, weekday, is_working: isWorking }, { onConflict: "site_id,weekday" });

  if (error) return { ok: false, message: error.message };

  refresh();
  return { ok: true, message: "Saved." };
}

/**
 * Records — or rewrites — one dated exception.
 *
 * Upserted on (site, day) because the office thinks of it as "what is
 * happening on the 14th", not as a list of rows: choosing a second time for
 * the same date must replace the first answer rather than fail on the unique
 * index.
 */
export async function saveCalendarDay(
  _prev: CalendarResult,
  form: FormData,
): Promise<CalendarResult> {
  const session = await requirePermission("calendar.manage");

  const siteId = String(form.get("site_id") ?? "").trim();
  const day = readDate(form.get("day"));
  const dayType = readDayType(form.get("day_type"));
  const reason = String(form.get("reason") ?? "").trim();
  const approverId = String(form.get("approver_id") ?? "").trim() || null;

  if (!siteId) return { ok: false, message: "Choose a factory." };
  if (!day) return { ok: false, message: "Choose a date." };
  if (!dayType) return { ok: false, message: "Choose what kind of day it is." };

  /*
   * No pay multiplier is asked for, and none is stored.
   *
   * It was a number the office had to know to type, and nothing ever read it:
   * the payroll engine prices a day from its *type*, not from a multiplier —
   * `weekend_working` and work on an `off` day go to the weekend rate,
   * `holiday` to the holiday rate, both taken from the site's own pay rules.
   * So a Sunday switched on already pays at the weekend rate on its own, and a
   * multiplier typed here changed nothing while looking as though it had.
   */

  if (needsApproval(session)) {
    return submitChangeRequest({
      kind: "calendar_day",
      entityTable: "calendar_days",
      entityId: null,
      payload: {
        site_id: siteId,
        day,
        day_type: dayType,
        reason: reason || null,
        created_by: session.userId,
      },
      siteId,
      title: `${DAY_TYPE_NAMES[dayType]} on ${day}`,
      summary: reason ? `${day} — ${reason}` : day,
      assignedTo: approverId,
    });
  }

  const supabase = await createClient();
  const { error } = await supabase.from("calendar_days").upsert(
    {
      site_id: siteId,
      day,
      day_type: dayType,
      reason: reason || null,
      created_by: session.userId,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "site_id,day" },
  );

  if (error) return { ok: false, message: error.message };

  refresh();
  return { ok: true, message: "Saved." };
}

/** Drops an exception, so the date falls back to the weekly pattern. */
export async function deleteCalendarDay(
  _prev: CalendarResult,
  form: FormData,
): Promise<CalendarResult> {
  const session = await requirePermission("calendar.manage");

  const id = String(form.get("id") ?? "").trim();
  if (!id) return { ok: false, message: "Nothing to remove." };

  /*
   * Removing an exception puts the date back on the weekly rule, which can
   * turn a day the factory worked into a day it was closed — the same size of
   * change as making one, so it waits the same way.
   *
   * There is no "delete" payload, so this is expressed as what it means: the
   * day goes back to being an ordinary working day. An approver reading it
   * sees the effect rather than the mechanism.
   */
  if (needsApproval(session)) {
    const supabase = await createClient();
    const { data: existing } = await supabase
      .from("calendar_days")
      .select("day, site_id, day_type")
      .eq("id", id)
      .maybeSingle();

    if (!existing) return { ok: false, message: "That day is no longer there." };

    return submitChangeRequest({
      kind: "calendar_day",
      entityTable: "calendar_days",
      entityId: id,
      payload: { day_type: "workday", reason: null },
      siteId: existing.site_id,
      title: `Undo the change on ${existing.day}`,
      summary: `${existing.day} goes back to an ordinary working day.`,
      assignedTo: String(form.get("approver_id") ?? "").trim() || null,
    });
  }

  const supabase = await createClient();
  const { error } = await supabase.from("calendar_days").delete().eq("id", id);

  if (error) return { ok: false, message: error.message };

  refresh();
  return { ok: true, message: "Removed." };
}
