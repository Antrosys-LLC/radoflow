import Anthropic from "@anthropic-ai/sdk";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import * as z from "zod/v4";

import {
  detectPayrollAnomalies,
  type AnomalyCandidate,
  type AnomalyInput,
} from "@/lib/payroll/anomalies";
import { requireAnthropicEnv } from "@/lib/env";
import { createServiceClient } from "@/lib/supabase/service";

/**
 * Best-effort, plain-language explanation of a payroll run's anomalies.
 *
 * Runs after `runPayrollForPeriod` has already written the real figures —
 * this only ever annotates them. `detectPayrollAnomalies` (pure, tested) does
 * every yes/no decision about who is worth a look; Claude's only job here is
 * turning the numbers it is handed into 1-2 plain sentences a busy approver
 * can read in passing. If the assistant isn't configured, or the call fails,
 * this throws and the caller falls back to the deterministic summary —
 * payroll numbers are never affected either way.
 *
 * Uses the service client, like runPayrollForPeriod itself: a run covers
 * every employee at the site regardless of the operator's own attendance or
 * directory scope, and the caller's permission to run payroll has already
 * been checked at the action boundary.
 */

export interface ReviewedItem {
  profileId: string;
  fullName: string;
  note: string;
}

export interface ReviewSummary {
  reviewed: number;
  flagged: ReviewedItem[];
}

const REVIEW_SCHEMA = z.object({
  findings: z.array(
    z.object({
      profileId: z.string(),
      explanation: z
        .string()
        .describe(
          "1-2 short, plain sentences a payroll approver can read in passing. No jargon, no rupee-sign formatting, just what to check and why.",
        ),
    }),
  ),
});

const SYSTEM_PROMPT = `You write short explanations for a factory payroll approver, not a technical audience. For each person you are given, you'll see WHY they were flagged (dropped hours, an attendance anomaly, a pay swing, or several) and the numbers behind it. Write 1-2 plain sentences per person saying what looks unusual and what the approver should check — never claim the pay is wrong, since nothing here has been miscalculated; the numbers already reflect the rules exactly. Your job is only to make the "why" easy to read at a glance. Do not invent reasons beyond what the data shows.`;

function candidateContext(candidate: AnomalyCandidate): Record<string, unknown> {
  return {
    profileId: candidate.profileId,
    fullName: candidate.fullName,
    reasons: candidate.reasons,
    droppedHours:
      candidate.flaggedHours > 0
        ? { hours: candidate.flaggedHours, dates: candidate.flaggedDays.map((d) => d.workDate) }
        : undefined,
    attendanceAnomalies:
      candidate.attendanceNotes.length > 0
        ? candidate.attendanceNotes.map((n) => `${n.workDate}: ${n.note}`)
        : undefined,
    payOutlier:
      candidate.percentDeviation !== null
        ? {
            netThisPeriod: candidate.netThisPeriod,
            averageOfRecentPeriods: candidate.averageTrailingNet,
            percentDeviation: candidate.percentDeviation,
          }
        : undefined,
  };
}

/** Fetches every attendance_days row with a note in range, for these people. */
async function fetchAttendanceNotes(
  supabase: ReturnType<typeof createServiceClient>,
  profileIds: string[],
  from: string,
  to: string,
): Promise<Map<string, { workDate: string; note: string }[]>> {
  const byProfile = new Map<string, { workDate: string; note: string }[]>();
  if (profileIds.length === 0) return byProfile;

  const { data } = await supabase
    .from("attendance_days")
    .select("profile_id, work_date, note")
    .in("profile_id", profileIds)
    .gte("work_date", from)
    .lte("work_date", to)
    .not("note", "is", null);

  for (const row of data ?? []) {
    if (!row.profile_id || !row.note) continue;
    const list = byProfile.get(row.profile_id) ?? [];
    list.push({ workDate: row.work_date, note: row.note });
    byProfile.set(row.profile_id, list);
  }
  return byProfile;
}

/** This person's net pay on their last few settled periods at this site. */
async function fetchTrailingNet(
  supabase: ReturnType<typeof createServiceClient>,
  siteId: string,
  periodStart: string,
  profileIds: string[],
): Promise<Map<string, number[]>> {
  const byProfile = new Map<string, number[]>();
  if (profileIds.length === 0) return byProfile;

  const { data: periods } = await supabase
    .from("payroll_periods")
    .select("id")
    .eq("site_id", siteId)
    .in("status", ["approved", "paid"])
    .lt("period_start", periodStart)
    .order("period_start", { ascending: false })
    .limit(3);

  const periodIds = (periods ?? []).map((p) => p.id);
  if (periodIds.length === 0) return byProfile;

  const { data: items } = await supabase
    .from("payroll_items")
    .select("profile_id, net")
    .in("period_id", periodIds)
    .in("profile_id", profileIds);

  for (const row of items ?? []) {
    if (!row.profile_id) continue;
    const list = byProfile.get(row.profile_id) ?? [];
    list.push(Number(row.net));
    byProfile.set(row.profile_id, list);
  }
  return byProfile;
}

export async function reviewPayrollAnomalies(periodId: string): Promise<ReviewSummary> {
  const supabase = createServiceClient();

  const { data: period } = await supabase
    .from("payroll_periods")
    .select("site_id, period_start, period_end")
    .eq("id", periodId)
    .single();
  if (!period) throw new Error("Pay period not found.");

  const { data: items } = await supabase
    .from("payroll_items")
    .select("profile_id, net, flagged_hours, flagged_days")
    .eq("period_id", periodId);
  if (!items || items.length === 0) return { reviewed: 0, flagged: [] };

  const profileIds = items.map((i) => i.profile_id);

  const { data: people } = await supabase
    .from("profiles")
    .select("id, full_name")
    .in("id", profileIds);
  const nameOf = new Map((people ?? []).map((p) => [p.id, p.full_name]));

  const [notesByProfile, trailingByProfile] = await Promise.all([
    fetchAttendanceNotes(supabase, profileIds, period.period_start, period.period_end),
    fetchTrailingNet(supabase, period.site_id, period.period_start, profileIds),
  ]);

  const inputs: AnomalyInput[] = items.map((item) => ({
    profileId: item.profile_id,
    fullName: nameOf.get(item.profile_id) ?? "Unknown",
    netThisPeriod: Number(item.net),
    flaggedHours: Number(item.flagged_hours ?? 0),
    flaggedDays: (item.flagged_days ?? []) as { workDate: string; hours: number }[],
    attendanceNotes: notesByProfile.get(item.profile_id) ?? [],
    trailingNet: trailingByProfile.get(item.profile_id) ?? [],
  }));

  const candidates = detectPayrollAnomalies(inputs);
  if (candidates.length === 0) return { reviewed: items.length, flagged: [] };

  const apiKey = requireAnthropicEnv();
  const client = new Anthropic({ apiKey });

  const message = await client.beta.messages.parse({
    model: "claude-sonnet-5",
    max_tokens: 2048,
    system: SYSTEM_PROMPT,
    messages: [
      {
        role: "user",
        content: JSON.stringify(candidates.map(candidateContext)),
      },
    ],
    output_config: { format: betaZodOutputFormat(REVIEW_SCHEMA) },
  });

  const findings = message.parsed_output?.findings ?? [];
  const explanationByProfile = new Map(findings.map((f) => [f.profileId, f.explanation]));
  const now = new Date().toISOString();

  const flagged: ReviewedItem[] = [];
  for (const candidate of candidates) {
    const note = explanationByProfile.get(candidate.profileId);
    if (!note) continue;

    await supabase
      .from("payroll_items")
      .update({ review_note: note, review_generated_at: now })
      .eq("period_id", periodId)
      .eq("profile_id", candidate.profileId);

    flagged.push({ profileId: candidate.profileId, fullName: candidate.fullName, note });
  }

  return { reviewed: items.length, flagged };
}
