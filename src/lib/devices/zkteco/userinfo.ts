/**
 * The other half of the ADMS conversation: what a terminal tells us about its
 * own roster.
 *
 * `parseAttlog` in ./iclock.ts handles punches, which are the traffic this
 * system was built for. But a terminal also uploads to the same endpoint with
 * `table=OPERLOG` whenever somebody is enrolled, edited or deleted *on the
 * box* — a supervisor holding down MENU at the gate at six in the morning,
 * which is how most people actually get added.
 *
 * Those uploads are what make the three terminals converge. Without parsing
 * them, a person enrolled at the gate exists only at the gate.
 *
 * Every parser here is deliberately forgiving. These lines come off firmware
 * that varies by model and build, with fields appearing and disappearing
 * between versions, and a strict parser's reward for correctness is a factory
 * where nobody can clock in. An unrecognised line is skipped, never fatal.
 */

/** A user record the terminal holds: `USER PIN=1\tName=Aslam\tPri=0...` */
export interface DeviceUserRecord {
  deviceUserId: string;
  name: string;
  privilege: number;
  cardNumber: string | null;
}

/**
 * An enrolled template.
 *
 * `payload` is the line's field list exactly as the terminal wrote it, with
 * the leading verb removed. It is stored and replayed as-is rather than
 * rebuilt from the parsed fields, so a field this code does not know about
 * still reaches the other terminals — the template is opaque binary and the
 * surrounding fields tell the receiving box how to read it.
 */
export interface DeviceBiometricRecord {
  deviceUserId: string;
  /**
   * 'fp' = older `FP PIN=` line; 'biodata' = newer `BIODATA Pin=` line;
   * 'face' = one part of an enrolled face, `FACE PIN=`.
   */
  dialect: "fp" | "biodata" | "face";
  /** 1 fingerprint, 2 face, 9 palm — the terminal's own numbering. */
  bioType: number;
  fingerIndex: number;
  templateSize: number | null;
  isDuress: boolean;
  payload: string;
}

/** A user deleted on the terminal itself. */
export interface DeviceUserDeletion {
  deviceUserId: string;
}

export interface OperlogResult {
  users: DeviceUserRecord[];
  biometrics: DeviceBiometricRecord[];
  deletions: DeviceUserDeletion[];
  /** Lines recognised as a known verb but unusable, e.g. a template with no PIN. */
  skipped: number;
}

/**
 * Splits `Key=value` pairs into a lookup with lower-cased keys.
 *
 * Case folding is not cosmetic: the same firmware family writes `PIN` on a
 * USER line and `Pin` on a BIODATA line, and `TMP` against `Tmp`. Matching
 * exactly would parse one dialect and silently drop the other.
 *
 * Values are taken up to the first `=` only on the key side — a base64
 * template ends in `=` padding, and splitting on every `=` would truncate the
 * one field that must survive intact.
 */
function fields(text: string): Map<string, string> {
  const map = new Map<string, string>();

  for (const part of text.split("\t")) {
    const at = part.indexOf("=");
    if (at <= 0) continue;
    map.set(part.slice(0, at).trim().toLowerCase(), part.slice(at + 1));
  }

  return map;
}

function toInt(value: string | undefined, fallback: number): number {
  const parsed = Number.parseInt((value ?? "").trim(), 10);
  return Number.isFinite(parsed) ? parsed : fallback;
}

/**
 * A terminal user id must be digits.
 *
 * The device stores it as a number. Anything else is either a parse that has
 * gone wrong or a value the terminal could not have produced, and attaching a
 * fingerprint to it would put one person's finger on another person's record.
 */
export function isDevicePin(value: string | undefined): value is string {
  return typeof value === "string" && /^[0-9]{1,9}$/.test(value);
}

/**
 * Parses an OPERLOG upload.
 *
 * One body mixes verbs freely — a new enrolment arrives as a `USER` line
 * followed by one `FP`/`BIODATA` line per finger, often with unrelated `OPLOG`
 * audit rows interleaved.
 */
export function parseOperlog(body: string): OperlogResult {
  const users: DeviceUserRecord[] = [];
  const biometrics: DeviceBiometricRecord[] = [];
  const deletions: DeviceUserDeletion[] = [];
  let skipped = 0;

  for (const rawLine of body.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line) continue;

    // The verb is separated from its fields by a space, and only the first
    // one: `DATA UPDATE USERINFO` never appears inbound, but `OPLOG 9` puts a
    // number where a field list would be.
    const space = line.indexOf(" ");
    if (space < 0) continue;

    const verb = line.slice(0, space).toUpperCase();
    const rest = line.slice(space + 1);

    switch (verb) {
      case "USER": {
        const f = fields(rest);
        const pin = f.get("pin")?.trim();
        if (!isDevicePin(pin)) {
          skipped += 1;
          break;
        }
        users.push({
          deviceUserId: pin,
          name: (f.get("name") ?? "").trim(),
          privilege: toInt(f.get("pri"), 0),
          cardNumber: (f.get("card") ?? "").trim() || null,
        });
        break;
      }

      case "FP": {
        const f = fields(rest);
        const pin = f.get("pin")?.trim();
        const template = f.get("tmp");
        if (!isDevicePin(pin) || !template) {
          skipped += 1;
          break;
        }
        biometrics.push({
          deviceUserId: pin,
          dialect: "fp",
          bioType: 1, // an FP line is always a fingerprint; that is the verb
          fingerIndex: toInt(f.get("fid"), 0),
          templateSize: f.has("size") ? toInt(f.get("size"), 0) : null,
          isDuress: toInt(f.get("duress"), 0) === 1,
          payload: rest,
        });
        break;
      }

      case "BIODATA": {
        const f = fields(rest);
        const pin = f.get("pin")?.trim();
        const template = f.get("tmp");
        if (!isDevicePin(pin) || !template) {
          skipped += 1;
          break;
        }
        biometrics.push({
          deviceUserId: pin,
          dialect: "biodata",
          bioType: toInt(f.get("type"), 1),
          // `No` is the finger on this firmware; `Index` is the template slot
          // within it, and several builds send only one of the two.
          fingerIndex: toInt(f.get("no") ?? f.get("index"), 0),
          templateSize: f.has("size") ? toInt(f.get("size"), 0) : null,
          isDuress: toInt(f.get("duress"), 0) === 1,
          payload: rest,
        });
        break;
      }

      case "OPLOG": {
        const deleted = deletedPinFromOplog(rest);
        if (deleted) deletions.push({ deviceUserId: deleted });
        break;
      }

      /*
       * One part of an enrolled face. The MB460 stores a face as up to twelve
       * parts, FID 0-11, one line each. Each part is synced like a finger, as
       * Type 2 at its FID. This parser once dropped them, which left everybody
       * who clocks in by face unable to at the other terminals.
       */
      case "FACE": {
        const f = fields(rest);
        const pin = f.get("pin")?.trim();
        const template = f.get("tmp");
        if (!isDevicePin(pin) || !template) {
          skipped += 1;
          break;
        }
        biometrics.push({
          deviceUserId: pin,
          dialect: "face",
          bioType: 2,
          fingerIndex: toInt(f.get("fid"), 0),
          templateSize: f.has("size") ? toInt(f.get("size"), 0) : null,
          isDuress: false,
          payload: rest,
        });
        break;
      }

      // USERPIC, ATTPHOTO, WORKCODE and the rest are real records this system
      // has no use for. Ignored rather than counted as skipped — they are not
      // failures.
      default:
        break;
    }
  }

  return { users, biometrics, deletions, skipped };
}

/**
 * ZKTeco operation-log code for deleting a user.
 *
 * The audit codes are a fixed table in the firmware, and 9 has meant "delete
 * user" across every build in the field. Only this one is acted on: 10 deletes
 * a single fingerprint and 25 clears every user, and both are destructive
 * enough that mirroring them automatically across the other two terminals is
 * worse than leaving them for a person to confirm.
 */
const OPLOG_DELETE_USER = 9;

/**
 * Reads a deletion out of an audit line.
 *
 * Shape is `OPLOG <op>\t<operator>\t<time>\t<value1>\t<value2>\t<value3>`,
 * where for a deletion `value1` is the PIN that was removed.
 */
export function deletedPinFromOplog(rest: string): string | null {
  const parts = rest.split("\t");
  if (toInt(parts[0], -1) !== OPLOG_DELETE_USER) return null;

  const pin = parts[3]?.trim();
  return isDevicePin(pin) ? pin : null;
}

/**
 * Rewrites the PIN in a stored template so it can be replayed under the
 * canonical number.
 *
 * A template captured at the gate carries whichever number that terminal used.
 * RadoFlow's copy is keyed to the person, and the person has one number
 * everywhere — so on the way out the PIN field is replaced and every other
 * field is left untouched.
 *
 * Anchored to a field boundary. A bare replace would also hit `PIN` inside a
 * base64 template, which is the one field that must not be edited.
 */
export function withPin(payload: string, pin: string): string {
  return payload
    .split("\t")
    .map((part) => {
      const at = part.indexOf("=");
      if (at <= 0) return part;
      const key = part.slice(0, at).trim().toLowerCase();
      return key === "pin" ? `${part.slice(0, at)}=${pin}` : part;
    })
    .join("\t");
}

/** Parses the `ID=..&Return=..&CMD=..` body a terminal posts to /iclock/devicecmd. */
export interface CommandResult {
  id: number | null;
  returnCode: number | null;
  command: string | null;
  /** The result exactly as the terminal wrote it, for when the fields above come back empty. */
  raw: string;
}

/**
 * Forgiving on purpose. Firmware varies in key case (`ID`, `Id`), and some
 * builds report several results on one line rather than one per line, so each
 * line is split wherever a new `ID=` begins.
 */
export function parseCommandResult(body: string): CommandResult[] {
  const results: CommandResult[] = [];

  for (const rawLine of body.split(/\r?\n/)) {
    for (const segment of rawLine.trim().split(/&(?=id=)/i)) {
      const line = segment.trim();
      if (!line) continue;

      const params = new Map<string, string>();
      for (const [key, value] of new URLSearchParams(line)) {
        const lower = key.trim().toLowerCase();
        if (!params.has(lower)) params.set(lower, value);
      }

      const id = params.get("id");
      if (id === undefined) continue;

      const parsedId = Number.parseInt(id, 10);
      const returnRaw = params.get("return");
      const parsedReturn = returnRaw === undefined ? Number.NaN : Number.parseInt(returnRaw, 10);

      results.push({
        id: Number.isFinite(parsedId) ? parsedId : null,
        returnCode: Number.isFinite(parsedReturn) ? parsedReturn : null,
        command: params.get("cmd") ?? null,
        raw: line,
      });
    }
  }

  return results;
}
