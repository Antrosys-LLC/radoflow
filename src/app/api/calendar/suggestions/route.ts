import Anthropic from "@anthropic-ai/sdk";
import { NextResponse } from "next/server";

import { budgetState, DEFAULT_MONTHLY_LIMIT_PKR, monthStart } from "@/lib/assistant/budget";
import {
  ASK_MODEL,
  costInPkr,
  costInUsd,
  PAYMENT_TAX_RATE,
  USD_TO_PKR,
  type UsageTotals,
} from "@/lib/assistant/models";
import { canUseAssistant } from "@/lib/auth/antrosys";
import { getSession } from "@/lib/auth/session";
import { parseHolidaySuggestions } from "@/lib/calendar/holidays";
import { requireAnthropicEnv } from "@/lib/env";
import { createClient } from "@/lib/supabase/server";
import { todayInPakistan } from "@/lib/time";

/**
 * Upcoming days off, looked up by Claude.
 *
 * Pakistan's gazetted holidays move every year, and the Islamic ones move with
 * the moon — the office has always found out about Eid from the news a few
 * days before. This asks Claude to search for the announced list and the
 * expected dates, and hands back suggestions the office chooses to add. It
 * writes nothing: a holiday on the calendar changes pay, and that stays a
 * person's decision.
 *
 * Leadership only, and inside the assistant's monthly ceiling, for the same
 * reason the Ask screen is — every lookup is a bill.
 */

export const dynamic = "force-dynamic";

/** Web search is billed per search on top of tokens: $10 per thousand. */
const USD_PER_SEARCH = 0.01;
const LOOKAHEAD_DAYS = 120;

export async function POST() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  if (!canUseAssistant(session)) {
    return NextResponse.json({ error: "Only leadership can ask Claude." }, { status: 403 });
  }

  let apiKey: string;
  try {
    apiKey = requireAnthropicEnv();
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Claude is not set up." },
      { status: 503 },
    );
  }

  const supabase = await createClient();

  const [{ data: budgetRows }, { data: budgetSettings }] = await Promise.all([
    supabase
      .from("assistant_usage")
      .select("cost_usd, asked_at")
      .gte("asked_at", monthStart(new Date()).toISOString()),
    supabase
      .from("app_settings")
      .select("key, value")
      .in("key", ["usd_to_pkr", "tax_percent", "assistant_monthly_limit_pkr"]),
  ]);

  if (budgetRows && budgetRows.length > 0) {
    const setting = (key: string, fallback: number): number => {
      const raw = (budgetSettings ?? []).find((row) => row.key === key)?.value;
      const parsed = typeof raw === "number" ? raw : Number(raw);
      return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
    };
    const budget = budgetState(budgetRows, {
      limitPkr: setting("assistant_monthly_limit_pkr", DEFAULT_MONTHLY_LIMIT_PKR),
      rate: setting("usd_to_pkr", USD_TO_PKR),
      taxPercent: setting("tax_percent", PAYMENT_TAX_RATE * 100),
    });
    if (budget.overBudget) {
      return NextResponse.json(
        { error: "This month's Claude budget is used up." },
        { status: 429 },
      );
    }
  }

  const today = todayInPakistan();
  const until = new Date(`${today}T00:00:00Z`);
  until.setUTCDate(until.getUTCDate() + LOOKAHEAD_DAYS);
  const end = until.toISOString().slice(0, 10);

  const system = `You help a textile factory in Punjab, Pakistan plan its working calendar. Today is ${today} (Pakistan Standard Time).

Search the web for Pakistan's official public holidays between ${today} and ${end}: the federal government's gazetted list for the year, and the Islamic holidays whose dates depend on moon sighting (Eid ul Fitr, Eid ul Adha, Ashura — 9th and 10th Muharram, 12 Rabi ul Awwal). Also include national days such as Iqbal Day, Quaid-e-Azam Day, Kashmir Solidarity Day, Pakistan Day, Labour Day and Independence Day when they fall in the range.

For a moon-dependent holiday not yet officially announced, give the expected date and mark it "expected". Do not invent holidays; include only days that are official public holidays in Pakistan.

Reply with only a JSON array and nothing else. Each item:
{"date": "YYYY-MM-DD", "name": "English name", "status": "announced" | "expected", "note": "one short sentence, e.g. how many days or that it depends on the moon"}
Give one item per calendar day (a three-day Eid is three items). Sort by date.`;

  const client = new Anthropic({ apiKey });
  const totals: UsageTotals = { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 };
  let searches = 0;

  try {
    const messages: Anthropic.MessageParam[] = [
      { role: "user", content: `List the holidays from ${today} to ${end}.` },
    ];
    let text = "";

    // Server-side search can pause a long turn; it is resumed by sending the
    // paused content straight back, a few times at most.
    for (let turn = 0; turn < 4; turn++) {
      const response = await client.messages.create({
        model: ASK_MODEL,
        max_tokens: 8000,
        system,
        messages,
        tools: [
          {
            type: "web_search_20260209",
            name: "web_search",
            max_uses: 5,
          } as unknown as Anthropic.ToolUnion,
        ],
      });

      totals.input += response.usage.input_tokens;
      totals.output += response.usage.output_tokens;
      totals.cacheRead += response.usage.cache_read_input_tokens ?? 0;
      totals.cacheWrite += response.usage.cache_creation_input_tokens ?? 0;
      searches += response.usage.server_tool_use?.web_search_requests ?? 0;

      text = response.content
        .filter((block): block is Anthropic.TextBlock => block.type === "text")
        .map((block) => block.text)
        .join("\n");

      if (response.stop_reason !== "pause_turn") break;
      messages.push({ role: "assistant", content: response.content });
    }

    const costUsd = costInUsd(totals) + searches * USD_PER_SEARCH;

    await supabase.from("assistant_usage").insert({
      profile_id: session.userId,
      surface: "calendar",
      model: ASK_MODEL,
      input_tokens: totals.input,
      output_tokens: totals.output,
      cache_read: totals.cacheRead,
      cache_write: totals.cacheWrite,
      cost_usd: costUsd,
    });

    const suggestions = parseHolidaySuggestions(text, { from: today, to: end });

    return NextResponse.json({
      suggestions,
      costPkr:
        costInPkr(totals) +
        Math.round(searches * USD_PER_SEARCH * (1 + PAYMENT_TAX_RATE) * USD_TO_PKR),
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Could not reach Claude." },
      { status: 502 },
    );
  }
}
