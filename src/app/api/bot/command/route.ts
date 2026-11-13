import { NextResponse, type NextRequest } from "next/server";

import { authenticateBot } from "@/lib/bot/auth";
import { parseCommand } from "@/lib/bot/parse";
import { runCommand } from "@/lib/bot/run";
import { todayInPakistan } from "@/lib/time";

/**
 * The WhatsApp bot's single entry point.
 *
 * The bot sends who is asking (`x-bot-phone`), where (`x-bot-chat`) and the
 * message; this answers with the text to send back and, for files, the exports
 * to fetch from `/api/export`. It authenticates with `BOT_SECRET` rather than a
 * cookie, so the middleware lets `/api/bot` through and this is the only gate.
 */

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  const auth = await authenticateBot(request);

  if (auth.status === "absent" || auth.status === "denied") {
    return NextResponse.json({ error: "Not allowed." }, { status: 401 });
  }

  if (auth.status === "unknown-sender") {
    // Said plainly, so a stranger in the group learns to ask the office instead
    // of assuming the bot is broken. Nothing about the company is revealed.
    return NextResponse.json({
      text: "Your number is not registered in RadoFlow. Ask the office to add your phone number to your profile.",
    });
  }

  const body = (await request.json().catch(() => null)) as { text?: unknown } | null;
  const text = typeof body?.text === "string" ? body.text.slice(0, 500) : "";

  try {
    const reply = await runCommand(parseCommand(text, todayInPakistan()), auth.session, auth.chat);
    return NextResponse.json(reply);
  } catch (error) {
    console.error("bot command failed", error);
    return NextResponse.json({
      text: "Something went wrong reading the data. Try again in a moment.",
    });
  }
}
