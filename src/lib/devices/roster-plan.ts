import type { OperlogResult } from "./zkteco/userinfo";

/**
 * What a roster upload means, worked out before anything is written.
 *
 * Kept free of the database so the decisions can be tested on their own —
 * which records are ours, which are strangers to relay, which fingerprints to
 * keep when one upload names the same finger twice — and so the writes that
 * follow can be a handful of bulk calls rather than one per line.
 *
 * That second point is not tidiness. The first live day, a kitchen roster of
 * four hundred people was processed one database call at a time, took about a
 * hundred seconds, outlived the relay's thirty-second timeout, and was
 * resent by the terminal every thirty-five seconds for ten minutes. Every
 * resend relayed every unknown worker again.
 */

export interface KnownProfile {
  id: string;
  devicePin: string;
  privilege: number;
  card: string | null;
}

export interface EnrollmentRow {
  device_id: string;
  device_user_id: string;
  profile_id: string;
}

export interface TemplateRow {
  profile_id: string;
  bio_type: number;
  finger_index: number;
  dialect: "fp" | "biodata";
  payload: string;
  template_size: number | null;
  is_duress: boolean;
  source_device_id: string;
}

export interface QueuedCommand {
  device_id: string;
  kind: "user.update" | "biometric.update";
  body: string;
}

/** A relayed record the uploading terminal has just shown it already holds. */
export interface ReportedRecord {
  device_id: string;
  body: string;
}

export interface IdentityUpdate {
  profileId: string;
  privilege: number;
  card: string | null;
}

export interface RosterPlan {
  enrollments: EnrollmentRow[];
  templates: TemplateRow[];
  relays: QueuedCommand[];
  /**
   * What must never be queued back to the uploading terminal. A record another
   * terminal later reports again would otherwise be relayed home to the box it
   * started on.
   */
  reported: ReportedRecord[];
  identityUpdates: IdentityUpdate[];
  deletions: string[];
  unknown: string[];
  matchedUsers: number;
}

/** A USERINFO record for a worker RadoFlow does not know, as the terminal described them. */
export function userInfoCommand(user: {
  deviceUserId: string;
  name: string;
  privilege: number;
  cardNumber: string | null;
}): string {
  const fields = [
    `PIN=${user.deviceUserId}`,
    `Name=${user.name.replace(/[\t\r\n]/g, " ").slice(0, 24)}`,
    `Pri=${user.privilege}`,
    "Passwd=",
    `Card=${(user.cardNumber ?? "").replace(/[\t\r\n]/g, "")}`,
    "Grp=1",
    "TZ=0000000000000000",
    "Verify=-1",
  ];
  return `DATA UPDATE USERINFO ${fields.join("\t")}`;
}

export function templateCommand(template: { dialect: "fp" | "biodata"; payload: string }): string {
  const verb = template.dialect === "fp" ? "DATA UPDATE FINGERTMP" : "DATA UPDATE BIODATA";
  return `${verb} ${template.payload}`;
}

export function planRosterUpload(
  parsed: OperlogResult,
  sourceDeviceId: string,
  profilesByPin: ReadonlyMap<string, KnownProfile>,
  targetDeviceIds: readonly string[],
): RosterPlan {
  const enrollments = new Map<string, EnrollmentRow>();
  const templates = new Map<string, TemplateRow>();
  const relays = new Map<string, QueuedCommand>();
  const reported = new Map<string, ReportedRecord>();
  const identityUpdates = new Map<string, IdentityUpdate>();
  const unknown = new Set<string>();
  const matchedPins = new Set<string>();

  const relay = (kind: QueuedCommand["kind"], body: string) => {
    // Recorded even while every terminal is paused and nothing is relayed:
    // it is a fact about what this box holds, and it outlasts the pause.
    reported.set(body, { device_id: sourceDeviceId, body });

    for (const deviceId of targetDeviceIds) {
      if (deviceId === sourceDeviceId) continue;
      // Keyed on target and body, so a batch naming the same stranger twice
      // queues them once.
      relays.set(`${deviceId}\n${body}`, { device_id: deviceId, kind, body });
    }
  };

  for (const user of parsed.users) {
    const profile = profilesByPin.get(user.deviceUserId);

    if (!profile) {
      unknown.add(user.deviceUserId);
      relay("user.update", userInfoCommand(user));
      continue;
    }

    matchedPins.add(user.deviceUserId);
    enrollments.set(user.deviceUserId, {
      device_id: sourceDeviceId,
      device_user_id: user.deviceUserId,
      profile_id: profile.id,
    });

    /*
     * A privilege the terminal reports is the truth about who administers it;
     * RadoFlow has no screen for it. A card is taken only when one is reported.
     * An empty Card field is what firmware writes for "none on this box", and
     * a person enrolled with a card on the gate but not yet on the kitchen
     * would otherwise have it wiped the next time the kitchen uploads.
     */
    const card = user.cardNumber ?? profile.card;
    if (user.privilege !== profile.privilege || card !== profile.card) {
      identityUpdates.set(profile.id, { profileId: profile.id, privilege: user.privilege, card });
    }
  }

  for (const template of parsed.biometrics) {
    const profile = profilesByPin.get(template.deviceUserId);

    if (!profile) {
      unknown.add(template.deviceUserId);
      relay("biometric.update", templateCommand(template));
      continue;
    }

    /*
     * One row per person per finger, last one in the batch winning.
     *
     * Not a nicety: Postgres refuses an upsert that touches the same row twice
     * in one statement, so a terminal that repeats a finger inside one upload
     * would fail the whole batch — and a failed batch is resent.
     */
    templates.set(`${profile.id}:${template.bioType}:${template.fingerIndex}`, {
      profile_id: profile.id,
      bio_type: template.bioType,
      finger_index: template.fingerIndex,
      dialect: template.dialect,
      payload: template.payload,
      template_size: template.templateSize,
      is_duress: template.isDuress,
      source_device_id: sourceDeviceId,
    });
  }

  return {
    enrollments: [...enrollments.values()],
    templates: [...templates.values()],
    relays: [...relays.values()],
    reported: [...reported.values()],
    identityUpdates: [...identityUpdates.values()],
    deletions: [...new Set(parsed.deletions.map((d) => d.deviceUserId))],
    unknown: [...unknown],
    matchedUsers: matchedPins.size,
  };
}

/** Splits a list into slices of at most `size`. */
export function chunk<T>(items: readonly T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}
