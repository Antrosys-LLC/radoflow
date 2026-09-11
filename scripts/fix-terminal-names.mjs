/**
 * Makes the terminals spell a worker's name the way RadoFlow does.
 *
 * The two gates were enrolled at different times by different people, so a
 * worker can be on the wall under two spellings: `MAJID SHAH` on the check-in
 * gate, `Majidshah` on the check-out. Both scan fine — a terminal matches on
 * the enrolment number, never the name — but a supervisor reading one screen
 * against the other cannot tell whether that is one man or two, and neither
 * can anyone reading an export.
 *
 * The name is the one field on a user record RadoFlow has always owned: it is
 * typed in the office and nothing in the sync path has ever learned it from a
 * terminal. Privilege and card are the opposite — those are learned from the
 * hardware — so this rewrites `Name` and copies every other field from the
 * record that terminal already holds. A worker with a card keeps it.
 *
 * Two kinds of difference come out of this, and they are not the same claim.
 * `Majidshah` and `MAJID SHAH` are one name written twice. `Sameer` and
 * `ZAMEER`, or `Ranaahsan` and `RANA HUSSAIN`, are two different names, and
 * only somebody who knows the man can say which is his — RadoFlow's spelling
 * comes from the workers list, the terminal's from whoever enrolled him, and
 * neither is automatically right. A difference that survives stripping case
 * and punctuation is therefore reported and left alone unless asked for.
 *
 * Not folded into the roster merge and not made automatic. The merge is
 * additive by design, and a standing rule that overwrote every name would also
 * overwrite the ones that differ deliberately: PIN 1 and PIN 2 are one person
 * under two names, which is how the factory wants them.
 *
 * Dry by default — it prints what it would change and writes nothing:
 *
 *   node scripts/fix-terminal-names.mjs                          # show both lists
 *   node scripts/fix-terminal-names.mjs --apply                  # formatting only
 *   node scripts/fix-terminal-names.mjs --apply --include-renames
 */

import { existsSync, readFileSync } from "node:fs";

/**
 * Enrolment numbers this never touches.
 *
 * The factory's two administrator accounts. They are one person under two
 * names — `UmarCEO` on the check-in gate, `Antrosys` on the check-out — and
 * that difference is intentional, so aligning them would undo a decision
 * rather than repair a mistake.
 */
const LEAVE_ALONE = new Set(["1", "2"]);

const APPLY = process.argv.includes("--apply");
const INCLUDE_RENAMES = process.argv.includes("--include-renames");

function loadEnv() {
  if (!existsSync(".env.local")) throw new Error(".env.local not found — run from the repo root");

  const env = {};
  for (const line of readFileSync(".env.local", "utf8").split(/\r?\n/)) {
    if (!line.includes("=") || line.trim().startsWith("#")) continue;
    const at = line.indexOf("=");
    env[line.slice(0, at).trim()] = line
      .slice(at + 1)
      .trim()
      .replace(/^["']|["']$/g, "");
  }
  return env;
}

const env = loadEnv();
const URL_BASE = env.NEXT_PUBLIC_SUPABASE_URL;
const KEY = env.SUPABASE_SERVICE_ROLE_KEY;
if (!URL_BASE || !KEY)
  throw new Error("NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY unset");

const HEADERS = { apikey: KEY, Authorization: `Bearer ${KEY}`, "content-type": "application/json" };

/** PostgREST caps a response at 1000 rows; the inventory is larger than that. */
async function readAll(path) {
  const rows = [];
  for (let from = 0; ; from += 1000) {
    const response = await fetch(`${URL_BASE}/rest/v1/${path}`, {
      headers: { ...HEADERS, Range: `${from}-${from + 999}` },
    });
    if (!response.ok) throw new Error(`${path}: ${response.status} ${await response.text()}`);
    const page = await response.json();
    rows.push(...page);
    if (page.length < 1000) return rows;
  }
}

/**
 * The same USERINFO body under a different name.
 *
 * Tabs and newlines are stripped rather than escaped and the result cut to 24
 * characters, because that is what `userInfoCommand` in
 * src/lib/devices/roster-plan.ts does. A body built to a different rule here
 * would differ from the one the next upload produces, and the two would
 * correct each other for ever.
 */
function withName(body, name) {
  const clean = name.replace(/[\t\r\n]/g, " ").slice(0, 24);
  return body.replace(/(^|\t)Name=[^\t]*/, (_match, lead) => `${lead}Name=${clean}`);
}

function nameOf(body) {
  return body.match(/(?:^|\t)Name=([^\t]*)/)?.[1] ?? "";
}

/**
 * The name with everything that is a matter of writing rather than of naming
 * taken out. Two records that agree on this are one name typed by two people;
 * two that do not are a question for the office.
 */
function sameName(a, b) {
  const bare = (value) => value.toLowerCase().replace(/[^a-z0-9]/g, "");
  return bare(a) === bare(b);
}

/*
 * Wrapped rather than run at the top level: `process.exit` while fetch still
 * holds a keep-alive socket aborts the process on Windows with a libuv
 * assertion, which makes a clean dry run look like a crash.
 */
async function main() {
  const devices = await readAll(
    "devices?select=id,name,ip_address&is_active=is.true&order=ip_address",
  );
  const deviceName = new Map(devices.map((d) => [d.id, `${d.ip_address ?? "?"} ${d.name}`]));

  const profiles = await readAll(
    "profiles?select=id,device_pin,full_name,status&device_pin=not.is.null&status=eq.active",
  );
  const byPin = new Map(profiles.map((p) => [p.device_pin, p]));

  const held = await readAll(
    "device_inventory?select=device_id,pin,command_body&record_type=eq.user",
  );

  const corrections = [];
  for (const row of held) {
    if (LEAVE_ALONE.has(row.pin)) continue;

    // A PIN with nobody behind it is a worker the office has not entered yet.
    // RadoFlow has no name for them, so it has no better spelling to offer.
    const profile = byPin.get(row.pin);
    if (!profile?.full_name) continue;

    const corrected = withName(row.command_body, profile.full_name);
    if (corrected === row.command_body) continue;

    const was = nameOf(row.command_body);
    const now = nameOf(corrected);

    corrections.push({
      device_id: row.device_id,
      kind: "user.update",
      body: corrected,
      profile_id: profile.id,
      pin: row.pin,
      was,
      now,
      rename: !sameName(was, now),
    });
  }

  if (corrections.length === 0) {
    console.log("Every terminal already spells every name the way RadoFlow does.");
    return;
  }

  corrections.sort((a, b) => Number(a.pin) - Number(b.pin));
  const formatting = corrections.filter((c) => !c.rename);
  const renames = corrections.filter((c) => c.rename);

  function show(list) {
    for (const c of list) {
      const where = deviceName.get(c.device_id) ?? c.device_id;
      console.log(`  ${where}  PIN ${c.pin}: ${c.was} -> ${c.now}`);
    }
  }

  console.log(`Same name, written differently — ${formatting.length} record(s):\n`);
  show(formatting);

  if (renames.length > 0) {
    console.log(`\nA different name, not a different spelling — ${renames.length} record(s):\n`);
    show(renames);
    console.log("\n  Left alone. Check these against the men, then re-run with --include-renames.");
  }

  const queue = INCLUDE_RENAMES ? corrections : formatting;

  if (queue.length === 0) {
    console.log("\nNothing to queue without --include-renames.");
    return;
  }

  const perDevice = new Map();
  for (const c of queue) perDevice.set(c.device_id, (perDevice.get(c.device_id) ?? 0) + 1);
  console.log("");
  for (const [id, count] of perDevice)
    console.log(`  ${deviceName.get(id) ?? id}: ${count} to queue`);

  if (!APPLY) {
    console.log("\nDry run. Pass --apply to queue these.");
    return;
  }

  /*
   * Queued with the profile id, which is what carries a user record past the
   * rule that a terminal is never sent one it already holds. That rule stops one
   * terminal overwriting another; this is the office, which owns the name.
   */
  const response = await fetch(`${URL_BASE}/rest/v1/rpc/queue_device_commands`, {
    method: "POST",
    headers: HEADERS,
    body: JSON.stringify({
      p_commands: queue.map(({ device_id, kind, body, profile_id }) => ({
        device_id,
        kind,
        body,
        profile_id,
      })),
    }),
  });

  if (!response.ok) throw new Error(`Could not queue: ${response.status} ${await response.text()}`);

  console.log(
    `\nQueued ${await response.json()} instruction(s). Each terminal applies them on its next poll.`,
  );
}

await main();
