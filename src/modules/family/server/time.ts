// Wall-clock helpers for the household timezone. Pure, no I/O; runs in plain Node too
// (relative .ts imports, no Next.js APIs).
import {
  addDays,
  dublinDate,
  HOUSEHOLD_TIMEZONE,
  type IsoDate,
} from "../../../server/domain/dates.ts";

export { addDays, dublinDate, type IsoDate };

export type HhMm = string; // "18:15"

const HH_MM = /^([01]\d|2[0-3]):([0-5]\d)(?::[0-5]\d)?$/;
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

export function isIsoDate(value: string): boolean {
  if (!ISO_DATE.test(value)) return false;
  const [y, m, d] = value.split("-").map(Number);
  const check = new Date(Date.UTC(y, m - 1, d));
  return check.getUTCMonth() === m - 1 && check.getUTCDate() === d;
}

export function parseHhMm(value: string): { h: number; m: number } {
  const match = HH_MM.exec(value);
  if (!match) throw new Error(`Not a time: ${value}`);
  return { h: Number(match[1]), m: Number(match[2]) };
}

const offsetFormatters = new Map<string, Intl.DateTimeFormat>();

/** Milliseconds the zone is ahead of UTC at `instant` (e.g. +1h in Irish summer time). */
function zoneOffsetMs(instant: number, timeZone: string): number {
  let fmt = offsetFormatters.get(timeZone);
  if (!fmt) {
    fmt = new Intl.DateTimeFormat("en-US", {
      timeZone,
      hourCycle: "h23",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });
    offsetFormatters.set(timeZone, fmt);
  }
  const parts: Record<string, number> = {};
  for (const p of fmt.formatToParts(new Date(instant))) {
    if (p.type !== "literal") parts[p.type] = Number(p.value);
  }
  const asUtc = Date.UTC(
    parts.year,
    parts.month - 1,
    parts.day,
    parts.hour,
    parts.minute,
    parts.second,
  );
  return asUtc - Math.floor(instant / 1000) * 1000;
}

/**
 * The instant at which the household's clocks show `date` `time`.
 * In the spring gap (01:00–02:00 on the last Sunday of March) the time is read as GMT,
 * i.e. it lands an hour later on the wall clock; in the autumn overlap the first (summer) one wins.
 */
export function zonedInstant(
  date: IsoDate,
  time: HhMm = "00:00",
  timeZone = HOUSEHOLD_TIMEZONE,
): Date {
  if (!isIsoDate(date)) throw new Error(`Not an ISO date: ${date}`);
  const [y, mo, d] = date.split("-").map(Number);
  const { h, m } = parseHhMm(time);
  const wall = Date.UTC(y, mo - 1, d, h, m);
  const DAY = 86_400_000;
  // Offsets a day either side cover any single clock change on this date.
  const before = wall - zoneOffsetMs(wall - DAY, timeZone);
  const after = wall - zoneOffsetMs(wall + DAY, timeZone);
  const valid = [before, after].filter(
    (c) => zoneOffsetMs(c, timeZone) === wall - c,
  );
  // Autumn overlap: both are valid, take the earlier. Spring gap: neither, use the old offset.
  return new Date(valid.length > 0 ? Math.min(...valid) : before);
}

/** "18:15" on the household's clocks. */
export function dublinTime(instant: Date, timeZone = HOUSEHOLD_TIMEZONE): HhMm {
  return new Intl.DateTimeFormat("en-GB", {
    timeZone,
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).format(instant);
}

/** 1 = Monday … 7 = Sunday. */
export function isoWeekday(date: IsoDate): number {
  const [y, m, d] = date.split("-").map(Number);
  const day = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
  return day === 0 ? 7 : day;
}

/** Monday of the week containing `date`. */
export function weekStart(date: IsoDate): IsoDate {
  return addDays(date, 1 - isoWeekday(date));
}

const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const MONTHS = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
];

export function weekdayShort(date: IsoDate): string {
  return WEEKDAYS[isoWeekday(date) - 1];
}

/** "Sat 24 Oct" (adds the year when it isn't `currentYear`). */
export function formatShortDate(date: IsoDate, currentYear?: number): string {
  const [y, m, d] = date.split("-").map(Number);
  const base = `${weekdayShort(date)} ${d} ${MONTHS[m - 1]}`;
  return currentYear !== undefined && currentYear !== y ? `${base} ${y}` : base;
}

/** "19 Oct" or "19 Oct 2027". */
export function formatDayMonth(date: IsoDate, currentYear?: number): string {
  const [y, m, d] = date.split("-").map(Number);
  const base = `${d} ${MONTHS[m - 1]}`;
  return currentYear !== undefined && currentYear !== y ? `${base} ${y}` : base;
}

export function monthName(month: number): string {
  return MONTHS[month - 1];
}

export function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

/** "Today", "Tomorrow", "Yesterday", or "Sat 24 Oct" (with the year if it differs). */
export function relativeDay(date: IsoDate, today: IsoDate): string {
  if (date === today) return "Today";
  if (date === addDays(today, 1)) return "Tomorrow";
  if (date === addDays(today, -1)) return "Yesterday";
  return formatShortDate(date, Number(today.slice(0, 4)));
}

/** Add calendar months, clamping to the month's last day (31 Jan + 1 month = 28/29 Feb). */
export function addMonthsClamped(date: IsoDate, months: number): IsoDate {
  if (!Number.isInteger(months))
    throw new Error("months must be a whole number");
  const [y, m, d] = date.split("-").map(Number);
  const index = y * 12 + (m - 1) + months;
  const ty = Math.floor(index / 12);
  const tm = (index % 12) + 1;
  const td = Math.min(d, daysInMonth(ty, tm));
  return `${String(ty).padStart(4, "0")}-${String(tm).padStart(2, "0")}-${String(td).padStart(2, "0")}`;
}
