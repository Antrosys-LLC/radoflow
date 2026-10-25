import { recomputeAttendanceDay } from "@/lib/devices/ingest";
import type { createServiceClient } from "@/lib/supabase/service";

/**
 * A terminal number that passes from one person to the next.
 *
 * The workers list reuses numbers. When a new joiner is given a number somebody
 * else holds, the other person resigned on the joining date: everything the
 * number recorded before that day stays theirs, everything from it is the new
 * joiner's. This is that rule, in two halves because the new profile has to be
 * written between them — the number is unique, so it must be freed first, and
 * the records can only be moved once the new person exists.
 *
 * Fails soft where a table is missing a column on an older database: a move
 * that cannot be made is reported, never half-done in silence.
 */

type Admin = ReturnType<typeof createServiceClient>;

const letters = (value: string) => value.toUpperCase().replace(/[^A-Z]/g, "") || "X";

export interface Holder {
  id: string;
  full_name: string;
  employee_code: string;
  device_pin: string | null;
}

/** Whoever holds a code today, as an employee code or as a terminal number. */
export async function findHolder(admin: Admin, code: string): Promise<Holder | null> {
  const digits = code.replace(/\D/g, "");
  const filter = [`employee_code.eq.${code}`, digits ? `device_pin.eq.${digits}` : null]
    .filter(Boolean)
    .join(",");
  const { data } = await admin
    .from("profiles")
    .select("id, full_name, employee_code, device_pin")
    .or(filter)
    .neq("status", "terminated")
    .limit(1);
  return data?.[0] ?? null;
}

/**
 * Ends the current holder on `date` and frees their number and code.
 *
 * The code becomes `OLD-<NAME>` with no digits: the database derives a terminal
 * number from the digits of a code, so `OLD-54` would hand the number straight
 * back. The terminals are told through the usual triggers (the number is
 * deleted from all of them).
 */
export async function endHolder(admin: Admin, holder: Holder, date: string): Promise<string | null> {
  const number = holder.device_pin ?? holder.employee_code.replace(/\D/g, "");

  let code = `OLD-${letters(holder.full_name)}`;
  for (let tries = 0; tries < 26; tries++) {
    const { data } = await admin.from("profiles").select("id").eq("employee_code", code).maybeSingle();
    if (!data) break;
    code = `OLD-${letters(holder.full_name)}${String.fromCharCode(66 + tries)}`;
  }

  const { error } = await admin
    .from("profiles")
    .update({
      device_pin: null,
      former_device_pin: number || null,
      employee_code: code,
      status: "terminated",
      left_on: date,
    })
    .eq("id", holder.id);

  return error ? error.message : null;
}

/**
 * Moves what the number recorded from `date` on to the new joiner, and
 * rebuilds their days. Returns how many punches moved.
 */
export async function moveRecords(
  admin: Admin,
  args: { number: string; oldId: string; newId: string; date: string; siteId: string | null },
): Promise<number> {
  const { number, oldId, newId, date, siteId } = args;

  const { data: moved } = await admin
    .from("punches")
    .update({ profile_id: newId })
    .eq("device_user_id", number)
    .eq("profile_id", oldId)
    .gte("work_date", date)
    .select("work_date");

  await admin
    .from("attendance_days")
    .delete()
    .eq("profile_id", oldId)
    .gte("work_date", date)
    .eq("is_manual", false)
    .eq("locked", false);

  await admin
    .from("meal_claims")
    .update({ profile_id: newId })
    .eq("device_user_id", number)
    .eq("profile_id", oldId)
    .gte("served_on", date);
  await admin
    .from("meal_scan_log")
    .update({ profile_id: newId })
    .eq("device_user_id", number)
    .eq("profile_id", oldId)
    .gte("scanned_at", `${date}T00:00:00+05:00`);

  // Each terminal maps the number to somebody; it must now say the new person.
  await admin.from("device_enrollments").delete().eq("device_user_id", number);

  if (siteId) {
    for (const day of new Set((moved ?? []).map((row) => row.work_date))) {
      await recomputeAttendanceDay(newId, day, siteId);
    }
  }

  return moved?.length ?? 0;
}
