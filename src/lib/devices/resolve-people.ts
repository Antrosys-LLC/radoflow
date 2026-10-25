import { createServiceClient } from "@/lib/supabase/service";

/**
 * Turning the number a terminal reports into the person it belongs to.
 *
 * There are two answers to that question and they are not equivalent.
 *
 * `device_enrollments` records what a *particular* box calls somebody. It is
 * written when that terminal tells us about its own roster, so it is the
 * authority for a terminal that was enrolled by hand years ago and calls a man
 * 41 for reasons nobody remembers.
 *
 * `profiles.device_pin` is the number a person carries on every terminal —
 * the one the fan-out enrols them under everywhere.
 *
 * Reading only the first is what made this worth extracting. A worker enrolled
 * at the check-in gate is pushed to the check-out gate and the kitchen by the
 * command queue, but no enrolment row exists for those two until they each
 * upload a roster of their own. Until then his punches arrive, resolve to
 * nobody, and are stored ownerless — while the terminal, having been told
 * `OK`, deletes its copy. That is the same silent loss scripts/fix-terminal-ids.ts
 * was written to repair, arriving by a new route.
 *
 * So: the per-device mapping first, because a box that disagrees is telling us
 * something true about itself, and the canonical number behind it.
 */
export async function resolvePeopleByDeviceUserId(
  deviceId: string,
  deviceUserIds: readonly string[],
): Promise<Map<string, string>> {
  const ids = [...new Set(deviceUserIds)];
  const byDeviceUserId = new Map<string, string>();

  if (ids.length === 0) return byDeviceUserId;

  const supabase = createServiceClient();

  const [{ data: enrolments }, { data: profiles }] = await Promise.all([
    supabase
      .from("device_enrollments")
      .select("device_user_id, profile_id")
      .eq("device_id", deviceId)
      .in("device_user_id", ids),
    supabase.from("profiles").select("id, device_pin").in("device_pin", ids),
  ]);

  // Canonical numbers first, then let this device's own mapping overwrite
  // them — so an override on one box wins there without affecting the rest.
  for (const profile of profiles ?? []) {
    if (profile.device_pin) byDeviceUserId.set(profile.device_pin, profile.id);
  }
  for (const enrolment of enrolments ?? []) {
    byDeviceUserId.set(enrolment.device_user_id, enrolment.profile_id);
  }

  return byDeviceUserId;
}

/**
 * People who held a number until they resigned and a new joiner took it over.
 *
 * A terminal that was offline sends its punches late, after the number already
 * belongs to somebody else, so a punch dated before the handover is credited to
 * the person who held the number that day. Oldest handover first; the holder on
 * a given date is the first whose `leftOn` is after it. Fails soft: on a
 * database without `former_device_pin` nobody has a former number and every
 * punch goes to the current holder, as before.
 */
export async function resolveFormerHolders(
  deviceUserIds: readonly string[],
): Promise<Map<string, { profileId: string; leftOn: string }[]>> {
  const former = new Map<string, { profileId: string; leftOn: string }[]>();
  const ids = [...new Set(deviceUserIds)];
  if (ids.length === 0) return former;

  const supabase = createServiceClient();
  const { data, error } = await supabase
    .from("profiles")
    .select("id, former_device_pin, left_on")
    .in("former_device_pin", ids)
    .not("left_on", "is", null);
  if (error) return former;

  for (const row of data ?? []) {
    if (!row.former_device_pin || !row.left_on) continue;
    former.set(row.former_device_pin, [
      ...(former.get(row.former_device_pin) ?? []),
      { profileId: row.id, leftOn: row.left_on },
    ]);
  }
  for (const list of former.values()) list.sort((a, b) => a.leftOn.localeCompare(b.leftOn));
  return former;
}

/** Who held `deviceUserId` on `workDate`: a former holder, or the current one. */
export function holderOn(
  former: ReadonlyMap<string, { profileId: string; leftOn: string }[]>,
  current: ReadonlyMap<string, string>,
  deviceUserId: string,
  workDate: string,
): string | null {
  const earlier = former.get(deviceUserId)?.find((holder) => workDate < holder.leftOn);
  return earlier?.profileId ?? current.get(deviceUserId) ?? null;
}
