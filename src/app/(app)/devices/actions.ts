"use server";

import { revalidatePath } from "next/cache";

import { requirePermission } from "@/lib/auth/session";
import { ingestPunches, recordsToPunches } from "@/lib/devices/ingest";
import { withDevice, ZktecoError } from "@/lib/devices/zkteco/client";
import { dictionaryFor, isolate } from "@/lib/i18n";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { PAKISTAN_TIMEZONE } from "@/lib/time";

/**
 * `message` comes back already translated. The permission check hands back the
 * whole session, so the action knows the reader's language without a second
 * load and without the caller telling it — the only way an Urdu screen avoids
 * toasting an English sentence at somebody.
 *
 * Two kinds of message are the exception and are passed through untouched: a
 * Postgres error, and whatever the terminal or the network said. Both are
 * developer-facing, and an invented Urdu wrapper around one would hide what
 * actually failed.
 */
export interface ActionResult {
  ok: boolean;
  message: string;
}

function fieldText(form: FormData, key: string): string {
  return String(form.get(key) ?? "").trim();
}

/**
 * A dictionary sentence with its `{placeholders}` filled in — the plain-string
 * sibling of `<Fill>`, for the toasts these actions return.
 *
 * Substituted with a replacer function rather than a replacement string on
 * purpose: firmware strings and error text come off the hardware, and a `$&`
 * or `$1` in one of them would be read as a replacement pattern by
 * `String.replace` and silently corrupt the message.
 *
 * It does **not** isolate on the caller's behalf. Whether a value needs
 * `isolate()` depends on what the value is — a bare integer is safe as it
 * stands, a serial or a clock time is not — and hiding that decision in here
 * would make it invisible at the two call sites where getting it wrong shows
 * the reader a serial that is not the one stored.
 */
function fill(template: string, values: Record<string, string>): string {
  return template.replace(/\{(\w+)\}/g, (whole, key: string) => values[key] ?? whole);
}

/** Adds a terminal. Writes go through the user's client so RLS still applies. */
export async function saveDevice(_prev: ActionResult, form: FormData): Promise<ActionResult> {
  const session = await requirePermission("devices.manage");
  const t = dictionaryFor(session.profile.language);

  const id = fieldText(form, "id");
  const name = fieldText(form, "name");
  const siteId = fieldText(form, "site_id");
  const serial = fieldText(form, "serial_number");

  if (!name || !siteId || !serial) {
    return { ok: false, message: t.devices.nameFactorySerialRequired };
  }

  const ip = fieldText(form, "ip_address");
  const portValue = Number(fieldText(form, "port") || 4370);
  if (!Number.isInteger(portValue) || portValue < 1 || portValue > 65535) {
    return { ok: false, message: t.devices.portRange };
  }

  const payload = {
    name,
    site_id: siteId,
    serial_number: serial,
    model: fieldText(form, "model") || "ZKTeco K50",
    mode: (fieldText(form, "mode") || "push") as "push" | "pull",
    purpose: (fieldText(form, "purpose") || "attendance") as "attendance" | "canteen",
    ip_address: ip || null,
    port: portValue,
    comm_key: fieldText(form, "comm_key") || null,
    timezone: PAKISTAN_TIMEZONE,
    is_active: form.get("is_active") !== null,
  };

  const supabase = await createClient();
  const query = id
    ? supabase.from("devices").update(payload).eq("id", id)
    : supabase.from("devices").insert(payload);

  const { error } = await query;

  if (error) {
    // 23505 is a unique violation — almost always a duplicated serial number.
    if (error.code === "23505") {
      /*
       * The serial is a Latin run with no strong direction of its own, sitting
       * between two runs of Urdu in a plain string with no JSX to render
       * `<Latin>` through. `isolate()` is the equivalent for that case:
       * without it the bidi algorithm is free to reorder `K50-DYE-0001` on
       * display, and the toast would refuse a serial that is not the one the
       * office just typed.
       */
      return {
        ok: false,
        message: fill(t.devices.duplicateSerial, { serial: isolate(serial) }),
      };
    }
    return { ok: false, message: error.message };
  }

  revalidatePath("/devices");
  return { ok: true, message: id ? t.devices.terminalUpdated : t.devices.terminalAdded };
}

/**
 * Opens a TCP session to the terminal and reads its identity.
 *
 * Only meaningful for devices reachable from this server — a terminal in push
 * mode behind the factory NAT will legitimately fail here while still
 * delivering punches perfectly well.
 */
export async function testConnection(deviceId: string): Promise<ActionResult> {
  const session = await requirePermission("devices.manage");
  const t = dictionaryFor(session.profile.language);

  const admin = createServiceClient();
  const { data: device } = await admin
    .from("devices")
    .select("id, name, mode, ip_address, port, comm_key")
    .eq("id", deviceId)
    .single();

  if (!device) return { ok: false, message: t.devices.notFound };
  if (!device.ip_address) {
    return { ok: false, message: t.devices.setIpBeforeTesting };
  }

  try {
    const info = await withDevice(
      {
        host: String(device.ip_address),
        port: device.port,
        commKey: device.comm_key ? Number(device.comm_key) : 0,
        timeoutMs: 8000,
      },
      (client) => client.getInfo(),
    );

    await admin
      .from("devices")
      .update({ status: "online", last_seen_at: new Date().toISOString(), last_error: null })
      .eq("id", deviceId);

    revalidatePath("/devices");
    /*
     * Two values off the hardware inside one sentence — a firmware string and
     * the terminal's own clock — so both are isolated before they go in. This
     * is the message the wave exists for: unisolated, `Ver 6.60 Jun 25 2020`
     * and `14/08/2026, 07:58` sitting between two runs of Urdu can be
     * reordered on display, and an engineer would read a firmware version and
     * a time the terminal never reported.
     *
     * The two fallbacks are not isolated, and must not be: when the terminal
     * answers without naming its firmware, or with a clock that will not
     * parse, what goes in the slot is a word in the reader's own language.
     * Isolating that would pin an Urdu phrase left-to-right inside a
     * right-to-left sentence.
     */
    return {
      ok: true,
      message: fill(t.devices.connected, {
        firmware: info.firmware ? isolate(info.firmware) : t.devices.firmwareUnknown,
        clock: info.time ? isolate(info.time.toLocaleString()) : t.devices.clockUnreadable,
      }),
    };
  } catch (error) {
    const message = error instanceof ZktecoError ? error.message : String(error);

    /*
     * A push-mode terminal is *expected* to fail this probe: it sits behind the
     * factory NAT with no route in, and delivers punches perfectly well by
     * calling out to us instead. Recording that as "offline" overwrites a
     * status the terminal's own uploads had just proved correct, and leaves a
     * red error on a device that is working. So the result is reported to
     * whoever pressed the button and nothing is written.
     */
    if (device.mode === "push") {
      return { ok: false, message: t.devices.pushCannotBeReached };
    }

    await admin
      .from("devices")
      .update({ status: "offline", last_error: message })
      .eq("id", deviceId);
    revalidatePath("/devices");
    return { ok: false, message };
  }
}

/**
 * Pulls the terminal's stored attendance log and ingests it.
 *
 * The on-device log is deliberately left intact: clearing it is irreversible
 * and the terminal keeps no backup, so it stays a separate explicit action.
 */
export async function syncDevice(deviceId: string): Promise<ActionResult> {
  const session = await requirePermission("devices.manage");
  const t = dictionaryFor(session.profile.language);

  const admin = createServiceClient();
  const { data: device } = await admin
    .from("devices")
    .select("id, serial_number, mode, ip_address, port, comm_key")
    .eq("id", deviceId)
    .single();

  if (!device) return { ok: false, message: t.devices.notFound };
  if (!device.ip_address) {
    return { ok: false, message: t.devices.noIpAddress };
  }
  if (!device.serial_number) {
    return { ok: false, message: t.devices.noSerialRecorded };
  }

  try {
    const records = await withDevice(
      {
        host: String(device.ip_address),
        port: device.port,
        commKey: device.comm_key ? Number(device.comm_key) : 0,
        timeoutMs: 30_000,
      },
      (client) => client.getAttendance(),
    );

    const result = await ingestPunches(device.serial_number, recordsToPunches(records));

    revalidatePath("/devices");
    revalidatePath("/attendance");

    /*
     * Every value in these two sentences is a bare integer — an unambiguous
     * European-number run with nothing neutral in it for the surrounding
     * paragraph to reorder — so none of them is isolated. The serial and the
     * firmware string above are; a count is not.
     */
    const read = fill(t.devices.syncRead, {
      read: String(records.length),
      accepted: String(result.accepted),
      duplicates: String(result.duplicates),
    });

    const unmapped = result.unmapped.length
      ? ` ${fill(t.devices.syncUnmapped, { count: String(result.unmapped.length) })}`
      : "";

    return { ok: true, message: `${read}${unmapped}` };
  } catch (error) {
    const message = error instanceof ZktecoError ? error.message : String(error);

    // Same reasoning as testConnection: a push-mode terminal is unreachable by
    // design, and saying so must not overwrite a status its uploads earned.
    if (device.mode === "push") {
      return { ok: false, message: t.devices.pushCannotBePolled };
    }

    await admin
      .from("devices")
      .update({ status: "offline", last_error: message })
      .eq("id", deviceId);
    revalidatePath("/devices");
    return { ok: false, message };
  }
}
