import { describe, expect, it } from "vitest";

import { ackResponse, buildHandshakeResponse, parseAttlog, setUserCommand } from "./iclock";
import {
  CMD,
  checksum16,
  decodeDeviceTime,
  decodePacket,
  directionFromState,
  encodeDeviceTime,
  encodePacket,
  frameForTcp,
  makeCommKey,
  parseAttendanceData,
  readTcpFrame,
  TCP_HEADER_BYTES,
} from "./protocol";

describe("packet framing", () => {
  it("round-trips a command packet", () => {
    const packet = encodePacket(
      { command: CMD.CONNECT, sessionId: 0x1234, replyId: 7 },
      Buffer.from([1, 2, 3, 4]),
    );
    const decoded = decodePacket(packet);

    expect(decoded.command).toBe(CMD.CONNECT);
    expect(decoded.sessionId).toBe(0x1234);
    expect(decoded.replyId).toBe(7);
    expect([...decoded.data]).toEqual([1, 2, 3, 4]);
  });

  it("writes a checksum that validates when recomputed", () => {
    const packet = encodePacket({ command: CMD.GET_TIME, sessionId: 42, replyId: 1 });
    const stored = packet.readUInt16LE(2);

    // Recomputing over the packet with the field zeroed must reproduce it.
    const zeroed = Buffer.from(packet);
    zeroed.writeUInt16LE(0, 2);
    expect(checksum16(zeroed)).toBe(stored);
  });

  it("frames and unframes for TCP", () => {
    const packet = encodePacket({ command: CMD.EXIT, sessionId: 1, replyId: 1 });
    const framed = frameForTcp(packet);
    const frame = readTcpFrame(framed);

    expect(frame).not.toBeNull();
    expect(frame?.payloadLength).toBe(packet.length);
    expect(frame?.body.subarray(0, packet.length)).toEqual(packet);
  });

  it("writes the exact header bytes the terminal expects", () => {
    // Pinned to the real wire format (50 50 82 7d). A round-trip assertion
    // would happily pass with a wrong constant, which is exactly how an
    // earlier typo survived until it met a live K50.
    const framed = frameForTcp(encodePacket({ command: CMD.CONNECT, sessionId: 0, replyId: 1 }));
    expect([...framed.subarray(0, 4)]).toEqual([0x50, 0x50, 0x82, 0x7d]);
    expect(framed.subarray(0, 4)).toEqual(TCP_HEADER_BYTES);
  });

  it("parses a real CMD_ACK_UNAUTH reply captured from a K50", () => {
    // Captured from 192.168.1.201: framed header, then an 8-byte packet.
    const wire = Buffer.from("505082 7d0800000 0d5070d7b1c7d0100".replace(/\s/g, ""), "hex");
    const frame = readTcpFrame(wire);
    expect(frame?.payloadLength).toBe(8);

    const reply = decodePacket(frame!.body.subarray(0, 8));
    expect(reply.command).toBe(CMD.ACK_UNAUTH);
    expect(reply.sessionId).toBe(0x7d1c);
  });

  it("rejects a buffer that is not a ZKTeco frame", () => {
    expect(() => readTcpFrame(Buffer.from([0, 0, 0, 0, 0, 0, 0, 0]))).toThrow(/bad magic/i);
  });

  it("returns null when the frame header has not fully arrived", () => {
    expect(readTcpFrame(Buffer.from([0x50, 0x50]))).toBeNull();
  });
});

describe("device time codec", () => {
  it("round-trips a timestamp", () => {
    const original = new Date(2026, 7, 14, 7, 58, 12); // 14 Aug 2026, 07:58:12
    const decoded = decodeDeviceTime(encodeDeviceTime(original));
    expect(decoded.getTime()).toBe(original.getTime());
  });

  it("round-trips across a year boundary", () => {
    const original = new Date(2026, 11, 31, 23, 59, 59);
    expect(decodeDeviceTime(encodeDeviceTime(original)).getTime()).toBe(original.getTime());
  });

  it("counts from 2000, not the Unix epoch", () => {
    const decoded = decodeDeviceTime(encodeDeviceTime(new Date(2000, 0, 1, 0, 0, 0)));
    expect(decoded.getFullYear()).toBe(2000);
    expect(encodeDeviceTime(new Date(2000, 0, 1, 0, 0, 0))).toBe(0);
  });
});

describe("comm key", () => {
  it("produces a deterministic four-byte token", () => {
    const token = makeCommKey(123456, 0x1234, 50);
    expect(token).toHaveLength(4);
    expect(makeCommKey(123456, 0x1234, 50)).toEqual(token);
  });

  it("changes with the session id", () => {
    // Session ids must differ above the low byte to change the token — see the
    // note on makeCommKey about byte 0 being discarded by the word swap.
    expect(makeCommKey(123456, 0x0100)).not.toEqual(makeCommKey(123456, 0x0200));
  });

  it("ignores the low byte of the session id (a quirk of ZKTeco's scheme)", () => {
    // Documented, not endorsed: the derived token is identical for adjacent
    // session ids, so it is far weaker than its 4-byte width suggests.
    expect(makeCommKey(123456, 1)).toEqual(makeCommKey(123456, 2));
  });

  it("places the tick byte verbatim in position 2", () => {
    expect(makeCommKey(999, 5, 50)[2]).toBe(50);
    expect(makeCommKey(999, 5, 77)[2]).toBe(77);
  });
});

describe("binary attendance log", () => {
  it("parses a 40-byte record", () => {
    const record = Buffer.alloc(40);
    record.writeUInt16LE(1, 0);
    record.write("1042\0", 2, "ascii");
    record.writeUInt8(1, 26); // verify mode: fingerprint
    record.writeUInt32LE(encodeDeviceTime(new Date(2026, 7, 14, 7, 58, 12)), 27);
    record.writeUInt8(0, 31); // state: check-in

    const [parsed] = parseAttendanceData(record);

    expect(parsed?.deviceUserId).toBe("1042");
    expect(parsed?.verifyMode).toBe(1);
    expect(parsed?.timestamp.getHours()).toBe(7);
    expect(parsed?.timestamp.getMinutes()).toBe(58);
  });

  it("parses several records in one payload", () => {
    const buffer = Buffer.alloc(80);
    buffer.write("11\0", 2, "ascii");
    buffer.writeUInt32LE(encodeDeviceTime(new Date(2026, 7, 14, 8, 0, 0)), 27);
    buffer.write("12\0", 42, "ascii");
    buffer.writeUInt32LE(encodeDeviceTime(new Date(2026, 7, 14, 9, 0, 0)), 67);

    const records = parseAttendanceData(buffer);
    expect(records.map((r) => r.deviceUserId)).toEqual(["11", "12"]);
  });

  it("returns nothing for an empty log", () => {
    expect(parseAttendanceData(Buffer.alloc(0))).toEqual([]);
  });

  it("maps punch state bytes to a direction", () => {
    expect(directionFromState(0)).toBe("in");
    expect(directionFromState(1)).toBe("out");
    expect(directionFromState(9)).toBe("unknown");
  });
});

describe("iclock push protocol", () => {
  it("parses a tab-separated ATTLOG batch", () => {
    const body = [
      "1042\t2026-08-14 07:58:12\t0\t1\t0\t0\t0",
      "1043\t2026-08-14 08:03:44\t1\t1\t0\t0\t0",
    ].join("\n");

    const { punches, skipped } = parseAttlog(body);

    expect(skipped).toBe(0);
    expect(punches).toHaveLength(2);
    expect(punches[0]?.deviceUserId).toBe("1042");
    expect(punches[0]?.direction).toBe("in");
    expect(punches[1]?.direction).toBe("out");
  });

  it("skips malformed lines without dropping the valid ones", () => {
    const body = ["1042\t2026-08-14 07:58:12\t0\t1", "garbage", "\t\t", "1043\tnot-a-date\t0"].join(
      "\n",
    );

    const { punches, skipped } = parseAttlog(body);

    expect(punches).toHaveLength(1);
    expect(punches[0]?.deviceUserId).toBe("1042");
    // The whitespace-only line counts as blank, not as a rejected record.
    expect(skipped).toBe(2);
  });

  it("tolerates CRLF line endings and a trailing newline", () => {
    const { punches } = parseAttlog("1042\t2026-08-14 07:58:12\t0\t1\r\n");
    expect(punches).toHaveLength(1);
  });

  it("keeps a work code when the device sends one", () => {
    const { punches } = parseAttlog("1042\t2026-08-14 07:58:12\t0\t1\tWEAVING\t0\t0");
    expect(punches[0]?.workCode).toBe("WEAVING");
  });

  it("acknowledges in the exact shape the terminal expects", () => {
    expect(ackResponse(2)).toBe("OK: 2");
  });

  it("includes the serial number in the handshake", () => {
    const response = buildHandshakeResponse({ serialNumber: "K50-0001" });
    expect(response.startsWith("GET OPTION FROM: K50-0001")).toBe(true);
    expect(response).toContain("Realtime=1");
  });

  it("builds a user-enrolment command", () => {
    const command = setUserCommand(7, { deviceUserId: "1042", name: "Imran Sheikh" });
    expect(command).toBe(
      "C:7:DATA UPDATE USERINFO PIN=1042\tName=Imran Sheikh\tPri=0\tPasswd=\tCard=\tGrp=1\tTZ=0000000000000000",
    );
  });
});
