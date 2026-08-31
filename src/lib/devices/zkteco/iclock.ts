/**
 * ADMS / "iclock" push protocol.
 *
 * In push mode the terminal is given a server address in its Comm menu and
 * posts records to us over plain HTTP. This suits the wireless K50 on a
 * factory LAN: nothing has to route *into* the device, so it keeps working
 * behind NAT and through Wi-Fi address changes.
 *
 * Payloads are tab-separated text, one record per line, and the device expects
 * a bare `OK` (or `OK: <count>`) back or it will retry the whole batch.
 */

import { directionFromState } from "./protocol";

export interface IclockPunch {
  deviceUserId: string;
  /** Wall-clock time as reported by the terminal; it carries no timezone. */
  localTimestamp: string;
  state: number;
  verifyMode: number;
  workCode: string | null;
  direction: "in" | "out" | "unknown";
}

/**
 * Parses an ATTLOG body.
 *
 * Malformed lines are skipped rather than failing the batch: one corrupt
 * record must not block the hundreds of valid punches sent alongside it.
 */
export function parseAttlog(body: string): { punches: IclockPunch[]; skipped: number } {
  const punches: IclockPunch[] = [];
  let skipped = 0;

  for (const rawLine of body.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line) continue;

    const fields = line.split("\t");
    const deviceUserId = fields[0]?.trim();
    const timestamp = fields[1]?.trim();

    if (!deviceUserId || !timestamp || !isDeviceTimestamp(timestamp)) {
      skipped += 1;
      continue;
    }

    const state = toInt(fields[2]);
    const workCode = fields[4]?.trim();

    punches.push({
      deviceUserId,
      localTimestamp: timestamp,
      state,
      verifyMode: toInt(fields[3]),
      workCode: workCode && workCode !== "0" ? workCode : null,
      direction: directionFromState(state),
    });
  }

  return { punches, skipped };
}

/** `YYYY-MM-DD HH:MM:SS`, the only shape ZKTeco terminals emit. */
const DEVICE_TIMESTAMP = /^\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}:\d{2}$/;

export function isDeviceTimestamp(value: string): boolean {
  return DEVICE_TIMESTAMP.test(value);
}

function toInt(value: string | undefined): number {
  const parsed = Number.parseInt((value ?? "").trim(), 10);
  return Number.isFinite(parsed) ? parsed : 0;
}

/**
 * Configuration returned to the terminal during its handshake.
 *
 * `Stamp` values are the device's cursor: it re-sends anything newer, so they
 * are echoed back rather than invented. TransTimes/TransInterval control how
 * eagerly it uploads.
 */
export interface IclockHandshakeOptions {
  serialNumber: string;
  /** Seconds between upload attempts. */
  transInterval?: number;
  /** Seconds between command polls. */
  delay?: number;
  timezone?: string;
}

export function buildHandshakeResponse(options: IclockHandshakeOptions): string {
  const { serialNumber, transInterval = 1, delay = 10 } = options;

  return [
    `GET OPTION FROM: ${serialNumber}`,
    "ATTLOGStamp=None",
    "OPERLOGStamp=None",
    "ATTPHOTOStamp=None",
    "ErrorDelay=30",
    `Delay=${delay}`,
    "TransTimes=00:00;14:00",
    "TransInterval=" + String(transInterval),
    "TransFlag=1111000000",
    "TimeZone=5",
    "Realtime=1",
    "Encrypt=0",
  ].join("\n");
}

/** The terminal treats anything other than this as a failed upload. */
export function ackResponse(count: number): string {
  return `OK: ${count}`;
}

/**
 * Commands are queued for the terminal to collect on its next `getrequest`
 * poll. Each must carry a unique id so the device can report the result.
 */
export function buildDeviceCommand(id: number, command: string): string {
  return `C:${id}:${command}`;
}

/** Enrols or updates a user on the terminal. */
export function setUserCommand(
  id: number,
  user: {
    deviceUserId: string;
    name: string;
    privilege?: number;
    password?: string;
    cardNumber?: string;
  },
): string {
  const parts = [
    `PIN=${user.deviceUserId}`,
    `Name=${user.name}`,
    `Pri=${user.privilege ?? 0}`,
    `Passwd=${user.password ?? ""}`,
    `Card=${user.cardNumber ?? ""}`,
    "Grp=1",
    "TZ=0000000000000000",
  ];
  return buildDeviceCommand(id, `DATA UPDATE USERINFO ${parts.join("\t")}`);
}

export function deleteUserCommand(id: number, deviceUserId: string): string {
  return buildDeviceCommand(id, `DATA DELETE USERINFO PIN=${deviceUserId}`);
}

export function rebootCommand(id: number): string {
  return buildDeviceCommand(id, "REBOOT");
}
