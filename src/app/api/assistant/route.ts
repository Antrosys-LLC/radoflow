import Anthropic from "@anthropic-ai/sdk";
import { NextResponse, type NextRequest } from "next/server";

import { describeAskContext, readAskContext } from "@/lib/assistant/context";
import {
  ASK_MODEL,
  costInPkr,
  costInUsd,
  resolveEffort,
  type UsageTotals,
} from "@/lib/assistant/models";
import { buildAssistantTools } from "@/lib/assistant/tools";
import { getSession } from "@/lib/auth/session";
import { requireAnthropicEnv } from "@/lib/env";
import { dictionaryFor, resolveLanguage } from "@/lib/i18n";
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

/**
 * Earlier turns kept for context.
 *
 * People ask follow-ups the way they speak — "aur pichle mahine?" — which is
 * unanswerable without the question before it. Capped because the history
 * arrives from the browser: it costs tokens, and there is no reason to let a
 * client grow it without limit.
 */
const MAX_HISTORY_TURNS = 8;
const MAX_QUESTION_LENGTH = 1000;

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
- You have no ability to change any record, approve anything, or take any action — you can only answer questions. If someone asks you to approve, change, or delete something, say that has to be done by a person in the app, not by you.
- Your tools cover what the app's own screens show: who is in right now, attendance and late arrivals, overtime hours, leave and holidays, headcount, what a person is paid, what their salary comes to for a month, and what a department costs. Answer from a tool, never from memory of an earlier answer.
- Money questions: a figure from a completed pay run is what will actually be paid; a live calculation is only what today's attendance and rates come to. When you quote a calculated figure, say in a few words that it is worked out from attendance so far and can still change.`;

/**
 * The browser's thread, trimmed to what the model can act on.
 *
 * Anything malformed is dropped rather than rejected: a bad history entry is
 * not worth failing an otherwise valid question over, and the current question
 * still answers on its own.
 */
function readHistory(value: unknown): Anthropic.Beta.BetaMessageParam[] {
  if (!Array.isArray(value)) return [];

  const turns: Anthropic.Beta.BetaMessageParam[] = [];
  for (const entry of value.slice(-MAX_HISTORY_TURNS)) {
    if (!entry || typeof entry !== "object") continue;
    const { role, text } = entry as { role?: unknown; text?: unknown };
    if (role !== "user" && role !== "assistant") continue;
    if (typeof text !== "string" || !text.trim()) continue;
    turns.push({ role, content: text.slice(0, MAX_QUESTION_LENGTH) });
  }

  // The API requires the thread to start with a user turn, and the question
  // appended after this one must not follow another user turn.
  while (turns.length > 0 && turns[0]?.role !== "user") turns.shift();
  while (turns.length > 0 && turns[turns.length - 1]?.role !== "assistant") turns.pop();

  return turns;
}

export async function POST(request: NextRequest) {
  const session = await getSession();
  /*
   * Two languages are in play and they are not the same one. Everything this
   * route *says about itself* — a refusal, a failure — is interface text and
   * is read in the caller's own profile language, like the screen around the
   * toast it lands in. The one exception is the stand-in for an empty answer
   * further down, which is read in the language the answer was asked for.
   *
   * Nobody signed in has a profile to read, so that case is English.
   */
  if (!session) {
    return NextResponse.json({ error: dictionaryFor("en").ask.notSignedIn }, { status: 401 });
  }
  const t = dictionaryFor(session.profile.language);

  if (!session.isSuperuser && !session.permissions.has("assistant.ask")) {
    return NextResponse.json({ error: t.ask.notAllowed }, { status: 403 });
  }

  let body: {
    question?: unknown;
    language?: unknown;
    history?: unknown;
    effort?: unknown;
    context?: unknown;
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: t.ask.badRequest }, { status: 400 });
  }

  const question = typeof body.question === "string" ? body.question.trim() : "";
  const language = typeof body.language === "string" ? body.language : "en";
  const effort = resolveEffort(body.effort);

  if (!question) {
    return NextResponse.json({ error: t.ask.emptyQuestion }, { status: 400 });
  }
  if (question.length > MAX_QUESTION_LENGTH) {
    return NextResponse.json({ error: t.ask.questionTooLong }, { status: 400 });
  }

  const history = readHistory(body.history);
  /*
   * What the person is looking at, when they asked from a record rather than
   * from the floating widget. Validated rather than trusted — it arrives from
   * the browser exactly as the question does. See lib/assistant/context.ts.
   */
  const context = readAskContext(body.context);

  let apiKey: string;
  try {
    apiKey = requireAnthropicEnv();
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : t.ask.notConfigured },
      { status: 503 },
    );
  }

  const supabase = await createClient();
  const { tools, contextNote } = buildAssistantTools(supabase);

  const languageInstruction = LANGUAGE_INSTRUCTIONS[language] ?? LANGUAGE_INSTRUCTIONS["en"];

  /*
   * The screen's own context goes last, after the general instructions and
   * the tool note: it is the most specific thing the model is told, and the
   * thing a question asked from a record is most likely to be about.
   */
  const screenContext = describeAskContext(context);
  const system = [SYSTEM_PROMPT_BASE, contextNote, languageInstruction, screenContext]
    .filter(Boolean)
    .join("\n\n");

  const client = new Anthropic({ apiKey });

  try {
    const runner = client.beta.messages.toolRunner({
      model: ASK_MODEL,
      /*
       * A ceiling, not a reservation — unused tokens cost nothing, so this is
       * set well clear of any real answer rather than tuned down. The runner
       * has to call tools and then compose a reply, and Urdu and Roman Urdu
       * spend markedly more tokens per sentence than English; at a low cap the
       * reply is cut off mid-sentence and reaches the floor looking like a bad
       * answer rather than a truncated one.
       */
      max_tokens: 16000,
      output_config: { effort },
      system,
      tools,
      messages: [...history, { role: "user", content: question }],
    });

    /*
     * Usage is summed across every turn, not read off the final message.
     *
     * The runner makes one API call per tool round-trip, and each message's
     * `usage` describes only its own call. A question that resolves an
     * employee, reads their attendance and then prices a salary costs four
     * calls; reporting the last one would understate the real spend severalfold
     * — and a cost readout that is wrong in the cheap direction is worse than
     * none, because it will be believed.
     */
    const totals: UsageTotals = { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 };
    let finalMessage: Awaited<ReturnType<typeof runner.runUntilDone>> | undefined;

    for await (const message of runner) {
      totals.input += message.usage.input_tokens;
      totals.output += message.usage.output_tokens;
      totals.cacheRead += message.usage.cache_read_input_tokens ?? 0;
      totals.cacheWrite += message.usage.cache_creation_input_tokens ?? 0;
      finalMessage = message;
    }

    if (!finalMessage) {
      throw new Error("The assistant returned no messages.");
    }

    const text = finalMessage.content
      .filter((block): block is Anthropic.Beta.BetaTextBlock => block.type === "text")
      .map((block) => block.text)
      .join("\n")
      .trim();

    /*
     * One row per call, with the tokens it actually used.
     *
     * The Anthropic console reports account spend with a delay and knows
     * nothing about who asked or from which screen. This is the app's own
     * record, so a bill can be checked rather than believed and the cost can
     * be attributed to a person and a screen. The dollar figure is stored
     * rather than the rupee one: the rate and the tax are settings the office
     * changes, and a stored dollar amount can be re-priced later where a
     * stored rupee amount cannot.
     */
    await supabase.from("assistant_usage").insert({
      profile_id: session.userId,
      surface: context?.surface ?? "general",
      model: ASK_MODEL,
      input_tokens: totals.input,
      output_tokens: totals.output,
      cache_read: totals.cacheRead,
      cache_write: totals.cacheWrite,
      cost_usd: costInUsd(totals),
    });

    await supabase.from("audit_log").insert({
      actor_id: session.userId,
      action: "assistant.ask",
      entity_type: "assistant_query",
      note: question.slice(0, 500),
      after: {
        language,
        effort,
        surface: context?.surface ?? "general",
        cost_pkr: costInPkr(totals),
        answer: text.slice(0, 2000),
      },
    });

    return NextResponse.json({
      // An answer, not a message about this route — so it is read in the
      // language the answer was asked for, not the reader's interface language.
      answer: text || dictionaryFor(resolveLanguage(language)).ask.noAnswerText,
      costPkr: costInPkr(totals),
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : t.ask.couldNotAnswer },
      { status: 502 },
    );
  }
}
