/**
 * ZKTeco terminal wire protocol (K50 and the wider ZEM/ZMM family).
 *
 * Two transports exist and this file backs both:
 *  - "pull": we open TCP/4370 to the terminal and issue commands. Packets are
 *    the UDP-era structure wrapped in a 8-byte TCP framing header.
 *  - "push": the terminal posts plain text to our HTTP endpoint (the ADMS or
 *    "iclock" protocol). See ./iclock.ts.
 *
 * The encodings here are fixed by the device firmware, so the constants and
 * bit-twiddling below are transcriptions of that format rather than choices.
 */

/** Commands used by this integration. */
export const CMD = {
  CONNECT: 1000,
  EXIT: 1001,
  ENABLE_DEVICE: 1002,
  DISABLE_DEVICE: 1003,
  GET_FREE_SIZES: 50,
  ATTLOG_RRQ: 13,
  CLEAR_ATTLOG: 15,
  USERTEMP_RRQ: 9,
  GET_TIME: 201,
  SET_TIME: 202,
  DEVICE: 11,
  AUTH: 1102,
  PREPARE_DATA: 1500,
  DATA: 1501,
  FREE_DATA: 1502,
  DATA_WRRQ: 1503,
  DATA_RDY: 1504,
  ACK_OK: 2000,
  ACK_ERROR: 2001,
  ACK_DATA: 2002,
  ACK_UNAUTH: 2005,
} as const;

/**
 * Magic prefix that frames every packet on the TCP transport.
 *
 * On the wire the bytes are 50 50 82 7d, which is 0x7d825050 read as a
 * little-endian uint32. Verified against a live K50 — a round-trip test alone
 * cannot catch a wrong value here, so TCP_HEADER_BYTES below pins the actual
 * byte sequence.
 */
export const TCP_HEADER_MAGIC = 0x7d825050;

/** The literal on-wire header bytes, for tests to assert against. */
export const TCP_HEADER_BYTES = Buffer.from([0x50, 0x50, 0x82, 0x7d]);
const TCP_HEADER_SIZE = 8;
const PACKET_HEADER_SIZE = 8;

/**
 * 16-bit one's-complement checksum over the packet with the checksum field
 * zeroed — the same scheme used by IP/UDP.
 */
export function checksum16(buffer: Buffer): number {
  let sum = 0;
  let i = 0;

  for (; i + 1 < buffer.length; i += 2) {
    sum += buffer.readUInt16LE(i);
    // Fold the carry back in as we go to keep the accumulator in range.
    if (sum > 0xffff) sum -= 0xffff;
  }
  if (i < buffer.length) {
    sum += buffer.readUInt8(i);
    if (sum > 0xffff) sum -= 0xffff;
  }

  return (~sum & 0xffff) >>> 0;
}

export interface PacketHeader {
  command: number;
  sessionId: number;
  replyId: number;
}

/** Builds a bare protocol packet (no TCP framing). */
export function encodePacket(header: PacketHeader, data: Buffer = Buffer.alloc(0)): Buffer {
  const packet = Buffer.alloc(PACKET_HEADER_SIZE + data.length);
  packet.writeUInt16LE(header.command, 0);
  packet.writeUInt16LE(0, 2); // checksum placeholder
  packet.writeUInt16LE(header.sessionId, 4);
  packet.writeUInt16LE(header.replyId, 6);
  data.copy(packet, PACKET_HEADER_SIZE);

  packet.writeUInt16LE(checksum16(packet), 2);
  return packet;
}

/** Wraps a packet in the 8-byte TCP framing header. */
export function frameForTcp(packet: Buffer): Buffer {
  const framed = Buffer.alloc(TCP_HEADER_SIZE + packet.length);
  framed.writeUInt32LE(TCP_HEADER_MAGIC, 0);
  framed.writeUInt32LE(packet.length, 4);
  packet.copy(framed, TCP_HEADER_SIZE);
  return framed;
}

export interface DecodedPacket {
  command: number;
  checksum: number;
  sessionId: number;
  replyId: number;
  data: Buffer;
}

/** Strips the TCP framing header, returning the declared payload length. */
export function readTcpFrame(buffer: Buffer): { payloadLength: number; body: Buffer } | null {
  if (buffer.length < TCP_HEADER_SIZE) return null;
  if (buffer.readUInt32LE(0) !== TCP_HEADER_MAGIC) {
    throw new Error("Not a ZKTeco TCP frame: bad magic header");
  }
  const payloadLength = buffer.readUInt32LE(4);
  return { payloadLength, body: buffer.subarray(TCP_HEADER_SIZE) };
}

export function decodePacket(packet: Buffer): DecodedPacket {
  if (packet.length < PACKET_HEADER_SIZE) {
    throw new Error(`Packet too short: ${packet.length} bytes`);
  }
  return {
    command: packet.readUInt16LE(0),
    checksum: packet.readUInt16LE(2),
    sessionId: packet.readUInt16LE(4),
    replyId: packet.readUInt16LE(6),
    data: packet.subarray(PACKET_HEADER_SIZE),
  };
}

/**
 * Derives the authentication token for a device with a COMM KEY set.
 *
 * The terminal expects the key spread across 32 bits, offset by the session id,
 * XORed with the ASCII of "ZKSO", word-swapped, then XORed with a tick byte.
 * Byte 2 is replaced by the tick rather than XORed — that asymmetry is in the
 * firmware, not a mistake here.
 *
 * Worth knowing: the word swap discards byte 0, which is where the low byte of
 * the session id lands. Adjacent sessions therefore derive the *same* token,
 * so this is obfuscation rather than authentication. Treat the terminal's
 * network segment as the real security boundary and keep it off the office
 * VLAN — do not rely on the COMM KEY to protect punch data.
 */
export function makeCommKey(commKey: number, sessionId: number, ticks = 50): Buffer {
  let k = 0;
  for (let i = 0; i < 32; i++) {
    if (commKey & (1 << i)) {
      k = ((k << 1) | 1) >>> 0;
    } else {
      k = (k << 1) >>> 0;
    }
  }
  k = (k + sessionId) >>> 0;

  const packed = Buffer.alloc(4);
  packed.writeUInt32LE(k, 0);

  const xored = Buffer.from([
    packed[0]! ^ 0x5a, // 'Z'
    packed[1]! ^ 0x4b, // 'K'
    packed[2]! ^ 0x53, // 'S'
    packed[3]! ^ 0x4f, // 'O'
  ]);

  // Swap the two 16-bit halves.
  const swapped = Buffer.alloc(4);
  swapped.writeUInt16LE(xored.readUInt16LE(2), 0);
  swapped.writeUInt16LE(xored.readUInt16LE(0), 2);

  const tick = ticks & 0xff;
  return Buffer.from([swapped[0]! ^ tick, swapped[1]! ^ tick, tick, swapped[3]! ^ tick]);
}

/**
 * ZKTeco packs a timestamp into a single uint32 using a fixed 31-day month and
 * 12-month year, counting from 2000. It is not a Unix epoch.
 */
export function decodeDeviceTime(encoded: number): Date {
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

  const year = value + 2000;

  return new Date(year, month, day, hour, minute, second);
}

export function encodeDeviceTime(date: Date): number {
  const year = date.getFullYear() % 100;
  const month = date.getMonth();
  const day = date.getDate();

  return (
    ((year * 12 * 31 + month * 31 + (day - 1)) * (24 * 60 * 60) +
      date.getHours() * 3600 +
      date.getMinutes() * 60 +
      date.getSeconds()) >>>
    0
  );
}

export interface DeviceAttendanceRecord {
  /** The terminal's internal enrolment number. */
  deviceUserId: string;
  timestamp: Date;
  /** Raw punch state byte: 0 check-in, 1 check-out, and vendor extensions. */
  state: number;
  /** Verification method: fingerprint, card, password. */
  verifyMode: number;
}

/**
 * Parses an ATTLOG payload.
 *
 * Record width varies by firmware generation. The K50 family uses 40-byte
 * records; the 16-byte layout is retained for older units on the same site.
 */
export function parseAttendanceData(data: Buffer): DeviceAttendanceRecord[] {
  if (data.length === 0) return [];

  // The first 4 bytes are a size prefix on some firmware revisions.
  let body = data;
  if (body.length > 4) {
    const declared = body.readUInt32LE(0);
    if (declared === body.length - 4) {
      body = body.subarray(4);
    }
  }

  const recordSize = pickRecordSize(body.length);
  if (recordSize === null) return [];

  const records: DeviceAttendanceRecord[] = [];

  for (let offset = 0; offset + recordSize <= body.length; offset += recordSize) {
    const chunk = body.subarray(offset, offset + recordSize);
    const record = recordSize === 40 ? parse40(chunk) : parse16(chunk);
    if (record) records.push(record);
  }

  return records;
}

function pickRecordSize(length: number): 40 | 16 | null {
  if (length % 40 === 0) return 40;
  if (length % 16 === 0) return 16;
  return null;
}

function parse40(chunk: Buffer): DeviceAttendanceRecord | null {
  const deviceUserId = chunk.subarray(2, 11).toString("ascii").split("\0")[0]?.trim() ?? "";
  if (!deviceUserId) return null;

  return {
    deviceUserId,
    verifyMode: chunk.readUInt8(26),
    timestamp: decodeDeviceTime(chunk.readUInt32LE(27)),
    state: chunk.readUInt8(31),
  };
}

function parse16(chunk: Buffer): DeviceAttendanceRecord | null {
  const deviceUserId = String(chunk.readUInt16LE(0));
  if (deviceUserId === "0") return null;

  return {
    deviceUserId,
    verifyMode: chunk.readUInt8(2),
    timestamp: decodeDeviceTime(chunk.readUInt32LE(4)),
    state: chunk.readUInt8(3),
  };
}

/**
 * Maps the device's punch state byte to a direction.
 *
 * Terminals configured without explicit in/out keys report 0 for everything,
 * so "unknown" is common and the ingestion layer infers direction from the
 * order of punches within the day instead.
 */
export function directionFromState(state: number): "in" | "out" | "unknown" {
  switch (state) {
    case 0:
    case 4: // overtime in
      return "in";
    case 1:
    case 5: // overtime out
      return "out";
    default:
      return "unknown";
  }
}
