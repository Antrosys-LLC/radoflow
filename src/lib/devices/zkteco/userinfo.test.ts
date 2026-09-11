import { describe, expect, it } from "vitest";

import { deletedPinFromOplog, parseCommandResult, parseOperlog, withPin } from "./userinfo";

/**
 * A real fingerprint template is ~1.4 KB of base64 and its exact bytes are the
 * whole point, so the fixtures here keep the shape and shorten the payload.
 * The trailing `=` padding is deliberate in several of them: it is the
 * character most likely to break a naive `split("=")` parser, and the field it
 * terminates is the one that must survive intact.
 */
const TEMPLATE = "Tk9UQVJFQUxURU1QTEFURQ==";

describe("parseOperlog — users", () => {
  it("reads a user enrolled on the terminal", () => {
    const { users } = parseOperlog(
      "USER PIN=2070\tName=Muhammad Aslam\tPri=0\tPasswd=\tCard=123456\tGrp=1\tTZ=0000000000000000",
    );

    expect(users).toEqual([
      { deviceUserId: "2070", name: "Muhammad Aslam", privilege: 0, cardNumber: "123456" },
    ]);
  });

  it("keeps an administrator's privilege level", () => {
    const { users } = parseOperlog("USER PIN=1\tName=Supervisor\tPri=14\tCard=");

    expect(users[0]?.privilege).toBe(14);
    expect(users[0]?.cardNumber).toBeNull();
  });

  it("refuses a non-numeric PIN rather than inventing an enrolment", () => {
    // A terminal cannot produce this. Accepting it would create an enrolment
    // no punch could ever match, which fails silently for weeks.
    const { users, skipped } = parseOperlog("USER PIN=RD-2070\tName=Aslam");

    expect(users).toHaveLength(0);
    expect(skipped).toBe(1);
  });
});

describe("parseOperlog — templates", () => {
  it("reads a legacy FP line", () => {
    const { biometrics } = parseOperlog(`FP PIN=2070\tFID=3\tSize=1424\tValid=1\tTMP=${TEMPLATE}`);

    expect(biometrics).toHaveLength(1);
    expect(biometrics[0]).toMatchObject({
      deviceUserId: "2070",
      dialect: "fp",
      bioType: 1,
      fingerIndex: 3,
      templateSize: 1424,
      isDuress: false,
    });
  });

  it("reads a BIODATA line, whose keys are cased differently", () => {
    // Same firmware family writes PIN on a USER line and Pin here. Matching
    // case-sensitively would parse one dialect and silently drop the other.
    const { biometrics } = parseOperlog(
      `BIODATA Pin=2070\tNo=1\tIndex=0\tValid=1\tDuress=0\tType=1\tMajorVer=12\tMinorVer=0\tFormat=0\tTmp=${TEMPLATE}`,
    );

    expect(biometrics[0]).toMatchObject({
      deviceUserId: "2070",
      dialect: "biodata",
      bioType: 1,
      fingerIndex: 1,
    });
  });

  it("distinguishes a face from a fingerprint", () => {
    const { biometrics } = parseOperlog(`BIODATA Pin=2070\tNo=0\tType=2\tValid=1\tTmp=${TEMPLATE}`);

    expect(biometrics[0]?.bioType).toBe(2);
  });

  it("flags a duress finger", () => {
    const { biometrics } = parseOperlog(
      `BIODATA Pin=2070\tNo=0\tType=1\tDuress=1\tTmp=${TEMPLATE}`,
    );

    expect(biometrics[0]?.isDuress).toBe(true);
  });

  it("keeps the payload verbatim, base64 padding and all", () => {
    // The payload is replayed to the other terminals byte for byte. A parser
    // that reassembles it from known fields drops whatever the firmware added
    // that this code has never heard of.
    const line = `BIODATA Pin=2070\tNo=0\tType=1\tTmp=${TEMPLATE}\tUnknownFutureField=7`;
    const { biometrics } = parseOperlog(line);

    expect(biometrics[0]?.payload).toBe(line.slice("BIODATA ".length));
    expect(biometrics[0]?.payload).toContain(TEMPLATE);
  });

  it("skips a template with no PIN to attach it to", () => {
    const { biometrics, skipped } = parseOperlog(`FP FID=0\tTMP=${TEMPLATE}`);

    expect(biometrics).toHaveLength(0);
    expect(skipped).toBe(1);
  });
});

describe("parseOperlog — deletions", () => {
  it("reads a user deleted on the terminal", () => {
    // op 9 = delete user; the removed PIN is the fourth field.
    const { deletions } = parseOperlog("OPLOG 9\t1\t2026-09-10 08:15:00\t2070\t0\t0\t0");

    expect(deletions).toEqual([{ deviceUserId: "2070" }]);
  });

  it("ignores every other audit code", () => {
    // 4 is "entered the menu" and 10 is "deleted one fingerprint". Neither is
    // a deletion to mirror onto the other two terminals.
    const { deletions } = parseOperlog(
      [
        "OPLOG 4\t1\t2026-09-10 08:14:00\t0\t0\t0\t0",
        "OPLOG 10\t1\t2026-09-10 08:15:00\t2070\t0\t0\t0",
      ].join("\n"),
    );

    expect(deletions).toHaveLength(0);
  });

  it("does not treat clear-all-users as 400 deletions", () => {
    // op 25 wipes the terminal. Mirroring it would empty the other two boxes
    // and lock the whole factory out of the gate.
    expect(deletedPinFromOplog("25\t1\t2026-09-10 08:15:00\t0\t0\t0\t0")).toBeNull();
  });
});

describe("parseOperlog — mixed and malformed bodies", () => {
  it("handles the shape a real enrolment arrives in", () => {
    const body = [
      "USER PIN=2070\tName=Aslam\tPri=0\tCard=",
      `FP PIN=2070\tFID=0\tSize=1424\tValid=1\tTMP=${TEMPLATE}`,
      `FP PIN=2070\tFID=1\tSize=1424\tValid=1\tTMP=${TEMPLATE}`,
      "OPLOG 4\t1\t2026-09-10 08:14:00\t0\t0\t0\t0",
    ].join("\r\n");

    const result = parseOperlog(body);

    expect(result.users).toHaveLength(1);
    expect(result.biometrics).toHaveLength(2);
    expect(result.biometrics.map((b) => b.fingerIndex)).toEqual([0, 1]);
    expect(result.skipped).toBe(0);
  });

  it("ignores record types this system has no use for", () => {
    // Not skipped — a user photo is a real record, just not one we want.
    const result = parseOperlog("USERPIC PIN=2070\tSize=8123\tContent=abc");

    expect(result.skipped).toBe(0);
    expect(result.users).toHaveLength(0);
  });

  it("survives blank lines and a truncated final record", () => {
    const result = parseOperlog("\n\nUSER PIN=2070\tName=Aslam\n\nBIODATA");

    expect(result.users).toHaveLength(1);
  });
});

describe("withPin", () => {
  it("rewrites the PIN under the canonical number", () => {
    const rewritten = withPin(`Pin=41\tNo=0\tType=1\tTmp=${TEMPLATE}`, "2070");

    expect(rewritten).toBe(`Pin=2070\tNo=0\tType=1\tTmp=${TEMPLATE}`);
  });

  it("leaves the template alone when it happens to contain PIN=", () => {
    // Base64 can produce anything. A bare string replace would edit the one
    // field that must not be touched, and the receiving terminal would take a
    // corrupted template without complaining.
    const payload = `Pin=41\tNo=0\tTmp=YWJjUElOPTk5OWRlZg==`;

    expect(withPin(payload, "2070")).toBe(`Pin=2070\tNo=0\tTmp=YWJjUElOPTk5OWRlZg==`);
  });

  it("preserves the key's original casing so the terminal still parses it", () => {
    expect(withPin("PIN=41\tFID=0", "2070")).toBe("PIN=2070\tFID=0");
  });
});

describe("parseCommandResult — firmware variations", () => {
  it("reads keys in whatever case the firmware writes them", () => {
    const [result] = parseCommandResult("id=7&return=0&cmd=DATA");

    expect(result).toMatchObject({ id: 7, returnCode: 0, command: "DATA" });
  });

  it("splits several results written on one line", () => {
    const results = parseCommandResult("ID=1&Return=0&CMD=DATA&ID=2&Return=-1&CMD=DATA");

    expect(results.map((r) => [r.id, r.returnCode])).toEqual([
      [1, 0],
      [2, -1],
    ]);
  });

  it("keeps the raw text when there is no readable code", () => {
    // The kitchen's first results were unrecognised and nobody could see why.
    const [result] = parseCommandResult("ID=9&CMD=DATA DELETE USERINFO");

    expect(result?.returnCode).toBeNull();
    expect(result?.raw).toBe("ID=9&CMD=DATA DELETE USERINFO");
  });
});

describe("parseCommandResult", () => {
  it("reads a success", () => {
    expect(parseCommandResult("ID=42&Return=0&CMD=DATA UPDATE USERINFO")).toEqual([
      {
        id: 42,
        returnCode: 0,
        command: "DATA UPDATE USERINFO",
        raw: "ID=42&Return=0&CMD=DATA UPDATE USERINFO",
      },
    ]);
  });

  it("reads several outcomes from one post", () => {
    const results = parseCommandResult("ID=42&Return=0&CMD=DATA\nID=43&Return=-1&CMD=DATA");

    expect(results.map((r) => [r.id, r.returnCode])).toEqual([
      [42, 0],
      [43, -1],
    ]);
  });

  it("keeps a failure code rather than assuming success", () => {
    // A terminal out of template memory accepts the command, runs it, and
    // reports a negative code here. Defaulting a missing or odd code to 0
    // would mark a fingerprint delivered that never arrived.
    const [result] = parseCommandResult("ID=44&Return=-14&CMD=DATA UPDATE BIODATA");

    expect(result?.returnCode).toBe(-14);
  });

  it("ignores a line with no id, since nothing can be closed out", () => {
    expect(parseCommandResult("Return=0&CMD=DATA")).toEqual([]);
  });
});
