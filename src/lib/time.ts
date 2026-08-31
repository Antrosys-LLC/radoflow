/**
 * Time handling for RadoFlow.
 *
 * The business runs entirely in Pakistan, so Asia/Karachi is the single
 * reference timezone for every date the user sees or the payroll counts —
 * regardless of where the server runs or what locale the browser reports.
 * Timestamps are stored as UTC instants; this module is the only place that
 * decides how they are rendered back.
 */

import { zonedWallClockToUtc } from "@/lib/devices/timezone";

export const PAKISTAN_TIMEZONE = "Asia/Karachi";
export const PAKISTAN_LOCALE = "en-PK";
export const CURRENCY = "PKR";

/** "14 Aug 2026" */
export function formatDate(value: string | Date | null | undefined): string {
  const date = toDate(value);
  if (!date) return "—";
  return new Intl.DateTimeFormat(PAKISTAN_LOCALE, {
    timeZone: PAKISTAN_TIMEZONE,
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(date);
}

/** "07:58 AM" — factory-floor time, always Pakistan. */
export function formatTime(value: string | Date | null | undefined): string {
  const date = toDate(value);
  if (!date) return "—";
  return new Intl.DateTimeFormat(PAKISTAN_LOCALE, {
    timeZone: PAKISTAN_TIMEZONE,
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
  }).format(date);
}

/** "14 Aug 2026, 07:58 AM" */
export function formatDateTime(value: string | Date | null | undefined): string {
  const date = toDate(value);
  if (!date) return "—";
  return `${formatDate(date)}, ${formatTime(date)}`;
}

/** "2026-08-14" as it falls in Pakistan, not in the server's zone. */
export function todayInPakistan(now: Date = new Date()): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: PAKISTAN_TIMEZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
  return parts;
}

/**
 * The instant a Pakistan calendar day begins, as an ISO string.
 *
 * For filtering a `timestamptz` column by "today". Postgres resolves a bare
 * `2026-08-31T00:00:00` in the *session's* zone, which on Supabase is UTC —
 * five hours late in Pakistan — so a query written that way silently drops
 * everything recorded between midnight and 5am local. That is not a quiet
 * corner: the canteen's night-shift window runs 22:00–02:00, and the gate
 * takes its first punches before dawn.
 *
 * Pass the exclusive upper bound too, from `pakistanDayStartUtc(nextDay)`,
 * whenever the range needs to end rather than run on forever.
 */
export function pakistanDayStartUtc(date: string): string {
  const instant = zonedWallClockToUtc(`${date} 00:00:00`, PAKISTAN_TIMEZONE);
  // A malformed date cannot produce a boundary; falling back to the naive
  // string keeps the caller's query valid rather than throwing at render.
  return instant ? instant.toISOString() : `${date}T00:00:00Z`;
}

/** "3 minutes ago" — for device heartbeats and live feeds. */
export function timeAgo(value: string | Date | null | undefined, now: Date = new Date()): string {
  const date = toDate(value);
  if (!date) return "never";

  const seconds = Math.round((now.getTime() - date.getTime()) / 1000);
  if (seconds < 0) return "just now";
  if (seconds < 60) return `${seconds}s ago`;

  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes} min ago`;

  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;

  const days = Math.round(hours / 24);
  if (days < 30) return `${days}d ago`;

  return formatDate(date);
}

/** PKR with local grouping: "₨ 18,420,000". */
export function formatPKR(value: number | null | undefined): string {
  if (value == null || Number.isNaN(value)) return "₨ 0";
  return `₨ ${Math.round(value).toLocaleString(PAKISTAN_LOCALE)}`;
}

/** "8.60 h" */
export function formatHours(value: number | null | undefined): string {
  if (value == null || Number.isNaN(value)) return "0 h";
  return `${Number(value).toFixed(2)} h`;
}

function toDate(value: string | Date | null | undefined): Date | null {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}
