/**
 * Asks a terminal to say what it is holding.
 *
 * A terminal tells us about a worker when somebody is enrolled, and never
 * again. So RadoFlow's picture of a box is only as complete as the uploads it
 * happened to be listening for at the time — and when the parser learns a new
 * record type, everything already on the wall is invisible to it until the box
 * is asked afresh. That is what this is for: it is how the faces enrolled
 * before RadoFlow understood `FACE` get captured.
 *
 * Two commands do it, and they must go in this order — a terminal discards a
 * template for a PIN it has not been introduced to:
 *
 *   DATA QUERY USERINFO     every user record
 *   DATA QUERY FINGERTMP    every stored template
 *
 * The second one is not only fingerprints, whatever its name suggests. On
 * 11 September the two gates answered it with 1417 and 1370 `FACE` lines
 * alongside their fingerprints, which is the evidence that no separate face
 * query is needed — and worth knowing, because guessing at an undocumented
 * ADMS verb is how a terminal gets handed something it reads as corrupt.
 *
 * **This is the shape of the upload flood.** A gate answers with several
 * hundred uploads over about twelve minutes. That is survivable now — uploads
 * are planned in memory and written in bulk, an echo is refused, and a
 * terminal is never sent a slot it already holds — but it is not something to
 * set running and walk away from. Ask one terminal at a time and watch it.
 *
 * Dry by default:
 *
 *   node scripts/ask-terminal-for-roster.mjs                  # what it would ask, and of whom
 *   node scripts/ask-terminal-for-roster.mjs --apply .201
 *   node scripts/ask-terminal-for-roster.mjs --apply .201 .202
 */

import { existsSync, readFileSync } from "node:fs";

/** In order: a terminal discards a template for a PIN it has never seen. */
const QUERIES = ["DATA QUERY USERINFO", "DATA QUERY FINGERTMP"];

const APPLY = process.argv.includes("--apply");
const WANTED = process.argv.slice(2).filter((arg) => !arg.startsWith("--"));

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

async function get(path) {
  const response = await fetch(`${URL_BASE}/rest/v1/${path}`, { headers: HEADERS });
  if (!response.ok) throw new Error(`${path}: ${response.status} ${await response.text()}`);
  return response.json();
}

/*
 * Wrapped rather than run at the top level: `process.exit` while fetch still
 * holds a keep-alive socket aborts the process on Windows with a libuv
 * assertion, which makes a clean dry run look like a crash.
 */
async function main() {
  const devices = await get(
    "devices?select=id,name,ip_address,mode,status,last_seen_at&is_active=is.true&order=ip_address",
  );

  /** Matched on any distinctive part of the address or name, so `.201` is enough. */
  const chosen = devices.filter((d) => {
    if (WANTED.length === 0) return false;
    const haystack = `${d.ip_address ?? ""} ${d.name}`.toLowerCase();
    return WANTED.some((want) => haystack.includes(want.toLowerCase().replace(/^\./, "")));
  });

  if (WANTED.length === 0 || chosen.length === 0) {
    console.log("Name at least one terminal. Active terminals:\n");
    for (const d of devices) {
      const seen = d.last_seen_at ? new Date(d.last_seen_at).toISOString().slice(11, 19) : "never";
      console.log(
        `  ${d.ip_address ?? "—"}  ${d.name}  [${d.mode}, ${d.status}, last seen ${seen}]`,
      );
    }
    console.log("\n  e.g. node scripts/ask-terminal-for-roster.mjs --apply .201");
    if (WANTED.length > 0) process.exitCode = 1;
    return;
  }

  console.log("Would ask:\n");
  for (const d of chosen) {
    console.log(`  ${d.ip_address ?? "—"} ${d.name}`);
    for (const q of QUERIES) console.log(`      ${q}`);
  }

  /*
   * A terminal that is not collecting its queue will not answer, and the request
   * will sit there looking like progress. Said plainly rather than blocked on:
   * a box can be mid-reboot, and refusing to queue would be the wrong call.
   */
  const outstanding = await get(
    `device_commands?device_id=in.(${chosen.map((d) => d.id).join(",")})` +
      "&status=in.(pending,sent)&select=device_id",
  );
  if (outstanding.length > 0) {
    const stuck = new Set(outstanding.map((r) => r.device_id));
    console.log("");
    for (const d of chosen.filter((x) => stuck.has(x.id))) {
      const n = outstanding.filter((r) => r.device_id === d.id).length;
      console.log(`  ! ${d.name} has ${n} instruction(s) it has not collected yet.`);
    }
    console.log("    Adding to a queue that is not moving will not make it move.");
  }

  if (!APPLY) {
    console.log("\nDry run. Pass --apply to queue these.");
    return;
  }

  const response = await fetch(`${URL_BASE}/rest/v1/rpc/queue_device_commands`, {
    method: "POST",
    headers: HEADERS,
    body: JSON.stringify({
      p_commands: chosen.flatMap((d) =>
        QUERIES.map((body) => ({ device_id: d.id, kind: "roster.query", body })),
      ),
    }),
  });

  if (!response.ok) throw new Error(`Could not queue: ${response.status} ${await response.text()}`);

  console.log(`\nQueued ${await response.json()} instruction(s).`);
  console.log("Expect several hundred uploads over roughly twelve minutes per terminal.");
}

await main();
