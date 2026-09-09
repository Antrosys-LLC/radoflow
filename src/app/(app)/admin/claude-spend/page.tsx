import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { isAntrosys } from "@/lib/auth/antrosys";
import { requireSession } from "@/lib/auth/session";
import { PAYMENT_TAX_RATE, USD_TO_PKR } from "@/lib/assistant/models";
import { budgetState, DEFAULT_MONTHLY_LIMIT_PKR } from "@/lib/assistant/budget";
import { fetchDailySpend } from "@/lib/assistant/spend";
import { createClient } from "@/lib/supabase/server";

import { SpendScreen, type SpendView } from "./spend-screen";

export const metadata: Metadata = {
  title: { absolute: "Claude Spend | Rado Dyeing and Textile" },
  description: "What the assistant costs the factory, in rupees.",
};

export const dynamic = "force-dynamic";

/**
 * What Claude costs.
 *
 * Two sources, deliberately side by side. Anthropic's own cost report is the
 * account statement — everything billed, whoever spent it — and this app's
 * `assistant_usage` table is what this factory asked for specifically. The
 * first is the truth about the bill; the second is the truth about who caused
 * it. Showing only one of them invites the wrong argument.
 *
 * `settings.manage` throughout: this is a money screen and it carries the
 * conversion rate the office sets.
 */
export default async function ClaudeSpendPage() {
  /*
   * Antrosys only, not `settings.manage`.
   *
   * The CEO holds every permission — both roles are superusers — so a
   * permission gate put this in front of the factory's own management. These
   * are Antrosys's operating figures: what the Anthropic account costs, the
   * rate it is converted at, the ceiling on it. Showing the people who are
   * billed for the system a dollar figure they cannot act on invites a
   * conversation about the wrong number.
   */
  const session = await requireSession();
  if (!isAntrosys(session)) redirect("/denied");

  const supabase = await createClient();

  const [report, { data: settings }, { data: usage }] = await Promise.all([
    // Thirty days: the longest window the cost endpoint serves in one page,
    // and a month is the unit a bill arrives in.
    fetchDailySpend(30),
    supabase
      .from("app_settings")
      .select("key, value")
      .in("key", ["usd_to_pkr", "tax_percent", "assistant_monthly_limit_pkr"]),
    supabase.from("assistant_usage").select("cost_usd, asked_at"),
  ]);

  const settingOf = (key: string, fallback: number): number => {
    const raw = (settings ?? []).find((row) => row.key === key)?.value;
    const parsed = typeof raw === "number" ? raw : Number(raw);
    return Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback;
  };

  const view: SpendView = {
    days: report.ok ? report.days : [],
    problem: report.ok
      ? null
      : { reason: report.reason, ...(report.detail ? { detail: report.detail } : {}) },
    // The hardcoded pair in models.ts is the fallback, not the source: it is
    // what prices an answer inline, and these settings are what the office
    // corrects it to.
    usdToPkrRate: settingOf("usd_to_pkr", USD_TO_PKR),
    taxPercent: settingOf("tax_percent", PAYMENT_TAX_RATE * 100),
    appUsd: (usage ?? []).reduce((total, row) => total + Number(row.cost_usd ?? 0), 0),
    appCalls: usage?.length ?? 0,
    canManage: true,
    // The month's ceiling, worked out from the same rows and the same rate the
    // route refuses questions on, so the screen and the refusal cannot
    // disagree about how much is left.
    budget: budgetState(usage ?? [], {
      limitPkr: settingOf("assistant_monthly_limit_pkr", DEFAULT_MONTHLY_LIMIT_PKR),
      rate: settingOf("usd_to_pkr", USD_TO_PKR),
      taxPercent: settingOf("tax_percent", PAYMENT_TAX_RATE * 100),
    }),
  };

  return <SpendScreen view={view} />;
}
