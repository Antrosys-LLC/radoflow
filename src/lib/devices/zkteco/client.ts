import { Socket } from "node:net";

import {
  CMD,
  decodeDeviceTime,
  decodePacket,
  encodeDeviceTime,
  encodePacket,
  frameForTcp,
  makeCommKey,
  parseAttendanceData,
  readTcpFrame,
  type DecodedPacket,
  type DeviceAttendanceRecord,
} from "./protocol";

/**
 * TCP client for ZKTeco terminals in "pull" mode.
 *
 * Requires a route from the server to the device on port 4370, so it only
 * works when both sit on the factory network. Push mode (./iclock.ts) is the
 * better default for a wireless K50; this path exists for on-demand actions
 * the device cannot initiate — reading the full log, syncing enrolments,
 * correcting the clock.
 *
 * Not usable from a serverless runtime: it holds a raw socket, so call it from
 * a long-lived Node process (a worker, or `next start` on a real host).
 */

export interface ZktecoClientOptions {
  host: string;
  port?: number;
  /** The terminal's COMM KEY. 0 or undefined means no authentication. */
  commKey?: number;
  timeoutMs?: number;
}

export interface DeviceInfo {
  serialNumber: string | null;
  deviceName: string | null;
  platform: string | null;
  firmware: string | null;
  time: Date | null;
}

const DEFAULT_TIMEOUT = 10_000;

export class ZktecoError extends Error {
  constructor(
    message: string,
    readonly code?: number,
  ) {
    super(message);
    this.name = "ZktecoError";
  }
}

export class ZktecoClient {
  private socket: Socket | null = null;
  private sessionId = 0;
  private replyId = 0;
  private buffer: Buffer = Buffer.alloc(0);
  private readonly options: Required<Omit<ZktecoClientOptions, "commKey">> & { commKey: number };

  constructor(options: ZktecoClientOptions) {
    this.options = {
      host: options.host,
      port: options.port ?? 4370,
      timeoutMs: options.timeoutMs ?? DEFAULT_TIMEOUT,
      commKey: options.commKey ?? 0,
    };
  }

  async connect(): Promise<void> {
    await this.openSocket();

    const reply = await this.send(CMD.CONNECT);
    this.sessionId = reply.sessionId;

    if (reply.command === CMD.ACK_UNAUTH) {
      // Always attempt the handshake, including with key 0. A K50 with no
      // COMM KEY configured still answers ACK_UNAUTH and then accepts an AUTH
      // packet built from 0 — treating "no key" as "cannot authenticate"
      // locks us out of the common default-configured terminal.
      const auth = await this.send(CMD.AUTH, makeCommKey(this.options.commKey, this.sessionId));
      if (auth.command !== CMD.ACK_OK) {
        throw new ZktecoError(
          this.options.commKey
            ? "Device rejected the COMM KEY. Check Menu → Comm → Security on the terminal."
            : "Device requires a COMM KEY. Read it from Menu → Comm → Security and add it here.",
          auth.command,
        );
      }
      return;
    }

    if (reply.command !== CMD.ACK_OK) {
      throw new ZktecoError("Device refused the connection", reply.command);
    }
  }

  async disconnect(): Promise<void> {
    if (this.socket) {
      try {
        await this.send(CMD.EXIT);
      } catch {
        // The device often drops the socket before acknowledging EXIT.
      }
      this.socket.destroy();
      this.socket = null;
    }
    this.sessionId = 0;
    this.replyId = 0;
  }

  /**
   * Pauses the terminal's UI for the duration of a bulk read.
   *
   * The firmware can return a truncated log if someone punches mid-transfer,
   * so bulk reads are bracketed by disable/enable.
   */
  async disableDevice(): Promise<void> {
    await this.send(CMD.DISABLE_DEVICE, uint16(0));
  }

  async enableDevice(): Promise<void> {
    await this.send(CMD.ENABLE_DEVICE);
  }

  async getInfo(): Promise<DeviceInfo> {
    return {
      serialNumber: await this.readParam("~SerialNumber"),
      deviceName: await this.readParam("~DeviceName"),
      platform: await this.readParam("~Platform"),
      firmware: await this.readParam("FirmVer"),
      time: await this.getTime(),
    };
  }

  async getTime(): Promise<Date | null> {
    const reply = await this.send(CMD.GET_TIME);
    if (reply.data.length < 4) return null;
    return decodeDeviceTime(reply.data.readUInt32LE(0));
  }

  /** Corrects terminal drift, which otherwise silently skews every punch. */
  async setTime(date: Date): Promise<void> {
    const payload = Buffer.alloc(4);
    payload.writeUInt32LE(encodeDeviceTime(date), 0);
    const reply = await this.send(CMD.SET_TIME, payload);
    if (reply.command !== CMD.ACK_OK) {
      throw new ZktecoError("Device rejected the time update", reply.command);
    }
  }

  /** Reads the full on-device attendance log. */
  async getAttendance(): Promise<DeviceAttendanceRecord[]> {
    await this.disableDevice();
    try {
      const data = await this.readBulk(CMD.ATTLOG_RRQ);
      return parseAttendanceData(data);
    } finally {
      await this.enableDevice();
    }
  }

  /**
   * Clears the on-device log.
   *
   * Only safe once records are durably stored on our side — the terminal keeps
   * no backup, so an early call loses punches permanently.
   */
  async clearAttendance(): Promise<void> {
    const reply = await this.send(CMD.CLEAR_ATTLOG);
    if (reply.command !== CMD.ACK_OK) {
      throw new ZktecoError("Device refused to clear its log", reply.command);
    }
  }

  // -- transport ------------------------------------------------------------

  private openSocket(): Promise<void> {
    return new Promise((resolve, reject) => {
      const socket = new Socket();
      socket.setTimeout(this.options.timeoutMs);

      const onError = (error: Error) => {
        socket.destroy();
        reject(new ZktecoError(`Cannot reach terminal at ${this.options.host}: ${error.message}`));
      };

      socket.once("error", onError);
      socket.once("timeout", () => onError(new Error("connection timed out")));

      socket.connect(this.options.port, this.options.host, () => {
        socket.off("error", onError);
        socket.on("data", (chunk) => {
          this.buffer = Buffer.concat([this.buffer, chunk]);
        });
        this.socket = socket;
        resolve();
      });
    });
  }

  private async send(command: number, data?: Buffer): Promise<DecodedPacket> {
    const socket = this.socket;
    if (!socket) throw new ZktecoError("Not connected");

    this.replyId = (this.replyId + 1) & 0xffff;
    this.buffer = Buffer.alloc(0);

    const packet = encodePacket(
      { command, sessionId: this.sessionId, replyId: this.replyId },
      data,
    );
    socket.write(frameForTcp(packet));

    return this.awaitReply();
  }

  /**
   * Pops one complete framed packet off the buffer.
   *
   * Consuming is the important part: the buffer is a stream, and a bulk
   * transfer arrives as PREPARE_DATA, then DATA, then ACK_OK. Peeking without
   * removing makes every read return the first packet forever, which silently
   * turns a full attendance log into zero records.
   */
  private takeFrame(): DecodedPacket | null {
    const frame = readTcpFrame(this.buffer);
    if (!frame || frame.body.length < frame.payloadLength) return null;

    const packet = frame.body.subarray(0, frame.payloadLength);
    this.buffer = frame.body.subarray(frame.payloadLength);
    return decodePacket(packet);
  }

  /** Waits until a full framed packet has arrived, or the timeout elapses. */
  private awaitReply(): Promise<DecodedPacket> {
    const socket = this.socket;
    if (!socket) throw new ZktecoError("Not connected");

    return new Promise((resolve, reject) => {
      const deadline = setTimeout(() => {
        cleanup();
        reject(new ZktecoError("Timed out waiting for the terminal to reply"));
      }, this.options.timeoutMs);

      const cleanup = () => {
        clearTimeout(deadline);
        socket.off("data", onData);
        socket.off("error", onError);
      };

      const onError = (error: Error) => {
        cleanup();
        reject(new ZktecoError(error.message));
      };

      const onData = () => {
        let packet: DecodedPacket | null;
        try {
          packet = this.takeFrame();
        } catch (error) {
          cleanup();
          reject(error as Error);
          return;
        }
        if (!packet) return;

        cleanup();
        resolve(packet);
      };

      socket.on("data", onData);
      socket.on("error", onError);
      onData(); // the reply may already be buffered
    });
  }

  /**
   * Runs a command whose response is larger than one packet.
   *
   * The device answers either with the data inline, or with PREPARE_DATA
   * announcing a byte count followed by DATA packets it streams until the
   * count is met.
   */
  private async readBulk(command: number): Promise<Buffer> {
    const reply = await this.send(command);

    if (reply.command === CMD.ACK_DATA) {
      return reply.data;
    }

    if (reply.command !== CMD.PREPARE_DATA) {
      throw new ZktecoError("Device did not return data", reply.command);
    }

    // PREPARE_DATA announces the byte count; the payload follows as one or
    // more DATA packets, closed by an ACK_OK.
    const expected = reply.data.length >= 4 ? reply.data.readUInt32LE(0) : 0;
    const chunks: Buffer[] = [];
    let received = 0;

    while (received < expected) {
      const packet = await this.awaitReply();

      if (packet.command === CMD.DATA || packet.command === CMD.ACK_DATA) {
        chunks.push(packet.data);
        received += packet.data.length;
        continue;
      }

      // ACK_OK closes the transfer; anything else means the device gave up
      // early and there is no more data coming.
      break;
    }

    return Buffer.concat(chunks);
  }

  private async readParam(name: string): Promise<string | null> {
    const reply = await this.send(CMD.DEVICE, Buffer.from(name, "ascii"));
    if (reply.command !== CMD.ACK_OK) return null;
    const text = reply.data.toString("ascii").replace(/\0/g, "").trim();
    const separator = text.indexOf("=");
    return separator >= 0 ? text.slice(separator + 1).trim() : text || null;
  }
}

function uint16(value: number): Buffer {
  const buffer = Buffer.alloc(2);
  buffer.writeUInt16LE(value, 0);
  return buffer;
}

/** Convenience wrapper that always closes the socket. */
export async function withDevice<T>(
  options: ZktecoClientOptions,
  work: (client: ZktecoClient) => Promise<T>,
): Promise<T> {
  const client = new ZktecoClient(options);
  await client.connect();
  try {
    return await work(client);
  } finally {
    await client.disconnect();
  }
}
