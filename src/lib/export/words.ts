/**
 * A rupee amount in words, the way a Pakistani payslip writes it.
 *
 * Lakh and crore rather than hundred-thousand and million: "Rupees One Lakh
 * Ten Thousand Only" is what the accounts office writes on a cheque, and a
 * figure spelt in a grouping nobody at the counter uses is a figure they read
 * twice. Paisa are not written — every payslip here is in whole rupees.
 */

const ONES = [
  "",
  "One",
  "Two",
  "Three",
  "Four",
  "Five",
  "Six",
  "Seven",
  "Eight",
  "Nine",
  "Ten",
  "Eleven",
  "Twelve",
  "Thirteen",
  "Fourteen",
  "Fifteen",
  "Sixteen",
  "Seventeen",
  "Eighteen",
  "Nineteen",
] as const;

const TENS = ["", "", "Twenty", "Thirty", "Forty", "Fifty", "Sixty", "Seventy", "Eighty", "Ninety"];

/** 0–99. */
function belowHundred(n: number): string {
  if (n < 20) return ONES[n]!;
  const ones = n % 10;
  return ones === 0 ? TENS[Math.floor(n / 10)]! : `${TENS[Math.floor(n / 10)]}-${ONES[ones]}`;
}

/** 0–999. */
function belowThousand(n: number): string {
  const hundreds = Math.floor(n / 100);
  const rest = n % 100;
  const parts: string[] = [];
  if (hundreds > 0) parts.push(`${ONES[hundreds]} Hundred`);
  if (rest > 0) parts.push(belowHundred(rest));
  return parts.join(" ");
}

/** Whole rupees in words, without the "Rupees … Only" frame. */
export function numberToWords(value: number): string {
  let n = Math.floor(Math.abs(Math.round(value)));
  if (n === 0) return "Zero";

  const parts: string[] = [];

  const crore = Math.floor(n / 10_000_000);
  n %= 10_000_000;
  const lakh = Math.floor(n / 100_000);
  n %= 100_000;
  const thousand = Math.floor(n / 1000);
  n %= 1000;

  // A crore count can itself exceed a hundred: "One Hundred Twenty Crore".
  if (crore > 0) parts.push(`${numberToWords(crore)} Crore`);
  if (lakh > 0) parts.push(`${belowHundred(lakh)} Lakh`);
  if (thousand > 0) parts.push(`${belowHundred(thousand)} Thousand`);
  if (n > 0) parts.push(belowThousand(n));

  return parts.join(" ");
}

/** "Rupees Forty-Six Thousand Five Hundred Eighty-Five Only". */
export function rupeesInWords(value: number): string {
  return `Rupees ${numberToWords(value)} Only`;
}
