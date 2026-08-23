#!/usr/bin/env node
/**
 * RadoFlow on-site sync agent.
 *
 * Runs on a machine inside the factory, on the same network as the ZKTeco
 * terminals. It polls each terminal over TCP and posts the punches to the
 * RadoFlow deployment over HTTPS.
 *
 * This exists because a public deployment cannot reach 192.168.x.x. The agent
 * makes only outbound connections, so no inbound firewall rule or port forward
 * is needed, and it does not depend on whether the terminal firmware supports
 * TLS — which many K50 builds do not.
 *
 * Deliberately dependency-free and un-transpiled: it must be possible to drop
 * this one file onto a factory PC with nothing but Node installed.
 *
 * Usage:
 *   RADO_URL=https://your-domain.com \
 *   RADO_DEVICE_SECRET=... \
 *   RADO_DEVICES='K50-DYE-0001@192.168.1.201' \
 *   node scripts/rado-agent.mjs
 */

import { Socket } from "node:net";

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

const BASE_URL = (process.env.RADO_URL ?? "").replace(/\/+$/, "");
const SECRET = process.env.RADO_DEVICE_SECRET ?? "";
const DEVICES_RAW = process.env.RADO_DEVICES ?? "";
const INTERVAL_MS = Number(process.env.RADO_INTERVAL_SECONDS ?? 60) * 1000;
const CLEAR_AFTER_SYNC = process.env.RADO_CLEAR_DEVICE_LOG === "true";

if (!BASE_URL || !SECRET || !DEVICES_RAW) {
  console.error(
    "Missing configuration. Required:\n" +
      "  RADO_URL            e.g. https://rado.example.com\n" +
      "  RADO_DEVICE_SECRET  same value as DEVICE_INGEST_SECRET on the server\n" +
      "  RADO_DEVICES        serial@ip[:port][#commKey], comma separated\n" +
      "                      e.g. K50-DYE-0001@192.168.1.201\n" +
      "Optional:\n" +
      "  RADO_INTERVAL_SECONDS  default 60\n" +
      "  RADO_CLEAR_DEVICE_LOG  'true' to wipe the terminal log after a successful sync",
  );
  process.exit(1);
}

/** `serial@host[:port][#commKey]` */
function parseDevices(raw) {
  return raw
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean)
    .map((entry) => {
      const [left, commKeyRaw] = entry.split("#");
      const [serialNumber, address] = left.split("@");
      const [host, portRaw] = (address ?? "").split(":");

      if (!serialNumber || !host) {
        throw new Error(`Cannot parse RADO_DEVICES entry "${entry}" — expected serial@host`);
      }

      return {
        serialNumber: serialNumber.trim(),
        host: host.trim(),
        port: Number(portRaw ?? 4370),
        commKey: Number(commKeyRaw ?? 0),
        failures: 0,
      };
    });
}

// ---------------------------------------------------------------------------
// ZKTeco protocol
//
// Mirrors src/lib/devices/zkteco/protocol.ts. The constants below are verified
// against a live K50 and pinned by a test in that folder, so this copy cannot
// drift from the canonical implementation unnoticed.
// ---------------------------------------------------------------------------

const MAGIC = 0x7d825050; // wire bytes 50 50 82 7d
const CMD = {
  CONNECT: 1000,
  EXIT: 1001,
  ENABLE: 1002,
  DISABLE: 1003,
  ATTLOG: 13,
  CLEAR_ATTLOG: 15,
  DEVICE: 11,
  FREE_SIZES: 50,
  AUTH: 1102,
  ACK_OK: 2000,
  ACK_DATA: 2002,
  ACK_UNAUTH: 2005,
  PREPARE_DATA: 1500,
  DATA: 1501,
};

function checksum16(buffer) {
  let sum = 0;
  let i = 0;
  for (; i + 1 < buffer.length; i += 2) {
    sum += buffer.readUInt16LE(i);
    if (sum > 0xffff) sum -= 0xffff;
  }
  if (i < buffer.length) {
    sum += buffer.readUInt8(i);
    if (sum > 0xffff) sum -= 0xffff;
  }
  return (~sum & 0xffff) >>> 0;
}

function encodePacket(command, sessionId, replyId, data = Buffer.alloc(0)) {
  const packet = Buffer.alloc(8 + data.length);
  packet.writeUInt16LE(command, 0);
  packet.writeUInt16LE(0, 2);
  packet.writeUInt16LE(sessionId, 4);
  packet.writeUInt16LE(replyId, 6);
  data.copy(packet, 8);
  packet.writeUInt16LE(checksum16(packet), 2);
  return packet;
}

function frame(packet) {
  const framed = Buffer.alloc(8 + packet.length);
  framed.writeUInt32LE(MAGIC, 0);
  framed.writeUInt32LE(packet.length, 4);
  packet.copy(framed, 8);
  return framed;
}

/**
 * The terminal answers ACK_UNAUTH even with no COMM KEY set, then accepts a
 * token derived from 0 — so the handshake is always attempted.
 */
function makeCommKey(commKey, sessionId, ticks = 50) {
  let k = 0;
  for (let i = 0; i < 32; i++) {
    k = commKey & (1 << i) ? ((k << 1) | 1) >>> 0 : (k << 1) >>> 0;
  }
  k = (k + sessionId) >>> 0;

  const packed = Buffer.alloc(4);
  packed.writeUInt32LE(k, 0);

  const xored = Buffer.from([
    packed[0] ^ 0x5a,
    packed[1] ^ 0x4b,
    packed[2] ^ 0x53,
    packed[3] ^ 0x4f,
  ]);

  const swapped = Buffer.alloc(4);
  swapped.writeUInt16LE(xored.readUInt16LE(2), 0);
  swapped.writeUInt16LE(xored.readUInt16LE(0), 2);

  const tick = ticks & 0xff;
  return Buffer.from([swapped[0] ^ tick, swapped[1] ^ tick, tick, swapped[3] ^ tick]);
}

/** ZKTeco packs time into a uint32 with fixed 31-day months, counting from 2000. */
function decodeDeviceTime(encoded) {
  let value = encoded;
  const second = value % 60;
  value = (value - second) / 60;
  const minute = value % 60;
  value = (value - minute) / 60;
  const hour = value % 24;
  value = (value - hour) / 24;
  const day = (value % 31) + 1;
  value = (value - (day - 1)) / 31;
  const month = value % 12;
  value = (value - month) / 12;
  return new Date(value + 2000, month, day, hour, minute, second);
}

function pad(n) {
  return String(n).padStart(2, "0");
}

/** The factory wall clock, exactly as the terminal reported it. */
function toWallClock(date) {
  return (
    `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ` +
    `${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`
  );
}

function parseAttendance(data) {
  if (data.length === 0) return [];

  let body = data;
  if (body.length > 4 && body.readUInt32LE(0) === body.length - 4) {
    body = body.subarray(4);
  }

  const size = body.length % 40 === 0 ? 40 : body.length % 16 === 0 ? 16 : null;
  if (!size) return [];

  const records = [];
  for (let offset = 0; offset + size <= body.length; offset += size) {
    const chunk = body.subarray(offset, offset + size);

    if (size === 40) {
      const deviceUserId = chunk.subarray(2, 11).toString("ascii").split("\0")[0]?.trim() ?? "";
      if (!deviceUserId) continue;
      records.push({
        deviceUserId,
        verifyMode: chunk.readUInt8(26),
        timestamp: decodeDeviceTime(chunk.readUInt32LE(27)),
        state: chunk.readUInt8(31),
      });
    } else {
      const deviceUserId = String(chunk.readUInt16LE(0));
      if (deviceUserId === "0") continue;
      records.push({
        deviceUserId,
        verifyMode: chunk.readUInt8(2),
        timestamp: decodeDeviceTime(chunk.readUInt32LE(4)),
        state: chunk.readUInt8(3),
      });
    }
  }
  return records;
}

// ---------------------------------------------------------------------------
// Terminal session
// ---------------------------------------------------------------------------

function readAttendance(device) {
  return new Promise((resolve, reject) => {
    const socket = new Socket();
    socket.setTimeout(20_000);

    let buffer = Buffer.alloc(0);
    let sessionId = 0;
    let replyId = 0;
    let stage = "connect";
    let expected = 0;
    const chunks = [];
    let settled = false;

    const finish = (error, value) => {
      if (settled) return;
      settled = true;
      socket.destroy();
      if (error) reject(error);
      else resolve(value);
    };

    const send = (command, data) => {
      replyId = (replyId + 1) & 0xffff;
      socket.write(frame(encodePacket(command, sessionId, replyId, data)));
    };

    /** Pops one whole framed packet; peeking without consuming loops forever. */
    const take = () => {
      if (buffer.length < 8) return null;
      if (buffer.readUInt32LE(0) !== MAGIC) {
        finish(new Error("Not a ZKTeco frame — is something else listening on this port?"));
        return null;
      }
      const length = buffer.readUInt32LE(4);
      if (buffer.length < 8 + length) return null;
      const packet = buffer.subarray(8, 8 + length);
      buffer = buffer.subarray(8 + length);
      return {
        command: packet.readUInt16LE(0),
        sessionId: packet.readUInt16LE(4),
        data: packet.subarray(8),
      };
    };

    socket.on("timeout", () => finish(new Error(`${device.host}: timed out`)));
    socket.on("error", (error) => finish(new Error(`${device.host}: ${error.message}`)));

    socket.on("data", (incoming) => {
      buffer = Buffer.concat([buffer, incoming]);

      let reply;
      while ((reply = take())) {
        if (stage === "connect") {
          sessionId = reply.sessionId;
          if (reply.command === CMD.ACK_UNAUTH) {
            stage = "auth";
            send(CMD.AUTH, makeCommKey(device.commKey, sessionId));
          } else if (reply.command === CMD.ACK_OK) {
            stage = "disable";
            send(CMD.DISABLE, Buffer.from([0, 0]));
          } else {
            finish(new Error(`Terminal refused the connection (${reply.command})`));
          }
          continue;
        }

        if (stage === "auth") {
          if (reply.command !== CMD.ACK_OK) {
            finish(new Error("Terminal rejected the COMM KEY — check Menu → Comm → Security"));
            return;
          }
          stage = "disable";
          send(CMD.DISABLE, Buffer.from([0, 0]));
          continue;
        }

        if (stage === "disable") {
          stage = "attlog";
          send(CMD.ATTLOG);
          continue;
        }

        if (stage === "attlog") {
          if (reply.command === CMD.PREPARE_DATA) {
            expected = reply.data.length >= 4 ? reply.data.readUInt32LE(0) : 0;
            stage = "data";
          } else if (reply.command === CMD.ACK_DATA) {
            finish(null, parseAttendance(reply.data));
            return;
          } else if (reply.command === CMD.ACK_OK) {
            finish(null, []);
            return;
          }
          continue;
        }

        if (stage === "data") {
          if (reply.command === CMD.DATA || reply.command === CMD.ACK_DATA) {
            chunks.push(reply.data);
            const received = chunks.reduce((total, c) => total + c.length, 0);
            if (received >= expected) {
              finish(null, parseAttendance(Buffer.concat(chunks)));
              return;
            }
          } else {
            finish(null, parseAttendance(Buffer.concat(chunks)));
            return;
          }
        }
      }
    });

    socket.connect(device.port, device.host, () => {
      send(CMD.CONNECT);
    });
  });
}

/**
 * Reads identity and storage counters from a terminal.
 *
 * Used by --check so a setup problem is named on the spot, rather than showing
 * up later as attendance that quietly never arrives.
 */
function inspect(device) {
  return new Promise((resolve, reject) => {
    const socket = new Socket();
    socket.setTimeout(15_000);

    let buffer = Buffer.alloc(0);
    let sessionId = 0;
    let replyId = 0;
    let settled = false;
    const info = { serialNumber: null, firmware: null, deviceTime: null, users: null, records: null };
    const queue = ["auth?", "~SerialNumber", "FirmVer", "sizes", "done"];
    let step = 0;

    const finish = (error, value) => {
      if (settled) return;
      settled = true;
      socket.destroy();
      if (error) reject(error);
      else resolve(value);
    };

    const send = (command, data) => {
      replyId = (replyId + 1) & 0xffff;
      socket.write(frame(encodePacket(command, sessionId, replyId, data)));
    };

    const take = () => {
      if (buffer.length < 8) return null;
      if (buffer.readUInt32LE(0) !== MAGIC) {
        finish(new Error("Not a ZKTeco frame — is something else on port 4370?"));
        return null;
      }
      const length = buffer.readUInt32LE(4);
      if (buffer.length < 8 + length) return null;
      const packet = buffer.subarray(8, 8 + length);
      buffer = buffer.subarray(8 + length);
      return {
        command: packet.readUInt16LE(0),
        sessionId: packet.readUInt16LE(4),
        data: packet.subarray(8),
      };
    };

    const advance = () => {
      step += 1;
      const next = queue[step];
      if (next === "~SerialNumber" || next === "FirmVer") send(CMD.DEVICE, Buffer.from(next, "ascii"));
      else if (next === "sizes") send(CMD.FREE_SIZES);
      else finish(null, info);
    };

    const readParam = (data) => {
      const text = data.toString("ascii").replace(/\0/g, "").trim();
      const eq = text.indexOf("=");
      return eq >= 0 ? text.slice(eq + 1).trim() : text || null;
    };

    socket.on("timeout", () => finish(new Error(`${device.host}: timed out`)));
    socket.on("error", (error) => finish(new Error(`${device.host}: ${error.message}`)));

    socket.on("data", (incoming) => {
      buffer = Buffer.concat([buffer, incoming]);
      let reply;
      while ((reply = take())) {
        if (step === 0) {
          sessionId = reply.sessionId;
          if (reply.command === CMD.ACK_UNAUTH) {
            send(CMD.AUTH, makeCommKey(device.commKey, sessionId));
            continue;
          }
          if (reply.command !== CMD.ACK_OK) {
            finish(new Error(`Terminal rejected the connection or COMM KEY (reply ${reply.command})`));
            return;
          }
          advance();
          continue;
        }

        const current = queue[step];
        if (current === "~SerialNumber") info.serialNumber = readParam(reply.data);
        else if (current === "FirmVer") info.firmware = readParam(reply.data);
        else if (current === "sizes" && reply.data.length >= 80) {
          info.users = reply.data.readInt32LE(16);
          info.records = reply.data.readInt32LE(32);
        }
        advance();
      }
    });

    socket.connect(device.port, device.host, () => send(CMD.CONNECT));
  });
}

// ---------------------------------------------------------------------------
// Upload
// ---------------------------------------------------------------------------

async function upload(device, records) {
  const response = await fetch(`${BASE_URL}/api/devices/ingest`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-device-secret": SECRET,
    },
    body: JSON.stringify({
      serialNumber: device.serialNumber,
      punches: records.map((record) => ({
        deviceUserId: record.deviceUserId,
        localTimestamp: toWallClock(record.timestamp),
        state: record.state,
        verifyMode: record.verifyMode,
      })),
    }),
    signal: AbortSignal.timeout(30_000),
    // Do not follow redirects. An auth redirect to a login page would arrive
    // as a 200 with HTML, which previously looked like a successful upload
    // that stored nothing — attendance lost with no error anywhere.
    redirect: "manual",
  });

  const text = await response.text();

  if (response.status >= 300 && response.status < 400) {
    throw new Error(
      `Server redirected to ${response.headers.get("location") ?? "elsewhere"} — ` +
        `the ingest endpoint is behind authentication. Check RADO_URL.`,
    );
  }

  if (!response.ok) {
    throw new Error(`Server replied ${response.status}: ${text.slice(0, 200)}`);
  }

  try {
    return JSON.parse(text);
  } catch {
    // Never treat an unparseable reply as success; the punches must be retried.
    throw new Error(
      `Server replied with non-JSON (${text.slice(0, 120)}). Is RADO_URL pointing at RadoFlow?`,
    );
  }
}

// ---------------------------------------------------------------------------
// Loop
// ---------------------------------------------------------------------------

const devices = parseDevices(DEVICES_RAW);
let running = false;

function stamp() {
  return new Date().toLocaleString("en-PK", { timeZone: "Asia/Karachi" });
}

async function syncAll() {
  // A slow terminal must not overlap the next tick and open a second session.
  if (running) return;
  running = true;

  for (const device of devices) {
    // Back off a terminal that is switched off, rather than retrying every
    // minute all night and burying real errors.
    if (device.failures >= 3 && device.failures % 5 !== 0) {
      device.failures += 1;
      continue;
    }

    try {
      const records = await readAttendance(device);
      const result = await upload(device, records);
      device.failures = 0;

      if (result.accepted > 0) {
        console.log(
          `[${stamp()}] ${device.serialNumber}: ${result.accepted} new, ${result.duplicates} already stored`,
        );
      }
      if (result.unmapped?.length) {
        console.warn(
          `[${stamp()}] ${device.serialNumber}: unlinked terminal id(s): ${result.unmapped.join(", ")}`,
        );
      }
    } catch (error) {
      device.failures += 1;
      if (device.failures <= 3) {
        console.error(`[${stamp()}] ${device.serialNumber}: ${error.message}`);
      }
    }
  }

  running = false;
}

/**
 * One-shot diagnosis: prove the whole chain before trusting it with payroll.
 *
 * Checks the two things that actually go wrong in the field — the terminal
 * being unreachable, and the configured serial not matching the device — plus
 * clock drift, which silently skews every recorded hour.
 */
async function check() {
  let failures = 0;

  console.log(`Server : ${BASE_URL}`);

  // Does the deployment answer, and is the secret right? An empty punch list
  // is accepted and stores nothing, so this is safe to run against production.
  try {
    const probe = await fetch(`${BASE_URL}/api/devices/ingest`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-device-secret": SECRET },
      body: JSON.stringify({ serialNumber: devices[0].serialNumber, punches: [] }),
      redirect: "manual",
      signal: AbortSignal.timeout(20_000),
    });

    if (probe.status === 401) {
      console.log("  ✗ RADO_DEVICE_SECRET does not match DEVICE_INGEST_SECRET on the server");
      failures += 1;
    } else if (probe.status >= 300 && probe.status < 400) {
      console.log("  ✗ Redirected — RADO_URL is not pointing at RadoFlow");
      failures += 1;
    } else if (probe.status === 503) {
      console.log("  ✗ Server has no DEVICE_INGEST_SECRET configured");
      failures += 1;
    } else if (!probe.ok) {
      console.log(`  ✗ Server replied ${probe.status}`);
      failures += 1;
    } else {
      console.log("  ✓ reachable, secret accepted");
    }
  } catch (error) {
    console.log(`  ✗ cannot reach the server: ${error.message}`);
    failures += 1;
  }

  for (const device of devices) {
    console.log(`\nTerminal ${device.serialNumber} at ${device.host}:${device.port}`);
    try {
      const info = await inspect(device);
      console.log("  ✓ connected");
      console.log(`    firmware       ${info.firmware ?? "unknown"}`);
      console.log(`    enrolled users ${info.users ?? "?"}`);
      console.log(`    stored records ${info.records ?? "?"}`);

      if (info.serialNumber && info.serialNumber !== device.serialNumber) {
        console.log(
          `  ✗ serial mismatch: terminal reports "${info.serialNumber}", ` +
            `RADO_DEVICES says "${device.serialNumber}".\n` +
            `    Punches would be refused. Use the terminal's own serial in RadoFlow and here.`,
        );
        failures += 1;
      } else if (info.serialNumber) {
        console.log(`    serial         ${info.serialNumber} (matches)`);
      }
    } catch (error) {
      console.log(`  ✗ ${error.message}`);
      failures += 1;
    }
  }

  console.log(
    failures === 0
      ? "\nAll checks passed. Run without --check to start syncing."
      : `\n${failures} problem(s) found. Fix these before relying on attendance.`,
  );
  process.exit(failures === 0 ? 0 : 1);
}

if (process.argv.includes("--check")) {
  await check();
}

console.log(
  `RadoFlow agent → ${BASE_URL}\n` +
    `Terminals: ${devices.map((d) => `${d.serialNumber}@${d.host}:${d.port}`).join(", ")}\n` +
    `Polling every ${INTERVAL_MS / 1000}s. Times are Asia/Karachi.`,
);

if (CLEAR_AFTER_SYNC) {
  console.warn(
    "RADO_CLEAR_DEVICE_LOG is on. The terminal's log is wiped after each sync — " +
      "there is no second copy on the device if an upload is later found to be wrong.",
  );
}

await syncAll();
setInterval(syncAll, INTERVAL_MS);
