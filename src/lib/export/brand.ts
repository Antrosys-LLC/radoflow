/**
 * What every download says about who it came from.
 *
 * One place for the name and the timestamp so a PDF and a workbook made from
 * the same screen cannot disagree about either.
 */

export const COMPANY_NAME = "RADO DYEING & TEXTILE";

/** "Generated 13 Sep 2026, 22:05 PKT" — the factory's clock, not the server's. */
export function generatedStamp(now = new Date()): string {
  const stamp = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Karachi",
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(now);
  return `Generated ${stamp} PKT`;
}
