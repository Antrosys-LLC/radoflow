"use server";

import { revalidatePath } from "next/cache";

import { requirePermission } from "@/lib/auth/session";
import { ingestPunches, recordsToPunches } from "@/lib/devices/ingest";
import { withDevice, ZktecoError } from "@/lib/devices/zkteco/client";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { PAKISTAN_TIMEZONE } from "@/lib/time";

export interface ActionResult {
  ok: boolean;
  message: string;
}

function fieldText(form: FormData, key: string): string {
  return String(form.get(key) ?? "").trim();
}

/** Adds a terminal. Writes go through the user's client so RLS still applies. */
export async function saveDevice(_prev: ActionResult, form: FormData): Promise<ActionResult> {
  await requirePermission("devices.manage");

  const id = fieldText(form, "id");
  const name = fieldText(form, "name");
  const siteId = fieldText(form, "site_id");
  const serial = fieldText(form, "serial_number");

  if (!name || !siteId || !serial) {
    return { ok: false, message: "Name, factory and serial number are required." };
  }

  const ip = fieldText(form, "ip_address");
  const portValue = Number(fieldText(form, "port") || 4370);
  if (!Number.isInteger(portValue) || portValue < 1 || portValue > 65535) {
    return { ok: false, message: "Port must be a whole number between 1 and 65535." };
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
      return { ok: false, message: `A terminal with serial ${serial} already exists.` };
    }
    return { ok: false, message: error.message };
  }

  revalidatePath("/devices");
  return { ok: true, message: id ? "Terminal updated." : "Terminal added." };
}

/**
 * Opens a TCP session to the terminal and reads its identity.
 *
 * Only meaningful for devices reachable from this server — a terminal in push
 * mode behind the factory NAT will legitimately fail here while still
 * delivering punches perfectly well.
 */
export async function testConnection(deviceId: string): Promise<ActionResult> {
  await requirePermission("devices.manage");

  const admin = createServiceClient();
  const { data: device } = await admin
    .from("devices")
    .select("id, name, mode, ip_address, port, comm_key")
    .eq("id", deviceId)
    .single();

  if (!device) return { ok: false, message: "Terminal not found." };
  if (!device.ip_address) {
    return { ok: false, message: "Set the terminal's IP address before testing." };
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
    return {
      ok: true,
      message: `Connected. Firmware ${info.firmware ?? "unknown"}, device clock ${
        info.time?.toLocaleString() ?? "unreadable"
      }.`,
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
      return {
        ok: false,
        message:
          "This terminal is in push mode, so it cannot be reached from here — " +
          "that is expected and does not mean it is down. Its status comes from " +
          "the punches it uploads.",
      };
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
  await requirePermission("devices.manage");

  const admin = createServiceClient();
  const { data: device } = await admin
    .from("devices")
    .select("id, serial_number, mode, ip_address, port, comm_key")
    .eq("id", deviceId)
    .single();

  if (!device) return { ok: false, message: "Terminal not found." };
  if (!device.ip_address) {
    return {
      ok: false,
      message: "This terminal has no IP address. Devices in push mode upload on their own.",
    };
  }
  if (!device.serial_number) {
    return { ok: false, message: "This terminal has no serial number recorded." };
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

    const unmapped = result.unmapped.length
      ? ` ${result.unmapped.length} enrolment id(s) are not linked to an employee yet.`
      : "";

    return {
      ok: true,
      message:
        `Read ${records.length} record(s): ${result.accepted} new, ` +
        `${result.duplicates} already stored.${unmapped}`,
    };
  } catch (error) {
    const message = error instanceof ZktecoError ? error.message : String(error);

    // Same reasoning as testConnection: a push-mode terminal is unreachable by
    // design, and saying so must not overwrite a status its uploads earned.
    if (device.mode === "push") {
      return {
        ok: false,
        message:
          "This terminal is in push mode and cannot be polled from here. " +
          "It uploads on its own — nothing needs to be pulled.",
      };
    }

    await admin
      .from("devices")
      .update({ status: "offline", last_error: message })
      .eq("id", deviceId);
    revalidatePath("/devices");
    return { ok: false, message };
  }
}

/** Links a terminal enrolment number to an employee. */
export async function linkEnrollment(_prev: ActionResult, form: FormData): Promise<ActionResult> {
  await requirePermission("devices.manage");

  const deviceId = fieldText(form, "device_id");
  const deviceUserId = fieldText(form, "device_user_id");
  const profileId = fieldText(form, "profile_id");

  if (!deviceId || !deviceUserId || !profileId) {
    return { ok: false, message: "Choose an employee and enter their terminal ID." };
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from("device_enrollments")
    .upsert(
      { device_id: deviceId, device_user_id: deviceUserId, profile_id: profileId },
      { onConflict: "device_id,device_user_id" },
    );

  if (error) return { ok: false, message: error.message };

  // Punches already stored under this enrolment id have no owner; attribute
  // them now so the mapping is retroactive rather than only forward-looking.
  const admin = createServiceClient();
  await admin
    .from("punches")
    .update({ profile_id: profileId })
    .eq("device_id", deviceId)
    .eq("device_user_id", deviceUserId)
    .is("profile_id", null);

  revalidatePath(`/devices/${deviceId}`);
  return { ok: true, message: "Employee linked. Existing punches were attributed." };
}

export async function unlinkEnrollment(
  deviceId: string,
  enrollmentId: string,
): Promise<ActionResult> {
  await requirePermission("devices.manage");

  const supabase = await createClient();
  const { error } = await supabase.from("device_enrollments").delete().eq("id", enrollmentId);

  if (error) return { ok: false, message: error.message };

  revalidatePath(`/devices/${deviceId}`);
  return { ok: true, message: "Employee unlinked." };
}
