"use server";

import { revalidatePath } from "next/cache";

import { submitChangeRequest } from "@/lib/approvals/actions";
import { describeFieldChanges, needsApproval } from "@/lib/approvals/changes";
import { requirePermission } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";

/**
 * Putting one day's attendance right.
 *
 * A terminal misses a punch and the day reads as absent; somebody clocks out
 * on the wrong machine and their hours are half what they worked. Until now
 * the only remedy was a payroll adjustment after the fact, which fixes the
 * money and leaves the record saying something untrue.
 *
 * Three things are corrected, and no more: when they came in, when they left,
 * and what the day counts as. Hours follow from the first two rather than
 * being typed, because a day whose hours disagree with its own in and out
 * times is a day nobody can check.
 *
 * `locked` is set with the correction. That is what stops the next terminal
 * sync recomputing the day and quietly undoing it thirty seconds later — the
 * same mechanism the range approval uses, and the reason a correction is worth
 * making at all.
 */

export interface CorrectionResult {
  ok: boolean;
  message: string;
}

/** "HH:MM" on a given date, as an instant. Null for an empty field. */
function instantFor(workDate: string, time: string): string | null {
  const trimmed = time.trim();
  if (!trimmed) return null;
  if (!/^\d{1,2}:\d{2}$/.test(trimmed)) return null;

  /*
   * Anchored to Pakistan, like every other clock reading in this app. The
   * offset is fixed (+05:00, no daylight saving), so it is written into the
   * string rather than computed — a correction typed as 09:00 has to mean nine
   * on the factory floor whatever the server thinks the time is.
   */
  const [hour = "0", minute = "0"] = trimmed.split(":");
  const padded = `${hour.padStart(2, "0")}:${minute}`;
  const parsed = new Date(`${workDate}T${padded}:00+05:00`);
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
}

/** Whole hours between two instants, to two decimals. Zero if either is absent. */
function hoursBetween(from: string | null, to: string | null): number {
  if (!from || !to) return 0;
  const span = Date.parse(to) - Date.parse(from);
  if (!Number.isFinite(span) || span <= 0) return 0;
  return Math.round((span / 3_600_000) * 100) / 100;
}

/**
 * The seven `attendance_status` members, as a value the type system knows.
 *
 * A `Set<string>` would narrow nothing: the status arrives off a form field as
 * a plain string, and the column takes only these seven.
 */
const STATUSES = ["present", "absent", "leave", "holiday", "off", "partial", "pending"] as const;

type DayStatus = (typeof STATUSES)[number];

function readStatus(value: unknown): DayStatus | null {
  const text = String(value ?? "").trim();
  return (STATUSES as readonly string[]).includes(text) ? (text as DayStatus) : null;
}

export async function correctAttendanceDay(
  _prev: CorrectionResult,
  form: FormData,
): Promise<CorrectionResult> {
  const session = await requirePermission("attendance.edit");

  const dayId = String(form.get("day_id") ?? "").trim();
  const status = readStatus(form.get("status"));
  const firstIn = String(form.get("first_in") ?? "");
  const lastOut = String(form.get("last_out") ?? "");
  const reason = String(form.get("reason") ?? "").trim();

  if (!dayId) return { ok: false, message: "No day selected." };
  if (!status) return { ok: false, message: "Choose what the day counts as." };
  if (!reason) {
    // A correction with no reason is indistinguishable from a mistake, and the
    // reason is the whole of what an approver has to go on.
    return { ok: false, message: "Say why the day is being corrected." };
  }

  const supabase = await createClient();

  const { data: before } = await supabase
    .from("attendance_days")
    .select("id, profile_id, work_date, first_in, last_out, regular_hours, status, site_id")
    .eq("id", dayId)
    .maybeSingle();

  if (!before) return { ok: false, message: "That day is no longer there." };

  const newIn = instantFor(before.work_date, firstIn);
  const newOut = instantFor(before.work_date, lastOut);

  if (firstIn.trim() && !newIn) return { ok: false, message: "Check-in time should be HH:MM." };
  if (lastOut.trim() && !newOut) return { ok: false, message: "Check-out time should be HH:MM." };
  if (newIn && newOut && Date.parse(newOut) <= Date.parse(newIn)) {
    return { ok: false, message: "Check-out has to be after check-in." };
  }

  const payload = {
    first_in: newIn,
    last_out: newOut,
    regular_hours: hoursBetween(newIn, newOut),
    status,
    is_manual: true,
    // Without this the next sync recomputes the day from the punches and the
    // correction disappears — which is exactly the problem being corrected.
    locked: true,
  };

  const { data: person } = await supabase
    .from("employee_directory")
    .select("full_name")
    .eq("id", before.profile_id)
    .maybeSingle();

  const summary = describeFieldChanges(
    {
      status: before.status,
      regular_hours: Number(before.regular_hours ?? 0),
    },
    { status: payload.status, regular_hours: payload.regular_hours },
    { status: "Day", regular_hours: "Hours" },
  );

  if (needsApproval(session)) {
    return submitChangeRequest({
      kind: "attendance_correction",
      entityTable: "attendance_days",
      entityId: dayId,
      payload,
      siteId: before.site_id,
      title: `${person?.full_name ?? "Attendance"} — ${before.work_date}`,
      summary: summary ? `${summary} · ${reason}` : reason,
      assignedTo: String(form.get("approver_id") ?? "").trim() || null,
    });
  }

  const { data, error } = await supabase
    .from("attendance_days")
    .update(payload)
    .eq("id", dayId)
    .select("id");

  if (error) return { ok: false, message: error.message };
  if (!data || data.length === 0) {
    // An update refused by a policy matches no rows and raises nothing; without
    // this the manager is told a day was corrected that was not.
    return { ok: false, message: "Nothing changed — that day is not yours to correct." };
  }

  revalidatePath("/attendance/logs");
  revalidatePath("/attendance");

  return { ok: true, message: "Corrected." };
}
