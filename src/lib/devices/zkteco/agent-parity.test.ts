import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

import { CMD, TCP_HEADER_MAGIC } from "./protocol";

/**
 * Keeps the standalone agent's embedded protocol in step with this one.
 *
 * `scripts/rado-agent.mjs` deliberately duplicates the wire protocol so it can
 * be dropped onto a factory PC with no build step and no dependencies. That
 * duplication is a real hazard: a wrong magic header once cost a debugging
 * session and was only caught by live hardware. These assertions fail the
 * build if the copy drifts from the source of truth.
 */

const AGENT = readFileSync(
  fileURLToPath(new URL("../../../../scripts/rado-agent.mjs", import.meta.url)),
  "utf8",
);

function constantFromAgent(name: string): string {
  // Anchored so that looking up DATA does not match inside ACK_DATA.
  const match = new RegExp(`(?:^|[\\s{,])${name}:\\s*(\\d+)`, "m").exec(AGENT);
  if (!match?.[1]) throw new Error(`Agent is missing the ${name} command constant`);
  return match[1];
}

describe("agent protocol parity", () => {
  it("uses the same TCP frame magic", () => {
    const match = /const MAGIC = (0x[0-9a-f]+)/.exec(AGENT);
    expect(match?.[1]).toBeDefined();
    expect(Number(match![1])).toBe(TCP_HEADER_MAGIC);
  });

  it("uses the same command codes", () => {
    const shared = [
      ["CONNECT", CMD.CONNECT],
      ["EXIT", CMD.EXIT],
      ["ENABLE", CMD.ENABLE_DEVICE],
      ["DISABLE", CMD.DISABLE_DEVICE],
      ["ATTLOG", CMD.ATTLOG_RRQ],
      ["AUTH", CMD.AUTH],
      ["ACK_OK", CMD.ACK_OK],
      ["ACK_DATA", CMD.ACK_DATA],
      ["ACK_UNAUTH", CMD.ACK_UNAUTH],
      ["PREPARE_DATA", CMD.PREPARE_DATA],
      ["DATA", CMD.DATA],
    ] as const;

    for (const [name, expected] of shared) {
      expect(Number(constantFromAgent(name)), `CMD.${name}`).toBe(expected);
    }
  });

  it("reads the 40-byte record at the same offsets", () => {
    // A shifted offset would parse plausible-looking but wrong timestamps.
    expect(AGENT).toContain("chunk.subarray(2, 11)");
    expect(AGENT).toContain("chunk.readUInt8(26)");
    expect(AGENT).toContain("chunk.readUInt32LE(27)");
    expect(AGENT).toContain("chunk.readUInt8(31)");
  });

  it("still consumes frames rather than peeking at them", () => {
    // The bug that silently turned a full attendance log into zero records.
    expect(AGENT).toContain("buffer = buffer.subarray(8 + length)");
  });

  it("always attempts the comm-key handshake, including with key 0", () => {
    // A K50 with no COMM KEY set still replies ACK_UNAUTH and then accepts a
    // token built from 0. Treating "no key" as "cannot authenticate" locks the
    // agent out of a default-configured terminal.
    expect(AGENT).toContain("makeCommKey(device.commKey, sessionId)");
  });
});
