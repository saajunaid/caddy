/**
 * Date helpers for the household timezone. Pure functions, no I/O.
 *
 * Date-only values are ISO strings ("2026-10-20"). Instants are Date objects (UTC).
 * "Today" always means the calendar date in Europe/Dublin, never the server's timezone.
 */

export const HOUSEHOLD_TIMEZONE = "Europe/Dublin";

export type IsoDate = string; // YYYY-MM-DD

const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;

/** Calendar date of `instant` in the household timezone, e.g. "2026-10-20". */
export function dublinDate(
  instant: Date,
  timeZone = HOUSEHOLD_TIMEZONE,
): IsoDate {
  // en-CA formats as YYYY-MM-DD.
  return new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(instant);
}

/** Hour (0–23) of `instant` in the household timezone. */
export function dublinHour(
  instant: Date,
  timeZone = HOUSEHOLD_TIMEZONE,
): number {
  const hour = new Intl.DateTimeFormat("en-GB", {
    timeZone,
    hour: "2-digit",
    hourCycle: "h23",
  }).format(instant);
  return Number(hour);
}

function parseIsoDate(date: IsoDate): { y: number; m: number; d: number } {
  const match = ISO_DATE.exec(date);
  if (!match) throw new Error(`Not an ISO date: ${date}`);
  const [y, m, d] = [Number(match[1]), Number(match[2]), Number(match[3])];
  const check = new Date(Date.UTC(y, m - 1, d));
  if (
    check.getUTCFullYear() !== y ||
    check.getUTCMonth() !== m - 1 ||
    check.getUTCDate() !== d
  ) {
    throw new Error(`Not a real calendar date: ${date}`);
  }
  return { y, m, d };
}

/** Add whole calendar days to a date-only value. Unaffected by daylight saving. */
export function addDays(date: IsoDate, days: number): IsoDate {
  if (!Number.isInteger(days)) throw new Error("days must be a whole number");
  const { y, m, d } = parseIsoDate(date);
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10);
}

/** Whole calendar days from `from` to `to` (negative if `to` is earlier). */
export function daysBetween(from: IsoDate, to: IsoDate): number {
  const a = parseIsoDate(from);
  const b = parseIsoDate(to);
  return Math.round(
    (Date.UTC(b.y, b.m - 1, b.d) - Date.UTC(a.y, a.m - 1, a.d)) / 86_400_000,
  );
}

/** "Tuesday 20 October" for a date-only value. */
export function formatLongDate(date: IsoDate): string {
  const { y, m, d } = parseIsoDate(date);
  // Build from parts so the output doesn't depend on the ICU version's punctuation.
  const parts = new Intl.DateTimeFormat("en-IE", {
    timeZone: "UTC",
    weekday: "long",
    day: "numeric",
    month: "long",
  }).formatToParts(new Date(Date.UTC(y, m - 1, d)));
  const part = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((p) => p.type === type)?.value ?? "";
  return `${part("weekday")} ${part("day")} ${part("month")}`;
}

/** Greeting for the household's local time of day. */
export function greetingFor(
  instant: Date,
  timeZone = HOUSEHOLD_TIMEZONE,
): string {
  const hour = dublinHour(instant, timeZone);
  if (hour < 12) return "Good morning";
  if (hour < 18) return "Good afternoon";
  return "Good evening";
}
