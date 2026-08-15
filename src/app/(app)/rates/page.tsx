import type { Metadata } from "next";
import { Clock, Coins } from "lucide-react";

import { Card, SectionTitle } from "@/components/ui-kit";
import { requirePermission } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { todayInPakistan } from "@/lib/time";

import { LateRulesEditor, RatesForm, type LateRule, type RateValues } from "./rates-forms";

export const metadata: Metadata = {
  title: { absolute: "Pay Rates | Rado Dyeing and Textile" },
  description: "Overtime, weekend and holiday rates in rupees per hour, plus late-arrival penalties.",
};

export const dynamic = "force-dynamic";

export default async function RatesPage() {
  const session = await requirePermission("rates.view");
  const canManage = session.permissions.has("rates.manage");
  const supabase = await createClient();

  const [{ data: sites }, { data: rules }, { data: lateRules }] = await Promise.all([
    supabase.from("sites").select("id, name").order("name"),
    supabase.from("pay_rules").select("*").order("effective_from", { ascending: false }),
    supabase.from("late_penalty_rules").select("*").order("from_minutes"),
  ]);

  const today = todayInPakistan();

  return (
    <div className="space-y-5 pb-6">
      {(sites ?? []).map((site) => {
        // Effective-dated: the newest row that has already taken effect.
        const current = (rules ?? [])
          .filter((r) => r.site_id === site.id && r.effective_from <= today)
          .at(0) as RateValues | undefined;

        const siteLateRules = (lateRules ?? []).filter(
          (r) => r.site_id === site.id,
        ) as LateRule[];

        return (
          <div key={site.id} className="space-y-5">
            <Card className="p-4 sm:p-6">
              <SectionTitle
                icon={Coins}
                title={`Pay rates — ${site.name}`}
                subtitle="Rupees per hour for each kind of worked time"
              />
              {canManage ? (
                <RatesForm
                  siteId={site.id}
                  siteName={site.name}
                  current={current ?? null}
                  today={today}
                />
              ) : (
                <ReadOnlyRates current={current ?? null} />
              )}
            </Card>

            <Card className="p-4 sm:p-6">
              <SectionTitle
                icon={Clock}
                title="Late arrival penalties"
                subtitle="Deducted automatically when someone checks in after their shift start"
              />
              {canManage ? (
                <LateRulesEditor siteId={site.id} rules={siteLateRules} />
              ) : (
                <ReadOnlyLateRules rules={siteLateRules} />
              )}
            </Card>
          </div>
        );
      })}
    </div>
  );
}

function ReadOnlyRates({ current }: { current: RateValues | null }) {
  if (!current) {
    return <p className="text-sm text-muted-foreground">No rates configured for this factory.</p>;
  }
  const rows = [
    ["Overtime", current.ot_hourly_rate],
    ["Weekend / off-day", current.weekend_hourly_rate],
    ["Holiday", current.holiday_hourly_rate],
    ["Night shift", current.night_hourly_rate],
  ] as const;

  return (
    <dl className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
      {rows.map(([label, value]) => (
        <div key={label} className="rounded-2xl bg-secondary px-4 py-3">
          <dt className="text-[11px] font-bold uppercase tracking-wide text-muted-foreground">
            {label}
          </dt>
          <dd className="mt-0.5 text-lg font-bold text-foreground">₨ {value} / hour</dd>
        </div>
      ))}
    </dl>
  );
}

function ReadOnlyLateRules({ rules }: { rules: LateRule[] }) {
  if (rules.length === 0) {
    return <p className="text-sm text-muted-foreground">No late penalty configured.</p>;
  }
  return (
    <ul className="space-y-2">
      {rules.map((rule) => (
        <li key={rule.id} className="rounded-2xl bg-secondary px-4 py-3 text-sm">
          <span className="font-semibold text-foreground">{rule.label}</span>
          <span className="text-muted-foreground">
            {" "}
            — {rule.from_minutes} to {rule.to_minutes ?? "∞"} min ·{" "}
          </span>
          <span className="font-bold text-danger">
            {rule.penalty_percent}% of {rule.basis === "month" ? "monthly" : "daily"} pay
          </span>
        </li>
      ))}
    </ul>
  );
}
