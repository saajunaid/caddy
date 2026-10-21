// RFC 5545 calendar feed generator. Pure, no I/O; runs in plain Node too.
import { addDays, type IsoDate } from "./time.ts";

export const ICAL_PRODID = "-//Caddy//Family calendar//EN";
const UID_DOMAIN = "caddy.household";

export type IcsTimedEvent = {
  /** Stable across feed refreshes, e.g. "event-<id>-20261022". */
  uid: string;
  title: string;
  start: Date;
  end: Date | null;
  location?: string | null;
  description?: string | null;
  url?: string | null;
  updatedAt?: Date | null;
};

export type IcsAllDayEvent = {
  uid: string;
  title: string;
  /** First day. */
  date: IsoDate;
  /** Last day, inclusive. Defaults to `date`. */
  lastDate?: IsoDate | null;
  location?: string | null;
  description?: string | null;
  url?: string | null;
  updatedAt?: Date | null;
  /** Shown as free time (used for task due dates). */
  transparent?: boolean;
};

export type IcsTaskDue = {
  id: string;
  title: string;
  dueOn: IsoDate;
  dueTime?: string | null;
  notes?: string | null;
  url?: string | null;
  updatedAt?: Date | null;
};

/** Escapes a TEXT value: backslash, semicolon, comma and newlines (RFC 5545 §3.3.11). */
export function escapeText(value: string): string {
  return value
    .replace(/\\/g, "\\\\")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,")
    .replace(/\r\n|\r|\n/g, "\\n");
}

const encoder = new TextEncoder();

/**
 * Folds a content line so no physical line exceeds 75 octets (RFC 5545 §3.1).
 * Continuation lines start with a single space; multi-byte characters are never split.
 */
export function foldLine(line: string): string {
  if (encoder.encode(line).length <= 75) return line;
  const parts: string[] = [];
  let current = "";
  let bytes = 0;
  let limit = 75;
  for (const char of line) {
    const size = encoder.encode(char).length;
    if (bytes + size > limit) {
      parts.push(current);
      current = "";
      bytes = 0;
      limit = 74; // The leading space counts towards the 75.
    }
    current += char;
    bytes += size;
  }
  parts.push(current);
  return parts.join("\r\n ");
}

/** 20261022T171500Z */
export function formatUtc(instant: Date): string {
  return instant
    .toISOString()
    .replace(/\.\d{3}Z$/, "Z")
    .replace(/[-:]/g, "");
}

/** 20261022 */
export function formatDateValue(date: IsoDate): string {
  return date.replace(/-/g, "");
}

function uidValue(uid: string): string {
  return uid.includes("@") ? uid : `${uid}@${UID_DOMAIN}`;
}

function optionalText(
  name: string,
  value: string | null | undefined,
): string[] {
  return value && value.trim() ? [`${name}:${escapeText(value.trim())}`] : [];
}

function optionalUri(name: string, value: string | null | undefined): string[] {
  // URIs aren't TEXT; only allow plain http(s) links with no line breaks.
  return value && /^https?:\/\/\S+$/.test(value) ? [`${name}:${value}`] : [];
}

function timedEvent(event: IcsTimedEvent, stamp: string): string[] {
  return [
    "BEGIN:VEVENT",
    `UID:${uidValue(event.uid)}`,
    `DTSTAMP:${event.updatedAt ? formatUtc(event.updatedAt) : stamp}`,
    `DTSTART:${formatUtc(event.start)}`,
    ...(event.end && event.end > event.start
      ? [`DTEND:${formatUtc(event.end)}`]
      : []),
    `SUMMARY:${escapeText(event.title)}`,
    ...optionalText("LOCATION", event.location),
    ...optionalText("DESCRIPTION", event.description),
    ...optionalUri("URL", event.url),
    "END:VEVENT",
  ];
}

function allDayEvent(event: IcsAllDayEvent, stamp: string): string[] {
  const last =
    event.lastDate && event.lastDate > event.date ? event.lastDate : event.date;
  return [
    "BEGIN:VEVENT",
    `UID:${uidValue(event.uid)}`,
    `DTSTAMP:${event.updatedAt ? formatUtc(event.updatedAt) : stamp}`,
    `DTSTART;VALUE=DATE:${formatDateValue(event.date)}`,
    // DTEND is exclusive for dates.
    `DTEND;VALUE=DATE:${formatDateValue(addDays(last, 1))}`,
    `SUMMARY:${escapeText(event.title)}`,
    ...optionalText("LOCATION", event.location),
    ...optionalText("DESCRIPTION", event.description),
    ...optionalUri("URL", event.url),
    ...(event.transparent ? ["TRANSP:TRANSPARENT"] : []),
    "END:VEVENT",
  ];
}

/** A task's due date as an all-day event titled "Due: …". */
export function taskAsAllDay(task: IcsTaskDue): IcsAllDayEvent {
  const details = [
    task.dueTime ? `Due by ${task.dueTime.slice(0, 5)}` : null,
    task.notes?.trim() || null,
  ].filter(Boolean);
  return {
    uid: `task-${task.id}`,
    title: `Due: ${task.title}`,
    date: task.dueOn,
    description: details.length ? details.join("\n") : null,
    url: task.url ?? null,
    updatedAt: task.updatedAt ?? null,
    transparent: true,
  };
}

/** A complete VCALENDAR with CRLF line endings and folded lines. */
export function generateICalendar(input: {
  timed?: readonly IcsTimedEvent[];
  allDay?: readonly IcsAllDayEvent[];
  tasks?: readonly IcsTaskDue[];
  now: Date;
  name?: string;
}): string {
  const stamp = formatUtc(input.now);
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    `PRODID:${ICAL_PRODID}`,
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    `X-WR-CALNAME:${escapeText(input.name ?? "Caddy")}`,
    "X-WR-TIMEZONE:Europe/Dublin",
    "REFRESH-INTERVAL;VALUE=DURATION:PT1H",
    "X-PUBLISHED-TTL:PT1H",
    ...(input.timed ?? []).flatMap((e) => timedEvent(e, stamp)),
    ...(input.allDay ?? []).flatMap((e) => allDayEvent(e, stamp)),
    ...(input.tasks ?? []).flatMap((t) => allDayEvent(taskAsAllDay(t), stamp)),
    "END:VCALENDAR",
  ];
  return lines.map(foldLine).join("\r\n") + "\r\n";
}
