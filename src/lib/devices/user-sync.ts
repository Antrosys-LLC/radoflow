import { createServiceClient } from "@/lib/supabase/service";

import {
  parseOperlog,
  withPin,
  type DeviceBiometricRecord,
  type DeviceUserRecord,
} from "./zkteco/userinfo";
import type { DeviceRecord } from "./ingest";

/**
 * Keeping three terminals holding the same roster.
 *
 * The database does the fanning out — see `app.fan_out_person` in
 * 20260913090000 — because a trigger catches every path by which a person can
 * change, including ones written after it. This module is the part that has to
 * live in application code: reading what a terminal uploaded about its own
 * users, and handing the queued instructions back out when a terminal asks.
 *
 * The direction of travel is worth holding on to. A terminal is a replica, not
 * an original. It is authoritative about exactly one thing — the template it
 * just captured, since it owns the sensor — and about nothing else.
 */

/** How many instructions a terminal is handed in one poll. */
const COMMANDS_PER_POLL = 12;

/**
 * A terminal reports the outcome of each instruction, and `0` means it worked.
 *
 * Everything else is a firmware-specific failure code. They are recorded
 * rather than interpreted: the codes are not documented consistently across
 * builds, and inventing meanings for them would put confident wrong text on
 * the devices screen.
 */
const RETURN_OK = 0;

export interface RosterUploadResult {
  /** Users matched to a person in RadoFlow. */
  matched: number;
  /** Users enrolled on the hardware that RadoFlow has never heard of. */
  unknown: string[];
  templatesStored: number;
  templatesRelayed: number;
  deletions: number;
  skipped: number;
}

/**
 * Absorbs an OPERLOG upload — the terminal telling us about its own roster.
 *
 * Everything here keys off `profiles.device_pin`, the one enrolment number a
 * person carries on all three boxes. A PIN that resolves to somebody is stored
 * centrally and fanned out by the database triggers. A PIN that resolves to
 * nobody is relayed to the other terminals as-is and reported, which is the
 * distinction worth understanding:
 *
 *   - Stored, when we know who it is. The template becomes RadoFlow's copy, so
 *     a terminal that dies can be repopulated without re-scanning the factory.
 *   - Relayed, when we do not. The three boxes still converge — which is what
 *     the gate supervisor needs at six in the morning — but there is nothing
 *     to attach the finger to, so nothing is kept. Once the office creates the
 *     person with that number, the profile trigger pushes a proper record and
 *     the next upload from any terminal stores the template for real.
 */
export async function applyRosterUpload(
  device: DeviceRecord,
  body: string,
): Promise<RosterUploadResult> {
  const supabase = createServiceClient();
  const parsed = parseOperlog(body);

  const pins = [
    ...new Set([
      ...parsed.users.map((u) => u.deviceUserId),
      ...parsed.biometrics.map((b) => b.deviceUserId),
      ...parsed.deletions.map((d) => d.deviceUserId),
    ]),
  ];

  if (pins.length === 0) {
    return {
      matched: 0,
      unknown: [],
      templatesStored: 0,
      templatesRelayed: 0,
      deletions: 0,
      skipped: parsed.skipped,
    };
  }

  const { data: profiles } = await supabase
    .from("profiles")
    .select("id, device_pin")
    .in("device_pin", pins);

  const profileByPin = new Map<string, string>(
    (profiles ?? []).map((row) => [row.device_pin as string, row.id as string]),
  );

  const unknown = new Set<string>();
  let matched = 0;
  let templatesStored = 0;
  let templatesRelayed = 0;
  let deletions = 0;

  /*
   * The enrolment row is what lets a punch from this terminal find its owner.
   *
   * Written even though the PIN is now canonical, because ingestion resolves
   * punches through `device_enrollments` and a person enrolled on a box that
   * has no row there would punch into the void — the upload still succeeds, so
   * the loss is silent. That is the exact failure scripts/fix-terminal-ids.ts
   * was written to clean up after.
   */
  for (const user of parsed.users) {
    const profileId = profileByPin.get(user.deviceUserId);

    if (!profileId) {
      unknown.add(user.deviceUserId);
      await relayUnknownUser(device, user);
      continue;
    }

    matched += 1;
    await supabase.from("device_enrollments").upsert(
      {
        device_id: device.id,
        device_user_id: user.deviceUserId,
        profile_id: profileId,
      },
      { onConflict: "device_id,device_user_id" },
    );
  }

  for (const template of parsed.biometrics) {
    const profileId = profileByPin.get(template.deviceUserId);

    if (!profileId) {
      unknown.add(template.deviceUserId);
      await relayUnknownTemplate(device, template);
      templatesRelayed += 1;
      continue;
    }

    /*
     * Storing this row is what triggers the fan-out; nothing here queues a
     * command directly. `source_device_id` tells the trigger which box already
     * has the template, and leaving it out would queue the terminal its own
     * scan back — which it would apply, re-upload, and trigger again.
     */
    const { error } = await supabase.from("person_biometrics").upsert(
      {
        profile_id: profileId,
        bio_type: template.bioType,
        finger_index: template.fingerIndex,
        dialect: template.dialect,
        payload: template.payload,
        template_size: template.templateSize,
        is_duress: template.isDuress,
        source_device_id: device.id,
      },
      { onConflict: "profile_id,bio_type,finger_index" },
    );

    if (error) {
      console.error(
        `[sync] could not store template for PIN ${template.deviceUserId}:`,
        error.message,
      );
      continue;
    }

    templatesStored += 1;
  }

  /*
   * A deletion performed on the terminal itself.
   *
   * Only the hardware is cleared, never the RadoFlow record. Deleting a
   * profile would take that person's attendance history and their unpaid
   * payroll lines with it, on the strength of a supervisor pressing DELETE on
   * a wall-mounted box with no confirmation step. Removing their access
   * everywhere is the part that has to happen immediately; whether they are
   * still an employee is an office decision, made on a screen that can ask.
   */
  for (const removal of parsed.deletions) {
    const { error } = await supabase.rpc("fan_out_removal_from_device", {
      p_pin: removal.deviceUserId,
      p_except: device.id,
    });

    /*
     * Thrown, not logged and stepped over.
     *
     * A deletion that fails quietly is the worst outcome this file can
     * produce: the supervisor watched the name disappear from the terminal in
     * front of them and has every reason to believe it is gone everywhere.
     * Failing the request makes the terminal keep the batch and retry, and
     * puts the reason in the log.
     */
    if (error) {
      throw new Error(
        `Could not remove PIN ${removal.deviceUserId} from the other terminals: ${error.message}`,
      );
    }

    await supabase
      .from("device_enrollments")
      .delete()
      .eq("device_id", device.id)
      .eq("device_user_id", removal.deviceUserId);
    deletions += 1;
  }

  return {
    matched,
    unknown: [...unknown],
    templatesStored,
    templatesRelayed,
    deletions,
    skipped: parsed.skipped,
  };
}

/**
 * Queues a user RadoFlow does not know onto the other terminals.
 *
 * Bypasses the database fan-out, which is keyed to a profile. The queue itself
 * is not — `device_commands.profile_id` is nullable exactly for this — so the
 * three boxes converge on somebody the office has not entered yet, which is
 * the normal state of affairs for the first hour of a new worker's first day.
 */
async function relayUnknownUser(source: DeviceRecord, user: DeviceUserRecord): Promise<void> {
  const body = [
    `PIN=${user.deviceUserId}`,
    `Name=${user.name.replace(/[\t\r\n]/g, " ").slice(0, 24)}`,
    `Pri=${user.privilege}`,
    "Passwd=",
    `Card=${user.cardNumber ?? ""}`,
    "Grp=1",
    "TZ=0000000000000000",
    "Verify=-1",
  ].join("\t");

  await queueToOtherDevices(source, "user.update", `DATA UPDATE USERINFO ${body}`);
}

async function relayUnknownTemplate(
  source: DeviceRecord,
  template: DeviceBiometricRecord,
): Promise<void> {
  const verb = template.dialect === "fp" ? "DATA UPDATE FINGERTMP" : "DATA UPDATE BIODATA";
  await queueToOtherDevices(
    source,
    "biometric.update",
    `${verb} ${withPin(template.payload, template.deviceUserId)}`,
  );
}

/**
 * Every other push-mode terminal, which is the definition of "all of them" for
 * a mailbox — a pull-mode box never polls, so a row queued for one would sit
 * unread forever.
 */
async function queueToOtherDevices(
  source: DeviceRecord,
  kind: string,
  body: string,
): Promise<void> {
  const supabase = createServiceClient();

  const { data: targets } = await supabase
    .from("devices")
    .select("id")
    .eq("is_active", true)
    .eq("mode", "push")
    .neq("id", source.id);

  const results = await Promise.all(
    (targets ?? []).map((target) =>
      // p_profile is left out rather than passed as null: this is a person
      // the hardware knows and RadoFlow does not, so there is no profile to
      // name and the column's default says so.
      supabase.rpc("queue_device_command", {
        p_device: target.id,
        p_kind: kind,
        p_body: body,
      }),
    ),
  );

  // Same reasoning as a failed deletion: an enrolment that silently fails to
  // reach the other terminals looks exactly like one that worked.
  const failure = results.find((result) => result.error);
  if (failure?.error) {
    throw new Error(`Could not queue ${kind} for the other terminals: ${failure.error.message}`);
  }
}

/**
 * Hands a terminal the instructions waiting for it.
 *
 * Each is stamped `sent` as it goes out, so a terminal that collects a batch
 * and then loses power does not receive it twice on the next poll. The cost of
 * that choice is that such a batch is never retried automatically — it sits at
 * `sent` where the devices screen shows it, and a resync re-queues it. That is
 * the right way round: every instruction here is an upsert or a delete, so a
 * repeat is harmless, but a silent repeat of an unbounded number of them is
 * how a terminal ends up spending its morning applying yesterday's queue
 * instead of reading fingers.
 */
export async function claimCommands(deviceId: string): Promise<string[]> {
  const supabase = createServiceClient();

  const { data: pending, error } = await supabase
    .from("device_commands")
    .select("id, body")
    .eq("device_id", deviceId)
    .eq("status", "pending")
    .order("id", { ascending: true })
    .limit(COMMANDS_PER_POLL);

  if (error) {
    console.error("[sync] could not read command queue:", error.message);
    return [];
  }
  if (!pending || pending.length === 0) return [];

  const ids = pending.map((row) => row.id as number);

  const { data: claimed, error: claimError } = await supabase
    .from("device_commands")
    .update({ status: "sent", sent_at: new Date().toISOString() })
    .in("id", ids)
    /*
     * Re-asserting `pending` is what makes this safe against a terminal that
     * polls again before the previous reply has been written. Two overlapping
     * polls both read the same rows; only the first update matches, and the
     * second is handed nothing rather than a duplicate batch.
     */
    .eq("status", "pending")
    .select("id, body");

  if (claimError) {
    console.error("[sync] could not claim commands:", claimError.message);
    return [];
  }

  return (claimed ?? []).map((row) => `C:${row.id}:${row.body as string}`);
}

/**
 * Records what the terminal made of each instruction.
 *
 * Scoped to the device that reported, so one terminal cannot close out
 * another's queue by posting an id it happened to guess. The protocol offers
 * no authentication beyond a serial number in a query string, and an
 * instruction marked done that never ran is a worker who cannot get through
 * the gate and a screen insisting he can.
 */
export async function recordCommandResults(
  deviceId: string,
  results: readonly { id: number | null; returnCode: number | null }[],
): Promise<void> {
  const supabase = createServiceClient();

  await Promise.all(
    results
      .filter((result): result is { id: number; returnCode: number | null } => result.id !== null)
      .map((result) => {
        const ok = result.returnCode === RETURN_OK;
        return supabase
          .from("device_commands")
          .update({
            status: ok ? "done" : "failed",
            return_code: result.returnCode,
            completed_at: new Date().toISOString(),
            last_error: ok ? null : `Terminal returned ${result.returnCode ?? "no code"}`,
          })
          .eq("id", result.id)
          .eq("device_id", deviceId);
      }),
  );
}
