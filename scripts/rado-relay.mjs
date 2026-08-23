#!/usr/bin/env node
/**
 * RadoFlow ADMS relay.
 *
 * Runs on a VPS with a static IPv4. Biometric terminals push to it over plain
 * HTTP at a numeric address, and it forwards each request to the RadoFlow
 * deployment over HTTPS.
 *
 * This exists because of three firmware constraints that together make a
 * direct push to a platform like Railway impossible:
 *
 *   1. The terminal's Server Address field accepts digits only, so a domain
 *      cannot be entered — it needs a literal IP.
 *   2. Railway (and most platforms) serve a domain from shared edge IPs that
 *      change, so there is no IP to enter.
 *   3. Most ZKTeco ADMS builds speak plain HTTP, not TLS.
 *
 * The relay also keeps DEVICE_INGEST_SECRET off the terminal entirely: the
 * device sends nothing secret, and the relay attaches the credential on the
 * way out. A terminal on a factory wall is not a good place to store a key.
 *
 * Dependency-free and un-transpiled, so it can be dropped onto a bare VPS with
 * nothing but Node installed.
 *
 * Usage:
 *   RELAY_UPSTREAM=https://your-app.up.railway.app \
 *   RELAY_SECRET=<same as DEVICE_INGEST_SECRET> \
 *   RELAY_PORT=8080 \
 *   node scripts/rado-relay.mjs
 */

import { createServer } from "node:http";

const UPSTREAM = (process.env.RELAY_UPSTREAM ?? "").replace(/\/+$/, "");
const SECRET = process.env.RELAY_SECRET ?? "";
const PORT = Number(process.env.RELAY_PORT ?? 8080);
const HOST = process.env.RELAY_HOST ?? "0.0.0.0";

/**
 * Optional comma-separated allowlist of source addresses.
 *
 * Strongly recommended: set it to the factory's public IP. Without it, anyone
 * who finds the port can post attendance, and attendance feeds payroll.
 */
const ALLOWED = (process.env.RELAY_ALLOWED_IPS ?? "")
  .split(",")
  .map((entry) => entry.trim())
  .filter(Boolean);

if (!UPSTREAM || !SECRET) {
  console.error(
    "Missing configuration. Required:\n" +
      "  RELAY_UPSTREAM  e.g. https://your-app.up.railway.app\n" +
      "  RELAY_SECRET    same value as DEVICE_INGEST_SECRET on the server\n" +
      "Optional:\n" +
      "  RELAY_PORT         default 8080\n" +
      "  RELAY_HOST         default 0.0.0.0\n" +
      "  RELAY_ALLOWED_IPS  comma-separated source IPs to accept",
  );
  process.exit(1);
}

/** Only the terminal protocol is proxied; nothing else is exposed. */
function isTerminalPath(pathname) {
  return pathname.startsWith("/iclock/");
}

function clientIp(request) {
  const address = request.socket.remoteAddress ?? "";
  // Node reports IPv4 over a dual-stack socket as ::ffff:1.2.3.4
  return address.replace(/^::ffff:/, "");
}

function stamp() {
  return new Date().toLocaleString("en-PK", { timeZone: "Asia/Karachi" });
}

function readBody(request) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    request.on("data", (chunk) => {
      size += chunk.length;
      // A terminal never sends megabytes; refuse anything that looks abusive.
      if (size > 5_000_000) {
        reject(new Error("body too large"));
        request.destroy();
        return;
      }
      chunks.push(chunk);
    });
    request.on("end", () => resolve(Buffer.concat(chunks)));
    request.on("error", reject);
  });
}

const server = createServer(async (request, response) => {
  const ip = clientIp(request);
  const url = new URL(request.url ?? "/", `http://${request.headers.host ?? "relay"}`);

  // Plain-text health check, so the VPS can be verified from a browser.
  if (url.pathname === "/health") {
    response.writeHead(200, { "content-type": "text/plain" });
    response.end("relay ok\n");
    return;
  }

  if (ALLOWED.length > 0 && !ALLOWED.includes(ip)) {
    console.warn(`[${stamp()}] refused ${ip} (not in RELAY_ALLOWED_IPS)`);
    response.writeHead(403, { "content-type": "text/plain" });
    response.end("Forbidden");
    return;
  }

  if (!isTerminalPath(url.pathname)) {
    response.writeHead(404, { "content-type": "text/plain" });
    response.end("Not found");
    return;
  }

  let body = Buffer.alloc(0);
  try {
    if (request.method !== "GET" && request.method !== "HEAD") {
      body = await readBody(request);
    }
  } catch {
    response.writeHead(413, { "content-type": "text/plain" });
    response.end("Payload too large");
    return;
  }

  const target = `${UPSTREAM}${url.pathname}${url.search}`;

  try {
    const upstream = await fetch(target, {
      method: request.method,
      headers: {
        // The terminal sends latin-1 text; keep the content type it declared.
        "content-type": request.headers["content-type"] ?? "text/plain",
        "x-device-secret": SECRET,
        "x-forwarded-for": ip,
      },
      ...(body.length > 0 ? { body } : {}),
      signal: AbortSignal.timeout(30_000),
    });

    const text = await upstream.text();

    /*
     * The reply is passed through byte for byte.
     *
     * ADMS terminals parse the response strictly — an "OK: 3" that arrives
     * wrapped in JSON, or with a changed status code, is read as a failed
     * upload and the whole batch is retried forever.
     */
    response.writeHead(upstream.status, {
      "content-type": upstream.headers.get("content-type") ?? "text/plain; charset=utf-8",
    });
    response.end(text);

    if (url.pathname.includes("cdata") && request.method === "POST") {
      console.log(`[${stamp()}] ${ip} → ${upstream.status} ${text.slice(0, 40).trim()}`);
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`[${stamp()}] upstream failed: ${message}`);

    // A 5xx makes the terminal keep the batch and retry, so punches survive an
    // outage rather than being acknowledged and dropped.
    response.writeHead(502, { "content-type": "text/plain" });
    response.end("ERROR");
  }
});

server.listen(PORT, HOST, () => {
  console.log(
    `RadoFlow relay listening on ${HOST}:${PORT}\n` +
      `Forwarding /iclock/* to ${UPSTREAM}\n` +
      (ALLOWED.length > 0
        ? `Accepting only: ${ALLOWED.join(", ")}`
        : "WARNING: no RELAY_ALLOWED_IPS set — the port is open to the internet"),
  );
});
