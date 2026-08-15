/**
 * Converting terminal wall-clock readings into real instants.
 *
 * A ZKTeco terminal reports "2026-08-12 07:58:12" with no timezone attached —
 * it is whatever the clock on the factory wall said. Handing that string to
 * `new Date()` makes Node interpret it in the *server's* timezone, so the same
 * punch lands at a different instant depending on where the app is deployed.
 * Every derived hour, and therefore every payslip, shifts with it.
 *
 * These helpers anchor the reading to the site's own timezone instead, which
 * is stored per device.
 */

interface WallClock {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
}

/** Accepts "YYYY-MM-DD HH:MM:SS" or the same with a T separator. */
export function parseWallClock(value: string): WallClock | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2}):(\d{2})$/.exec(value.trim());
  if (!match) return null;

  const [, year, month, day, hour, minute, second] = match;
  return {
    year: Number(year),
    month: Number(month),
    day: Number(day),
    hour: Number(hour),
    minute: Number(minute),
    second: Number(second),
  };
}

/**
 * How far the zone is ahead of UTC at a given instant, in milliseconds.
 *
 * Derived from Intl rather than a lookup table so it stays correct across DST
 * transitions and any future offset change, with no extra dependency.
 */
function zoneOffsetMs(instant: Date, timeZone: string): number {
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hour12: false,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });

  const parts: Record<string, number> = {};
  for (const part of formatter.formatToParts(instant)) {
    if (part.type !== "literal") parts[part.type] = Number(part.value);
  }

  const asUtc = Date.UTC(
    parts["year"] ?? 1970,
    (parts["month"] ?? 1) - 1,
    parts["day"] ?? 1,
    // Intl renders midnight as hour 24 in some locales/engines.
    (parts["hour"] ?? 0) % 24,
    parts["minute"] ?? 0,
    parts["second"] ?? 0,
  );

  return asUtc - instant.getTime();
}

/**
 * Resolves a wall-clock reading in `timeZone` to the instant it refers to.
 *
 * Applied twice: the first correction can land on the other side of a DST
 * boundary, where the offset differs from the one just used. The second pass
 * settles it.
 */
export function zonedWallClockToUtc(value: string, timeZone: string): Date | null {
  const wall = parseWallClock(value);
  if (!wall) return null;

  const naive = Date.UTC(wall.year, wall.month - 1, wall.day, wall.hour, wall.minute, wall.second);

  let instant = new Date(naive - zoneOffsetMs(new Date(naive), timeZone));
  instant = new Date(naive - zoneOffsetMs(instant, timeZone));

  return instant;
}

/**
 * Renders a Date back to the wall-clock string it was built from.
 *
 * decodeDeviceTime() constructs a Date from the terminal's raw fields using
 * local-time components, so reading those same components back recovers the
 * original factory wall clock. That string then goes through the identical
 * timezone path as the push protocol, keeping both transports consistent.
 */
export function toWallClockString(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return (
    `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ` +
    `${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`
  );
}

/**
 * The calendar date a punch belongs to, judged in the site's timezone.
 *
 * Taken straight from the reading's own date fields rather than from a
 * converted instant, so the answer cannot drift with the server's locale.
 * Readings before the cutoff hour roll back a day for night shifts — see
 * workDateFor in @/lib/attendance/compute for why the default stays low.
 */
export function workDateFromWallClock(value: string, nightShiftCutoffHour = 5): string | null {
  const wall = parseWallClock(value);
  if (!wall) return null;

  const date = new Date(Date.UTC(wall.year, wall.month - 1, wall.day));
  if (wall.hour < nightShiftCutoffHour) {
    date.setUTCDate(date.getUTCDate() - 1);
  }

  return date.toISOString().slice(0, 10);
}
