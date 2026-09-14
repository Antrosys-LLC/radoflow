"use server";

import { revalidatePath } from "next/cache";

import { submitChangeRequest } from "@/lib/approvals/actions";
import { needsApproval } from "@/lib/approvals/changes";
import { requirePermission } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";

import type { CalendarResult } from "./actions";

/**
 * Working days for one department, or one person.
 *
 * The same shape as a factory-wide day, one level more specific: a Sunday
 * dyeing works and folding does not, or one man's day off in exchange for the
 * Sunday he came in. The most specific answer wins — see
 * `effective_day_type()` in the migration.
 */

const DAY_TYPES = ["workday", "off", "holiday", "weekend_working", "special_working"] as const;
type DayType = (typeof DAY_TYPES)[number];

const DAY_TYPE_NAMES: Record<DayType, string> = {
  workday: "Working day",
  off: "Day off",
  holiday: "Holiday",
  weekend_working: "Working weekend",
  special_working: "Extra working day",
};

function text(form: FormData, key: string): string {
  return String(form.get(key) ?? "").trim();
}

function readDate(value: string): string | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const parsed = new Date(`${value}T00:00:00Z`);
  return Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== value
    ? null
    : value;
}

function refresh() {
  revalidatePath("/calendar");
  revalidatePath("/attendance");
  revalidatePath("/", "layout");
}

export async function saveCalendarOverride(
  _prev: CalendarResult,
  form: FormData,
): Promise<CalendarResult> {
  const session = await requirePermission("calendar.manage");

  const siteId = text(form, "site_id");
  const scope = text(form, "scope") === "person" ? "person" : "department";
  const departmentId = scope === "department" ? text(form, "department_id") : "";
  const profileId = scope === "person" ? text(form, "profile_id") : "";
  const day = readDate(text(form, "day"));
  const dayType = text(form, "day_type") as DayType;
  const reason = text(form, "reason");

  if (!siteId) return { ok: false, message: "Choose a factory." };
  if (scope === "department" && !departmentId)
    return { ok: false, message: "Choose a department." };
  if (scope === "person" && !profileId) return { ok: false, message: "Choose a person." };
  if (!day) return { ok: false, message: "Choose a date." };
  if (!DAY_TYPES.includes(dayType)) return { ok: false, message: "Choose what kind of day it is." };

  const payload = {
    site_id: siteId,
    scope,
    department_id: departmentId || null,
    profile_id: profileId || null,
    day,
    day_type: dayType,
    reason: reason || null,
    created_by: session.userId,
  };

  if (needsApproval(session)) {
    const who = text(form, "scope_name") || (scope === "person" ? "one person" : "one department");
    return submitChangeRequest({
      kind: "calendar_override" as never,
      entityTable: "calendar_day_overrides",
      entityId: null,
      payload,
      siteId,
      title: `${DAY_TYPE_NAMES[dayType]} on ${day} for ${who}`,
      summary: reason ? `${day} — ${reason}` : day,
      assignedTo: text(form, "approver_id") || null,
    });
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from("calendar_day_overrides")
    .upsert(payload, { onConflict: "scope,scope_id,day" });

  if (error) return { ok: false, message: error.message };

  await supabase.rpc("refresh_day_types", { p_site: siteId, p_day: day });
  refresh();
  return { ok: true, message: "Saved." };
}

export async function deleteCalendarOverride(
  _prev: CalendarResult,
  form: FormData,
): Promise<CalendarResult> {
  const session = await requirePermission("calendar.manage");
  const id = text(form, "id");
  if (!id) return { ok: false, message: "Nothing to remove." };

  const supabase = await createClient();
  const { data: existing } = await supabase
    .from("calendar_day_overrides")
    .select("id, site_id, day")
    .eq("id", id)
    .maybeSingle();
  if (!existing) return { ok: false, message: "That day is no longer there." };

  /*
   * Removing one puts the department or person back on the factory's answer.
   * Asked for, like every other calendar change below C-Level — expressed as
   * the effect, an ordinary working day, because a request has no "delete".
   */
  if (needsApproval(session)) {
    return submitChangeRequest({
      kind: "calendar_override" as never,
      entityTable: "calendar_day_overrides",
      entityId: id,
      payload: { day_type: "workday", reason: null },
      siteId: existing.site_id,
      title: `Undo the department or person day on ${existing.day}`,
      summary: `${existing.day} goes back to an ordinary working day for them.`,
      assignedTo: text(form, "approver_id") || null,
    });
  }

  const { error } = await supabase.from("calendar_day_overrides").delete().eq("id", id);
  if (error) return { ok: false, message: error.message };

  await supabase.rpc("refresh_day_types", { p_site: existing.site_id, p_day: existing.day });
  refresh();
  return { ok: true, message: "Removed." };
}
