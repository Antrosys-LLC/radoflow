import { PAYMENT_TAX_RATE } from "@/lib/assistant/models";

/**
 * What the Anthropic account is actually costing.
 *
 * Two different questions live here and they have two different answers. The
 * app's own `assistant_usage` table knows what *this* app spent and who spent
 * it — but it cannot know about anything else billed to the same account, and
 * a bill nobody can check is a bill somebody eventually disputes. Anthropic's
 * Usage and Cost Admin API is the account's own statement, and that is what
 * this reads.
 *
 * It is a separate credential from the one the assistant answers with: an
 * Admin API key (`sk-ant-admin…`), created by an organisation admin in the
 * Console. Without it this reports "not configured" rather than guessing, and
 * the screen falls back to the app's own figures.
 *
 * Amounts come back as decimal strings in the *lowest* currency unit — cents,
 * not dollars — which is the single most expensive detail in this file to get
 * wrong. `"123.78912"` is one dollar twenty-three, not a hundred and twenty
 * three dollars.
 */

const COST_REPORT_URL = "https://api.anthropic.com/v1/organizations/cost_report";
const ANTHROPIC_VERSION = "2023-06-01";

/** One bucket of the cost report, as the API returns it. */
interface CostBucket {
  starting_at: string;
  ending_at: string;
  results: { amount: string; currency: string }[];
}

interface CostReportResponse {
  data?: CostBucket[];
  has_more?: boolean;
  next_page?: string | null;
}

export interface DailySpend {
  /** The day the bucket starts, as `YYYY-MM-DD`. */
  day: string;
  usd: number;
}

export type SpendReport =
  | { ok: true; days: DailySpend[] }
  /**
   * Reported rather than thrown. A missing admin key is a configuration state
   * the screen explains, and a refused or unreachable API is worth naming on
   * the screen too — a spend meter that silently shows zero is worse than one
   * that says it could not ask.
   */
  | { ok: false; reason: "not-configured" | "refused" | "unreachable"; detail?: string };

/** The admin credential, or null when the office has not set one. */
export function anthropicAdminKey(): string | null {
  return process.env["ANTHROPIC_ADMIN_KEY"]?.trim() || null;
}

/** `YYYY-MM-DD` shifted by whole days, in UTC — the report's own calendar. */
function shiftUtcDay(date: Date, days: number): Date {
  const copy = new Date(date.getTime());
  copy.setUTCDate(copy.getUTCDate() + days);
  return copy;
}

/**
 * The account's daily spend over the last `days` days, oldest first.
 *
 * Daily is the only granularity the cost endpoint offers, so a "per second"
 * figure anywhere above this is derived from a day rather than measured — see
 * `perSecondUsd`.
 */
export async function fetchDailySpend(days = 30): Promise<SpendReport> {
  const key = anthropicAdminKey();
  if (!key) return { ok: false, reason: "not-configured" };

  const now = new Date();
  // Snapped to midnight UTC because the API snaps its buckets there anyway;
  // asking from an arbitrary instant returns a first bucket that looks short.
  const endingAt = shiftUtcDay(
    new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())),
    1,
  );
  const startingAt = shiftUtcDay(endingAt, -Math.max(1, Math.min(31, days)));

  const url = new URL(COST_REPORT_URL);
  url.searchParams.set("starting_at", startingAt.toISOString());
  url.searchParams.set("ending_at", endingAt.toISOString());
  url.searchParams.set("bucket_width", "1d");
  // The maximum the endpoint allows, so a month never needs a second page.
  url.searchParams.set("limit", "31");

  let response: Response;
  try {
    response = await fetch(url, {
      headers: {
        "x-api-key": key,
        "anthropic-version": ANTHROPIC_VERSION,
        // Asked for by the docs so Anthropic can see what integrations do.
        "user-agent": "RadoFlow/1.0 (+https://antrosys.com)",
      },
      // Never cached: this is a money figure somebody is watching change.
      cache: "no-store",
    });
  } catch (error) {
    // Spread rather than assign: exactOptionalPropertyTypes treats an
    // explicit undefined as different from an absent key.
    return {
      ok: false,
      reason: "unreachable",
      ...(error instanceof Error ? { detail: error.message } : {}),
    };
  }

  if (!response.ok) {
    // 401 and 403 are the same thing to the reader — the key is wrong or is
    // not an admin key — and the body says which without being paraphrased.
    return { ok: false, reason: "refused", detail: (await response.text()).slice(0, 300) };
  }

  const body = (await response.json().catch(() => null)) as CostReportResponse | null;

  const daysOut: DailySpend[] = (body?.data ?? []).map((bucket) => ({
    day: bucket.starting_at.slice(0, 10),
    /*
     * Cents to dollars. `amount` is a decimal string in the lowest currency
     * unit — "123.78912" is $1.2378912 — and a non-numeric entry contributes
     * nothing rather than turning the whole day into NaN.
     */
    usd: bucket.results.reduce((total, result) => {
      const cents = Number(result.amount);
      return Number.isFinite(cents) ? total + cents / 100 : total;
    }, 0),
  }));

  return { ok: true, days: daysOut };
}

/** Dollars spent across a run of days. */
export function totalUsd(days: readonly DailySpend[]): number {
  return days.reduce((total, day) => total + day.usd, 0);
}

/**
 * The average dollars a second over the days given.
 *
 * A rate, not a measurement: the finest the cost endpoint reports is a day, so
 * this divides recent days by their seconds. Shown as a rate, and labelled as
 * an average on the screen — a per-second figure implies a precision the
 * source does not have, and quoting it as though it were live would be a lie
 * about somebody's money.
 */
export function perSecondUsd(days: readonly DailySpend[]): number {
  if (days.length === 0) return 0;
  return totalUsd(days) / (days.length * 24 * 60 * 60);
}

/**
 * Dollars to rupees, with the payment tax applied first.
 *
 * Tax then conversion, the same order `costInPkr` uses: what the factory is
 * billed in dollars, and then what that costs in rupees.
 */
export function usdToPkr(usd: number, rate: number, taxPercent = PAYMENT_TAX_RATE * 100): number {
  return usd * (1 + taxPercent / 100) * rate;
}
