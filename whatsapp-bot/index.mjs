#!/usr/bin/env node
/**
 * RadoFlow WhatsApp bot.
 *
 * Logs in to WhatsApp as a linked device on a spare number, listens for
 * commands in private chats and groups, and passes each one to RadoFlow, which
 * decides what that person may see. This file knows nothing about attendance or
 * pay: it forwards the message, the sender's number and where it was sent, and
 * sends back whatever RadoFlow answers — text, then any files.
 *
 * Unofficial: it uses WhatsApp Web's protocol through the Baileys library, which
 * WhatsApp's terms do not allow. Use a dedicated number, never a personal one.
 */
import { existsSync, mkdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import makeWASocket, {
  Browsers,
  DisconnectReason,
  fetchLatestBaileysVersion,
  useMultiFileAuthState,
} from "@whiskeysockets/baileys";
import pino from "pino";
import qrcode from "qrcode-terminal";

// A tiny .env reader, so the bot needs nothing beyond its three packages.
const envFile = fileURLToPath(new URL("./.env", import.meta.url));
if (existsSync(envFile)) {
  for (const line of readFileSync(envFile, "utf8").split(/\r?\n/)) {
    const at = line.indexOf("=");
    if (at < 1 || line.trim().startsWith("#")) continue;
    const key = line.slice(0, at).trim();
    if (!process.env[key]) {
      process.env[key] = line
        .slice(at + 1)
        .trim()
        .replace(/^["']|["']$/g, "");
    }
  }
}

const BASE_URL = (process.env.RADO_URL ?? "").replace(/\/+$/, "");
const SECRET = process.env.BOT_SECRET ?? "";
const list = (value) =>
  (value ?? "")
    .split(",")
    .map((v) => v.trim())
    .filter(Boolean);
const PAYROLL_GROUPS = new Set(list(process.env.BOT_PAYROLL_GROUPS));
const ALLOWED_GROUPS = new Set(list(process.env.BOT_ALLOWED_GROUPS));
const AUTH_DIR = process.env.BOT_AUTH_DIR ?? fileURLToPath(new URL("./auth", import.meta.url));

if (!BASE_URL || SECRET.length < 16) {
  console.error("Set RADO_URL and BOT_SECRET (16+ characters). See .env.example.");
  process.exit(1);
}

const MIME = {
  pdf: "application/pdf",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
};

/** In a group the bot only reacts to a message that starts like a command. */
const GROUP_PREFIX = /^[!/]|^rado\b/i;

const lastAsked = new Map();
const COOLDOWN_MS = 3000;

function textOf(message) {
  const m = message?.ephemeralMessage?.message ?? message;
  return (
    m?.conversation ??
    m?.extendedTextMessage?.text ??
    m?.imageMessage?.caption ??
    m?.documentMessage?.caption ??
    ""
  );
}

/** The sender's phone number, or null when WhatsApp only gave an anonymous id. */
function senderNumber(key, isGroup) {
  const candidates = isGroup
    ? [key.participantPn, key.participantAlt, key.participant]
    : [key.senderPn, key.remoteJidAlt, key.remoteJid];
  const real = candidates.find((id) => typeof id === "string" && id.endsWith("@s.whatsapp.net"));
  return real ? real.split("@")[0].split(":")[0] : null;
}

function chatClass(jid) {
  if (!jid.endsWith("@g.us")) return "private";
  return PAYROLL_GROUPS.has(jid) ? "payroll" : "group";
}

async function handle(sock, msg) {
  const jid = msg.key.remoteJid;
  if (!jid || jid === "status@broadcast" || msg.key.fromMe) return;

  const isGroup = jid.endsWith("@g.us");
  let text = textOf(msg.message).trim();
  if (!text) return;

  if (isGroup) {
    if (ALLOWED_GROUPS.size > 0 && !ALLOWED_GROUPS.has(jid)) return;
    if (!GROUP_PREFIX.test(text)) return;
    text = text.replace(/^rado\b[\s,:-]*/i, "");
  }

  // Lets the office find the id to put in BOT_PAYROLL_GROUPS.
  if (isGroup && /^[!/]id\b/i.test(text)) {
    await sock.sendMessage(jid, { text: `This group's id:\n${jid}` }, { quoted: msg });
    return;
  }

  const phone = senderNumber(msg.key, isGroup);
  if (!phone) {
    await sock.sendMessage(
      jid,
      {
        text: "I can't see your phone number from here. Message me privately once, then try again.",
      },
      { quoted: msg },
    );
    return;
  }

  const wait = (lastAsked.get(phone) ?? 0) + COOLDOWN_MS - Date.now();
  if (wait > 0) return;
  lastAsked.set(phone, Date.now());

  const headers = {
    "x-bot-secret": SECRET,
    "x-bot-phone": phone,
    "x-bot-chat": chatClass(jid),
  };

  let reply;
  try {
    const response = await fetch(`${BASE_URL}/api/bot/command`, {
      method: "POST",
      headers: { ...headers, "content-type": "application/json" },
      body: JSON.stringify({ text }),
    });
    if (!response.ok) throw new Error(`RadoFlow answered ${response.status}`);
    reply = await response.json();
  } catch (error) {
    console.error("command failed:", error.message);
    await sock.sendMessage(
      jid,
      { text: "RadoFlow is not answering right now. Try again shortly." },
      { quoted: msg },
    );
    return;
  }

  if (reply.text) await sock.sendMessage(jid, { text: reply.text }, { quoted: msg });

  for (const download of reply.downloads ?? []) {
    try {
      const query = new URLSearchParams(download.query).toString();
      const response = await fetch(`${BASE_URL}/api/export/${download.kind}?${query}`, { headers });
      if (!response.ok) {
        const body = await response.json().catch(() => null);
        await sock.sendMessage(jid, {
          text: body?.error ?? `Could not build the file (${response.status}).`,
        });
        continue;
      }
      const disposition = response.headers.get("content-disposition") ?? "";
      const name = /filename="([^"]+)"/.exec(disposition)?.[1] ?? "report";
      const extension = name.split(".").pop() ?? "";
      await sock.sendMessage(jid, {
        document: Buffer.from(await response.arrayBuffer()),
        fileName: name,
        mimetype: MIME[extension] ?? "application/octet-stream",
      });
    } catch (error) {
      console.error("download failed:", error.message);
      await sock.sendMessage(jid, { text: "The file could not be sent." });
    }
  }
}

async function start() {
  mkdirSync(AUTH_DIR, { recursive: true });
  const { state, saveCreds } = await useMultiFileAuthState(AUTH_DIR);
  const { version } = await fetchLatestBaileysVersion();

  const sock = makeWASocket({
    version,
    auth: state,
    logger: pino({ level: "warn" }),
    browser: Browsers.ubuntu("RadoFlow"),
    // Reading the whole old history on every start is slow and not needed.
    syncFullHistory: false,
    markOnlineOnConnect: false,
  });

  sock.ev.on("creds.update", saveCreds);

  sock.ev.on("connection.update", ({ connection, lastDisconnect, qr }) => {
    if (qr) {
      console.log("\nScan this with the bot's phone: WhatsApp > Linked devices > Link a device\n");
      qrcode.generate(qr, { small: true });
    }
    if (connection === "open") console.log("Connected to WhatsApp.");
    if (connection === "close") {
      const code = lastDisconnect?.error?.output?.statusCode;
      if (code === DisconnectReason.loggedOut) {
        console.error("Logged out. Delete the auth folder and scan the QR code again.");
        process.exit(1);
      }
      console.log(`Connection closed (${code ?? "unknown"}); reconnecting...`);
      setTimeout(start, 3000);
    }
  });

  sock.ev.on("messages.upsert", ({ messages, type }) => {
    if (type !== "notify") return;
    for (const msg of messages) {
      handle(sock, msg).catch((error) => console.error("handler error:", error));
    }
  });
}

start().catch((error) => {
  console.error(error);
  process.exit(1);
});
