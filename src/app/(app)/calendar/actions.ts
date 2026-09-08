"use server";

import { revalidatePath } from "next/cache";

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
  await requirePermission("calendar.manage");

  const siteId = String(form.get("site_id") ?? "").trim();
  const weekday = Number(String(form.get("weekday") ?? ""));
  const isWorking = String(form.get("is_working") ?? "") === "true";

  if (!siteId) return { ok: false, message: "Choose a factory." };
  if (!Number.isInteger(weekday) || weekday < 0 || weekday > 6) {
    return { ok: false, message: "That is not a day of the week." };
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

  if (!siteId) return { ok: false, message: "Choose a factory." };
  if (!day) return { ok: false, message: "Choose a date." };
  if (!dayType) return { ok: false, message: "Choose what kind of day it is." };

  /*
   * Blank means "use the site's rule", which is not the same as zero — zero is
   * a real answer meaning the day is unpaid. So an empty field has to reach
   * the column as null rather than being coerced through Number().
   */
  const multiplierRaw = String(form.get("rate_multiplier") ?? "").trim();
  let multiplier: number | null = null;
  if (multiplierRaw !== "") {
    const parsed = Number(multiplierRaw);
    if (!Number.isFinite(parsed) || parsed < 0) {
      return { ok: false, message: "The pay multiplier must be zero or more." };
    }
    multiplier = parsed;
  }

  const supabase = await createClient();
  const { error } = await supabase.from("calendar_days").upsert(
    {
      site_id: siteId,
      day,
      day_type: dayType,
      reason: reason || null,
      rate_multiplier: multiplier,
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
  await requirePermission("calendar.manage");

  const id = String(form.get("id") ?? "").trim();
  if (!id) return { ok: false, message: "Nothing to remove." };

  const supabase = await createClient();
  const { error } = await supabase.from("calendar_days").delete().eq("id", id);

  if (error) return { ok: false, message: error.message };

  refresh();
  return { ok: true, message: "Removed." };
}
