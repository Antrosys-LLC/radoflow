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
  dialect: "fp" | "biodata" | "face";
  payload: string;
  template_size: number | null;
  is_duress: boolean;
  source_device_id: string;
}

export interface QueuedCommand {
  device_id: string;
  kind: "user.update" | "biometric.update";
  body: string;
  /*
   * Set only where the instruction is RadoFlow asserting something about a
   * person it knows, rather than one terminal's record being copied to
   * another. `app.queue_device_command` reads it as exactly that: a relayed
   * user record is refused for a PIN the target already holds, and one carrying
   * a profile is sent anyway, because the office is the authority on a name, a
   * card and a privilege.
   */
  profile_id?: string;
}

/**
 * One slot on one terminal: a user record, or a single finger.
 *
 * The database never sends a terminal a slot it holds, so these rows are what
 * make a merge additive and an echo harmless. The slot identity here must match
 * `app.command_slot` in the migration exactly.
 */
export interface InventoryRow {
  device_id: string;
  pin: string;
  record_type: "user" | "template";
  bio_type: number;
  finger_index: number;
  command_body: string;
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
  /** Everything the uploading terminal just showed it holds, known people and strangers alike. */
  inventory: InventoryRow[];
  /**
   * Sent back to the terminal that just uploaded, for people it holds at a
   * lower privilege than RadoFlow does. Its own record, its own name and card,
   * with only `Pri` raised.
   */
  adminCorrections: QueuedCommand[];
  identityUpdates: IdentityUpdate[];
  deletions: string[];
  unknown: string[];
  matchedUsers: number;
}

/** A USERINFO record as the terminal described the person. */
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

export function templateCommand(template: {
  dialect: "fp" | "biodata" | "face";
  payload: string;
}): string {
  const verb =
    template.dialect === "fp"
      ? "DATA UPDATE FINGERTMP"
      : template.dialect === "face"
        ? "DATA UPDATE FACE"
        : "DATA UPDATE BIODATA";
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
  const inventory = new Map<string, InventoryRow>();
  const identityUpdates = new Map<string, IdentityUpdate>();
  const adminCorrections = new Map<string, QueuedCommand>();
  const unknown = new Set<string>();
  const matchedPins = new Set<string>();

  const holds = (row: Omit<InventoryRow, "device_id">) => {
    inventory.set(`${row.pin}|${row.record_type}|${row.bio_type}|${row.finger_index}`, {
      device_id: sourceDeviceId,
      ...row,
    });
  };

  const relay = (kind: QueuedCommand["kind"], body: string) => {
    for (const deviceId of targetDeviceIds) {
      if (deviceId === sourceDeviceId) continue;
      // Keyed on target and body, so a batch naming the same stranger twice
      // queues them once.
      relays.set(`${deviceId}\n${body}`, { device_id: deviceId, kind, body });
    }
  };

  for (const user of parsed.users) {
    const body = userInfoCommand(user);
    holds({
      pin: user.deviceUserId,
      record_type: "user",
      bio_type: 0,
      finger_index: -1,
      command_body: body,
    });

    const profile = profilesByPin.get(user.deviceUserId);

    if (!profile) {
      unknown.add(user.deviceUserId);
      relay("user.update", body);
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
     *
     * Privilege is learned upward only. The check-in gate holds PIN 1 as an
     * ordinary user while the check-out gate holds the same person as an
     * administrator; reading the gate's `Pri=0` as the truth would strip the
     * estate of its administrator on the strength of the one box that had
     * drifted, and the next office edit would push that demotion to all three.
     * A terminal saying somebody has less power than RadoFlow granted them is
     * describing its own gap, not a decision.
     */
    const privilege = Math.max(user.privilege, profile.privilege);
    const card = user.cardNumber ?? profile.card;
    if (privilege !== profile.privilege || card !== profile.card) {
      identityUpdates.set(profile.id, { profileId: profile.id, privilege, card });
    }

    /*
     * And the gap is closed on the box that has it, using that box's own
     * record so only `Pri` changes. PIN 1 is one person under two names on the
     * two gates — "UmarCEO" on the check-in, "Antrosys" on the check-out — and
     * restoring their menu access must not rename them on either.
     */
    if (user.privilege < profile.privilege) {
      adminCorrections.set(user.deviceUserId, {
        device_id: sourceDeviceId,
        kind: "user.update",
        body: userInfoCommand({ ...user, privilege: profile.privilege }),
        profile_id: profile.id,
      });
    }
  }

  for (const template of parsed.biometrics) {
    const body = templateCommand(template);
    holds({
      pin: template.deviceUserId,
      record_type: "template",
      bio_type: template.bioType,
      finger_index: template.fingerIndex,
      command_body: body,
    });

    const profile = profilesByPin.get(template.deviceUserId);

    if (!profile) {
      unknown.add(template.deviceUserId);
      relay("biometric.update", body);
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
    inventory: [...inventory.values()],
    adminCorrections: [...adminCorrections.values()],
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
