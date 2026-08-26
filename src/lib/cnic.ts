/**
 * Pakistani CNIC handling.
 *
 * The number is thirteen digits, written XXXXX-XXXXXXX-X. Staff read it off a
 * card and type it without dashes, or with dashes in the wrong places, so the
 * dashes are inserted here rather than demanded from the person typing.
 *
 * Stored with dashes, because that is how it appears on the card and how the
 * office writes it on paper — matching the two makes a mismatch obvious.
 */

/** Length of each dash-separated group, in order. */
const GROUPS = [5, 7, 1] as const;
const TOTAL_DIGITS = 13;

/** Strips everything that is not a digit, and caps at CNIC length. */
export function cnicDigits(input: string): string {
  return input.replace(/\D/g, "").slice(0, TOTAL_DIGITS);
}

/**
 * Formats whatever has been typed so far as XXXXX-XXXXXXX-X.
 *
 * Safe to call on every keystroke: a partial number keeps its dashes only as
 * far as the digits reach, so the field never shows a trailing dash the person
 * has not earned yet.
 */
export function formatCnic(input: string): string {
  const digits = cnicDigits(input);
  if (!digits) return "";

  const parts: string[] = [];
  let offset = 0;

  for (const size of GROUPS) {
    if (offset >= digits.length) break;
    parts.push(digits.slice(offset, offset + size));
    offset += size;
  }

  return parts.join("-");
}

/** True only for a complete thirteen-digit number. */
export function isValidCnic(input: string): boolean {
  return cnicDigits(input).length === TOTAL_DIGITS;
}

/**
 * The canonical stored form, or null if the number is incomplete.
 *
 * Returning null rather than throwing lets callers treat "no CNIC yet" and
 * "half a CNIC" the same way, which is what every form needs.
 */
export function normaliseCnic(input: string): string | null {
  return isValidCnic(input) ? formatCnic(input) : null;
}

/**
 * The synthetic login address for a CNIC.
 *
 * Supabase Auth is keyed on email, but floor staff have no email. Deriving one
 * from the CNIC keeps the auth row addressable without inventing a mailbox
 * nobody reads. `.invalid` is reserved by RFC 2606 precisely so it can never
 * collide with a real domain or accidentally receive mail.
 */
export function cnicLoginEmail(input: string): string {
  return `${cnicDigits(input)}@cnic.invalid`;
}
