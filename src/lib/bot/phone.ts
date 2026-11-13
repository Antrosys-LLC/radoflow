/**
 * Phone numbers, compared the way a person would.
 *
 * WhatsApp reports a sender as `923001234567@s.whatsapp.net`; the office typed
 * the same number as `0300-1234567`, `+92 300 1234567` or `3001234567`. All of
 * them are one person, so numbers are compared on their last ten digits — the
 * subscriber number in Pakistan — and never on formatting.
 */
export function phoneKey(raw: string | null | undefined): string {
  const digits = String(raw ?? "")
    // A WhatsApp id carries the device suffix after a colon and the domain after @.
    .replace(/[:@].*$/, "")
    .replace(/\D/g, "");
  return digits.length >= 10 ? digits.slice(-10) : "";
}

/** True when both are real numbers and the same subscriber. */
export function samePhone(a: string | null | undefined, b: string | null | undefined): boolean {
  const left = phoneKey(a);
  return left !== "" && left === phoneKey(b);
}
