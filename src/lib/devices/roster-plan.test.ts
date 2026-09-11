import { describe, expect, it } from "vitest";

import { chunk, planRosterUpload, userInfoCommand, type KnownProfile } from "./roster-plan";
import { parseOperlog } from "./zkteco/userinfo";

const GATE_IN = "dev-in";
const GATE_OUT = "dev-out";
const KITCHEN = "dev-kitchen";
const ALL = [GATE_IN, GATE_OUT, KITCHEN];

const TMP_A = "QUFBQUFBQUFBQUFB";
const TMP_B = "QkJCQkJCQkJCQkJC";

function profiles(...rows: KnownProfile[]): Map<string, KnownProfile> {
  return new Map(rows.map((row) => [row.devicePin, row]));
}

const ASLAM: KnownProfile = { id: "p-aslam", devicePin: "2070", privilege: 0, card: null };
const SUPERVISOR: KnownProfile = { id: "p-sup", devicePin: "1", privilege: 14, card: "998877" };

describe("planRosterUpload — known workers", () => {
  it("stores their template and enrols them on the uploading terminal", () => {
    const plan = planRosterUpload(
      parseOperlog(
        `USER PIN=2070\tName=Aslam\tPri=0\tCard=\nFP PIN=2070\tFID=6\tSize=1200\tValid=1\tTMP=${TMP_A}`,
      ),
      GATE_IN,
      profiles(ASLAM),
      ALL,
    );

    expect(plan.matchedUsers).toBe(1);
    expect(plan.enrollments).toEqual([
      { device_id: GATE_IN, device_user_id: "2070", profile_id: "p-aslam" },
    ]);
    expect(plan.templates).toHaveLength(1);
    expect(plan.templates[0]).toMatchObject({
      profile_id: "p-aslam",
      finger_index: 6,
      source_device_id: GATE_IN,
    });
    // Known people are fanned out by the database trigger, never relayed here.
    expect(plan.relays).toEqual([]);
  });

  it("keeps one row per finger when an upload repeats it", () => {
    // Postgres refuses an upsert touching the same row twice in one statement;
    // one failed statement fails the batch, and a failed batch is resent.
    const plan = planRosterUpload(
      parseOperlog(
        [`FP PIN=2070\tFID=6\tTMP=${TMP_A}`, `FP PIN=2070\tFID=6\tTMP=${TMP_B}`].join("\n"),
      ),
      GATE_IN,
      profiles(ASLAM),
      ALL,
    );

    expect(plan.templates).toHaveLength(1);
    expect(plan.templates[0]?.payload).toContain(TMP_B);
  });

  it("keeps two different fingers of the same person apart", () => {
    const plan = planRosterUpload(
      parseOperlog(
        [`FP PIN=2070\tFID=6\tTMP=${TMP_A}`, `FP PIN=2070\tFID=7\tTMP=${TMP_B}`].join("\n"),
      ),
      GATE_IN,
      profiles(ASLAM),
      ALL,
    );

    expect(plan.templates.map((t) => t.finger_index).sort()).toEqual([6, 7]);
  });
});

describe("planRosterUpload — terminal privilege and cards", () => {
  it("records nothing when the terminal agrees with RadoFlow", () => {
    const plan = planRosterUpload(
      parseOperlog("USER PIN=1\tName=Sup\tPri=14\tCard=998877"),
      GATE_IN,
      profiles(SUPERVISOR),
      ALL,
    );

    expect(plan.identityUpdates).toEqual([]);
  });

  it("learns that somebody administers a terminal", () => {
    // Every push used to say Pri=0, which demoted supervisors on the hardware.
    const plan = planRosterUpload(
      parseOperlog("USER PIN=2070\tName=Aslam\tPri=14\tCard="),
      GATE_IN,
      profiles(ASLAM),
      ALL,
    );

    expect(plan.identityUpdates).toEqual([{ profileId: "p-aslam", privilege: 14, card: null }]);
  });

  it("never wipes a stored card because a terminal reported none", () => {
    // A person carded at the gate but not yet at the kitchen is reported with
    // an empty Card by the kitchen. That is not a request to remove it.
    const plan = planRosterUpload(
      parseOperlog("USER PIN=1\tName=Sup\tPri=14\tCard="),
      KITCHEN,
      profiles(SUPERVISOR),
      ALL,
    );

    expect(plan.identityUpdates).toEqual([]);
  });

  it("takes a new card when one is reported", () => {
    const plan = planRosterUpload(
      parseOperlog("USER PIN=1\tName=Sup\tPri=14\tCard=112233"),
      GATE_IN,
      profiles(SUPERVISOR),
      ALL,
    );

    expect(plan.identityUpdates).toEqual([{ profileId: "p-sup", privilege: 14, card: "112233" }]);
  });
});

describe("planRosterUpload — workers RadoFlow does not know", () => {
  it("relays them to every other push terminal and never back to the source", () => {
    const plan = planRosterUpload(
      parseOperlog(`USER PIN=4018\tName=Arslan\tPri=0\tCard=\nFP PIN=4018\tFID=6\tTMP=${TMP_A}`),
      KITCHEN,
      profiles(),
      ALL,
    );

    expect(plan.unknown).toEqual(["4018"]);
    // Each stranger is a user record and a fingerprint, so two rows per target.
    expect([...new Set(plan.relays.map((r) => r.device_id))].sort()).toEqual(
      [GATE_IN, GATE_OUT].sort(),
    );
    expect(plan.relays.every((r) => r.device_id !== KITCHEN)).toBe(true);
    expect(plan.relays.filter((r) => r.kind === "user.update")).toHaveLength(2);
    expect(plan.relays.filter((r) => r.kind === "biometric.update")).toHaveLength(2);
    // Nothing to attach a template to, so nothing is stored.
    expect(plan.templates).toEqual([]);
    expect(plan.enrollments).toEqual([]);
  });

  it("relays the same stranger once however many times the upload names them", () => {
    const line = "USER PIN=4018\tName=Arslan\tPri=0\tCard=";
    const plan = planRosterUpload(
      parseOperlog([line, line, line].join("\n")),
      KITCHEN,
      profiles(),
      ALL,
    );

    expect(plan.relays).toHaveLength(2);
  });

  it("relays to nobody while every terminal is paused in pull mode", () => {
    // Pull-mode terminals are not in the target list, which is how fan-out is
    // switched off without a deploy.
    const plan = planRosterUpload(
      parseOperlog("USER PIN=4018\tName=Arslan\tPri=0\tCard="),
      KITCHEN,
      profiles(),
      [],
    );

    expect(plan.unknown).toEqual(["4018"]);
    expect(plan.relays).toEqual([]);
  });

  it("remembers that the uploading terminal already holds what it reported", () => {
    // So a later echo from another terminal is never relayed home to it.
    const plan = planRosterUpload(
      parseOperlog(`USER PIN=4018\tName=Arslan\tPri=0\tCard=\nFP PIN=4018\tFID=6\tTMP=${TMP_A}`),
      KITCHEN,
      profiles(),
      ALL,
    );

    expect(plan.reported.map((r) => r.device_id)).toEqual([KITCHEN, KITCHEN]);
    expect(plan.reported.map((r) => r.body)).toEqual([
      userInfoCommand({ deviceUserId: "4018", name: "Arslan", privilege: 0, cardNumber: null }),
      `DATA UPDATE FINGERTMP PIN=4018\tFID=6\tTMP=${TMP_A}`,
    ]);
  });

  it("still records what was reported while fan-out is paused", () => {
    const plan = planRosterUpload(
      parseOperlog("USER PIN=4018\tName=Arslan\tPri=0\tCard="),
      KITCHEN,
      profiles(),
      [],
    );

    expect(plan.relays).toEqual([]);
    expect(plan.reported).toHaveLength(1);
  });

  it("carries the source terminal's privilege and card in the relay", () => {
    expect(
      userInfoCommand({ deviceUserId: "4018", name: "Arslan", privilege: 14, cardNumber: "5566" }),
    ).toBe(
      "DATA UPDATE USERINFO PIN=4018\tName=Arslan\tPri=14\tPasswd=\tCard=5566\tGrp=1\tTZ=0000000000000000\tVerify=-1",
    );
  });

  it("strips a tab from a name rather than let it forge a field", () => {
    expect(
      userInfoCommand({ deviceUserId: "4018", name: "Ars\tlan", privilege: 0, cardNumber: null }),
    ).toContain("Name=Ars lan\tPri=0");
  });
});

describe("planRosterUpload — deletions", () => {
  it("lists each deleted PIN once", () => {
    const line = "OPLOG 9\t1\t2026-09-11 08:15:00\t2070\t0\t0\t0";
    const plan = planRosterUpload(
      parseOperlog([line, line].join("\n")),
      GATE_OUT,
      profiles(ASLAM),
      ALL,
    );

    expect(plan.deletions).toEqual(["2070"]);
  });
});

describe("chunk", () => {
  it("slices without losing or repeating anything", () => {
    expect(chunk([1, 2, 3, 4, 5], 2)).toEqual([[1, 2], [3, 4], [5]]);
    expect(chunk([], 100)).toEqual([]);
  });
});
