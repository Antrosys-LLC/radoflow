import Anthropic from "@anthropic-ai/sdk";
import { NextResponse, type NextRequest } from "next/server";

import { buildAssistantTools } from "@/lib/assistant/tools";
import { getSession } from "@/lib/auth/session";
import { requireAnthropicEnv } from "@/lib/env";
import { createClient } from "@/lib/supabase/server";

/**
 * The "ask" assistant: one question in, one plain-language answer out.
 *
 * Read-only by construction — see tools.ts. Every tool call runs through the
 * caller's own session, so Row Level Security is what actually decides what
 * this can see, exactly as it would for any other page in the app. This route
 * only adds Claude on top of that as a way to ask in plain language, by voice
 * or text, in whichever of Urdu / Roman Urdu / English the person is
 * comfortable in — it approves and changes nothing.
 */

export const dynamic = "force-dynamic";

const LANGUAGE_INSTRUCTIONS: Record<string, string> = {
  ur: "Answer only in Urdu, written in the Urdu script (اردو). Do not mix in English words unless there is no Urdu equivalent (e.g. a person's name).",
  "roman-ur":
    'Answer only in Roman Urdu — Urdu written in English letters, the way people write it on WhatsApp (e.g. "aaj 3 log late thay"). Do not use Urdu script and do not answer in English.',
  en: "Answer only in plain English.",
};

const SYSTEM_PROMPT_BASE = `You are the RadoFlow "Ask" assistant, built for a Pakistani textile factory. Many of the people asking you questions are not comfortable with English and may not be confident readers at all — some questions arrive as a rough voice transcription. Because of that:

- Keep answers to 1-4 short sentences. No tables, no markdown, no bullet lists — this is read aloud or read on a small phone screen.
- Lead with the number or the direct answer, then a short supporting clause if needed. Do not pad with pleasantries.
- Use simple, everyday words. Avoid jargon like "aggregate", "variance", or technical field names.
- If a tool returns no data, say plainly that there is nothing to report or that you do not have access to it — never guess or estimate a figure to fill the gap.
- If a question is ambiguous (which department, which person, which date range), ask one short clarifying question rather than assuming.
- You have no ability to change any record, approve anything, or take any action — you can only answer questions. If someone asks you to approve, change, or delete something, say that has to be done by a person in the app, not by you.`;

export async function POST(request: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Not signed in." }, { status: 401 });

  if (!session.isSuperuser && !session.permissions.has("assistant.ask")) {
    return NextResponse.json({ error: "Not allowed to use the assistant." }, { status: 403 });
  }

  let body: { question?: unknown; language?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  const question = typeof body.question === "string" ? body.question.trim() : "";
  const language = typeof body.language === "string" ? body.language : "en";

  if (!question) {
    return NextResponse.json({ error: "Ask a question first." }, { status: 400 });
  }
  if (question.length > 1000) {
    return NextResponse.json({ error: "That question is too long." }, { status: 400 });
  }

  let apiKey: string;
  try {
    apiKey = requireAnthropicEnv();
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Assistant is not configured." },
      { status: 503 },
    );
  }

  const supabase = await createClient();
  const { tools, contextNote } = buildAssistantTools(supabase);

  const languageInstruction = LANGUAGE_INSTRUCTIONS[language] ?? LANGUAGE_INSTRUCTIONS["en"];
  const system = `${SYSTEM_PROMPT_BASE}\n\n${contextNote}\n\n${languageInstruction}`;

  const client = new Anthropic({ apiKey });

  try {
    const runner = client.beta.messages.toolRunner({
      model: "claude-sonnet-5",
      max_tokens: 1024,
      system,
      tools,
      messages: [{ role: "user", content: question }],
    });

    const finalMessage = await runner.runUntilDone();
    const text = finalMessage.content
      .filter((block): block is Anthropic.Beta.BetaTextBlock => block.type === "text")
      .map((block) => block.text)
      .join("\n")
      .trim();

    await supabase.from("audit_log").insert({
      actor_id: session.userId,
      action: "assistant.ask",
      entity_type: "assistant_query",
      note: question.slice(0, 500),
      after: { language, answer: text.slice(0, 2000) },
    });

    return NextResponse.json({ answer: text || "I couldn't work out an answer to that." });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "The assistant could not answer that." },
      { status: 502 },
    );
  }
}
