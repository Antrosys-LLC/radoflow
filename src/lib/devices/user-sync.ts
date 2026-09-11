import { createHash } from "node:crypto";

import { createServiceClient } from "@/lib/supabase/service";
import type { Json } from "@/lib/supabase/database.types";

import type { DeviceRecord } from "./ingest";
import { chunk, planRosterUpload, type KnownProfile } from "./roster-plan";
import { parseOperlog, type CommandResult } from "./zkteco/userinfo";

/**
 * Keeping three terminals holding the same roster.
 *
 * The database does the fanning out — see `app.fan_out_person` in
 * 20260913090000 — because a trigger catches every path by which a person can
 * change, including ones written after it. This module is the part that has to
 * live in application code: reading what a terminal uploaded about its own
 * users, and handing the queued instructions back out when a terminal asks.
 *
 * Two properties matter more than anything else here, and both were learned
 * on the day the terminals went live:
 *
 *   - An upload must finish well inside the relay's thirty seconds. A terminal
 *     reads a timeout as a failure and resends the whole batch.
 *   - Processing the same upload twice must change nothing. It will be resent,
 *     for that reason and others, and a resend that queues everything again is
 *     a loop.
 */

/** How many instructions a terminal is handed in one poll. */
const COMMANDS_PER_POLL = 12;

/** Rows per bulk write. Templates are ~1.5 KB each, so this keeps a request well under a megabyte. */
const WRITE_CHUNK = 100;

/**
 * A terminal reports the outcome of each instruction, and `0` means it worked.
 *
 * Everything else is a firmware-specific failure code. They are recorded
 * rather than interpreted: the codes are not documented consistently across
 * builds, and inventing meanings for them would put confident wrong text on
 * the devices screen.
 */
const RETURN_OK = 0;

/** Must match Postgres `md5(text)`, which the queue compares against. */
const bodyHash = (body: string) => createHash("md5").update(body, "utf8").digest("hex");

export interface RosterUploadResult {
  /** Users matched to a person in RadoFlow. */
  matched: number;
  /** Users enrolled on the hardware that RadoFlow has never heard of. */
  unknown: string[];
  templatesStored: number;
  /** Instructions newly queued for other terminals; repeats of queued ones are not counted. */
  relaysQueued: number;
  deletions: number;
  skipped: number;
}

/**
 * Absorbs an OPERLOG upload — the terminal telling us about its own roster.
 *
 * Everything here keys off `profiles.device_pin`, the one enrolment number a
 * person carries on all three boxes. A PIN that resolves to somebody is stored
 * centrally and fanned out by the database triggers. A PIN that resolves to
 * nobody is relayed to the other terminals as-is and reported:
 *
 *   - Stored, when we know who it is. The template becomes RadoFlow's copy, so
 *     a terminal that dies can be repopulated without re-scanning the factory.
 *     A template identical to the stored one is ignored by the database, which
 *     is what stops an echo from circulating.
 *   - Relayed, when we do not. The queue refuses an instruction the target
 *     already has waiting, acted on in the last hour, or reported itself —
 *     which is what stops a resend or an echo from relaying the same stranger
 *     again.
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
      relaysQueued: 0,
      deletions: 0,
      skipped: parsed.skipped,
    };
  }

  const [profileChunks, { data: targets, error: targetsError }] = await Promise.all([
    // In slices, because the PIN list travels in the URL.
    Promise.all(
      chunk(pins, 300).map((slice) =>
        supabase
          .from("profiles")
          .select("id, device_pin, device_privilege, device_card")
          .in("device_pin", slice),
      ),
    ),
    // Every other push-mode terminal. A pull-mode box never polls, so a row
    // queued for one would sit unread for ever — and switching every terminal
    // to pull is how fan-out is paused.
    supabase.from("devices").select("id").eq("is_active", true).eq("mode", "push"),
  ]);

  if (targetsError) throw new Error(`Could not list terminals: ${targetsError.message}`);

  const profilesByPin = new Map<string, KnownProfile>();
  for (const { data, error } of profileChunks) {
    if (error) throw new Error(`Could not look up enrolment numbers: ${error.message}`);
    for (const row of data ?? []) {
      if (!row.device_pin) continue;
      profilesByPin.set(row.device_pin, {
        id: row.id,
        devicePin: row.device_pin,
        privilege: row.device_privilege,
        card: row.device_card,
      });
    }
  }

  const plan = planRosterUpload(
    parsed,
    device.id,
    profilesByPin,
    (targets ?? []).map((t) => t.id),
  );

  const reportedAt = new Date().toISOString();

  /*
   * The writes are independent of one another, so they go together. Any
   * failure fails the request, which makes the terminal resend — safe now,
   * because nothing below does anything the second time that it did the first.
   *
   * The reported-record markers go in this batch, before any relay is queued,
   * so a record can never be relayed back to this terminal in the gap.
   */
  const results = await Promise.all([
    ...chunk(plan.enrollments, 500).map((rows) =>
      supabase.from("device_enrollments").upsert(rows, { onConflict: "device_id,device_user_id" }),
    ),
    ...chunk(plan.templates, WRITE_CHUNK).map((rows) =>
      supabase
        .from("person_biometrics")
        .upsert(rows, { onConflict: "profile_id,bio_type,finger_index" }),
    ),
    ...chunk(plan.reported, 500).map((rows) =>
      supabase.from("device_reported_records").upsert(
        rows.map((r) => ({
          device_id: r.device_id,
          body_hash: bodyHash(r.body),
          reported_at: reportedAt,
        })),
        { onConflict: "device_id,body_hash" },
      ),
    ),
    ...plan.identityUpdates.map((u) =>
      supabase
        .from("profiles")
        .update({ device_privilege: u.privilege, device_card: u.card })
        .eq("id", u.profileId),
    ),
  ]);

  const failure = results.find((r) => r.error);
  if (failure?.error) throw new Error(`Could not store roster upload: ${failure.error.message}`);

  let relaysQueued = 0;
  for (const rows of chunk(plan.relays, 500)) {
    const { data, error } = await supabase.rpc("queue_device_commands", {
      p_commands: rows as unknown as Json,
    });
    // An enrolment that silently fails to reach the other terminals looks
    // exactly like one that worked.
    if (error) throw new Error(`Could not queue relays for the other terminals: ${error.message}`);
    relaysQueued += data ?? 0;
  }

  /*
   * A deletion performed on the terminal itself.
   *
   * Only the hardware and the stored templates are cleared, never the RadoFlow
   * record. Deleting a profile would take that person's attendance history and
   * their unpaid payroll lines with it, on the strength of a supervisor pressing
   * DELETE on a wall-mounted box with no confirmation step.
   *
   * Last, so an upload that enrols and deletes the same person ends with them
   * deleted, which is the order the supervisor did it in.
   */
  for (const pin of plan.deletions) {
    const { error } = await supabase.rpc("fan_out_removal_from_device", {
      p_pin: pin,
      p_except: device.id,
    });
    if (error) {
      throw new Error(`Could not remove PIN ${pin} from the other terminals: ${error.message}`);
    }
    await supabase
      .from("device_enrollments")
      .delete()
      .eq("device_id", device.id)
      .eq("device_user_id", pin);
  }

  return {
    matched: plan.matchedUsers,
    unknown: plan.unknown,
    templatesStored: plan.templates.length,
    relaysQueued,
    deletions: plan.deletions.length,
    skipped: parsed.skipped,
  };
}

/**
 * Hands a terminal the instructions waiting for it.
 *
 * The claim happens in one statement in the database: rows handed over five
 * minutes ago with no result are offered again, rows handed over three times
 * are abandoned, and two overlapping polls from the same terminal take
 * different rows rather than the same twelve.
 */
export async function claimCommands(deviceId: string): Promise<string[]> {
  const supabase = createServiceClient();

  const { data, error } = await supabase.rpc("claim_device_commands", {
    p_device: deviceId,
    p_limit: COMMANDS_PER_POLL,
  });

  if (error) {
    console.error("[sync] could not claim commands:", error.message);
    return [];
  }

  return (data ?? [])
    .slice()
    .sort((a, b) => a.command_id - b.command_id)
    .map((row) => `C:${row.command_id}:${row.command_body}`);
}

/**
 * Records what the terminal made of each instruction.
 *
 * Scoped to the device that reported, so one terminal cannot close out
 * another's queue by posting an id it happened to guess. The protocol offers
 * no authentication beyond a serial number in a query string, and an
 * instruction marked done that never ran is a worker who cannot get through
 * the gate and a screen insisting he can.
 *
 * The line is kept verbatim either way. A result with no readable code is
 * still a result — the kitchen's first hour of them went unrecognised, and
 * without the text there was no telling why.
 */
export async function recordCommandResults(
  deviceId: string,
  results: readonly CommandResult[],
): Promise<void> {
  const supabase = createServiceClient();

  await Promise.all(
    results
      .filter((result): result is CommandResult & { id: number } => result.id !== null)
      .map((result) => {
        const ok = result.returnCode === RETURN_OK;
        return supabase
          .from("device_commands")
          .update({
            status: ok ? "done" : "failed",
            return_code: result.returnCode,
            result_raw: result.raw,
            completed_at: new Date().toISOString(),
            last_error: ok ? null : `Terminal returned ${result.returnCode ?? "no code"}`,
          })
          .eq("id", result.id)
          .eq("device_id", deviceId);
      }),
  );
}

/** How much of an upload is kept. Enough to see its shape; the data itself lives elsewhere. */
const EXCERPT_BYTES = 16_000;

/**
 * Keeps what a terminal actually sent.
 *
 * Never throws: a diagnostic write failing must not turn a successful upload
 * into a failed one, because the terminal would resend it.
 */
export async function recordDeviceUpload(entry: {
  deviceId: string | null;
  serialNumber: string | null;
  endpoint: "cdata" | "devicecmd";
  table: string | null;
  statusCode: number;
  body: string;
}): Promise<void> {
  try {
    const supabase = createServiceClient();
    const { error } = await supabase.from("device_uploads").insert({
      device_id: entry.deviceId,
      serial_number: entry.serialNumber,
      endpoint: entry.endpoint,
      table_name: entry.table,
      status_code: entry.statusCode,
      line_count: entry.body ? entry.body.split(/\r?\n/).filter(Boolean).length : 0,
      body_excerpt: entry.body.slice(0, EXCERPT_BYTES),
    });
    if (error) console.error("[iclock] could not record upload:", error.message);
  } catch (error) {
    console.error("[iclock] could not record upload:", error);
  }
}
