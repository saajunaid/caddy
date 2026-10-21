import { describe, expect, it } from "vitest";
import { escapeText, foldLine, generateICalendar } from "./ical";
import {
  feedUrls,
  generateFeedToken,
  hashFeedToken,
  parseFeedToken,
  shouldTouchLastUsed,
} from "./ical-token";

const NOW = new Date("2026-10-21T08:00:00Z");
const octets = (s: string) => new TextEncoder().encode(s).length;

/** Undo folding (RFC 5545 §3.1) to get logical lines back. */
const unfold = (ics: string) => ics.replace(/\r\n /g, "").split("\r\n");

describe("escapeText", () => {
  it("escapes backslashes, semicolons, commas and newlines", () => {
    expect(escapeText("Milk, eggs; bread\\butter\nand jam\r\nend")).toBe(
      "Milk\\, eggs\\; bread\\\\butter\\nand jam\\nend",
    );
  });
});

describe("foldLine", () => {
  it("leaves short lines alone", () => {
    expect(foldLine("SUMMARY:Dentist")).toBe("SUMMARY:Dentist");
  });

  it("folds at 75 octets with a leading space on continuation lines", () => {
    const line = `DESCRIPTION:${"x".repeat(200)}`;
    const folded = foldLine(line);
    const physical = folded.split("\r\n");
    expect(physical.length).toBeGreaterThan(2);
    for (const l of physical) expect(octets(l)).toBeLessThanOrEqual(75);
    expect(physical.slice(1).every((l) => l.startsWith(" "))).toBe(true);
    expect(folded.replace(/\r\n /g, "")).toBe(line);
  });

  it("never splits a multi-byte character", () => {
    const line = `SUMMARY:${"Scoil Mhuire – Gaelscoil Fhionnbarra ☘ ".repeat(5)}`;
    const physical = foldLine(line).split("\r\n");
    for (const l of physical) {
      expect(octets(l)).toBeLessThanOrEqual(75);
      expect(l).not.toContain("�");
    }
    expect(physical.join("\r\n").replace(/\r\n /g, "")).toBe(line);
  });
});

describe("generateICalendar", () => {
  const ics = generateICalendar({
    now: NOW,
    timed: [
      {
        uid: "event-abc-20261022",
        title: "Dentist, Ivy; check-up",
        start: new Date("2026-10-22T17:15:00Z"),
        end: new Date("2026-10-22T17:45:00Z"),
        location: "Main St, Limerick",
        description: "Bring card\nAsk about braces",
      },
      {
        uid: "event-noend",
        title: "Jumu'ah",
        start: new Date("2026-10-23T12:15:00Z"),
        end: null,
      },
    ],
    allDay: [
      {
        uid: "event-mid",
        title: "Midterm",
        date: "2026-10-26",
        lastDate: "2026-10-30",
      },
    ],
    tasks: [
      {
        id: "t1",
        title: "Book NCT",
        dueOn: "2026-10-24",
        url: "https://ncts.ie/",
      },
    ],
  });
  const lines = unfold(ics);

  it("is a VCALENDAR with CRLF line endings and the Caddy name", () => {
    expect(ics.startsWith("BEGIN:VCALENDAR\r\nVERSION:2.0\r\n")).toBe(true);
    expect(ics.endsWith("END:VCALENDAR\r\n")).toBe(true);
    expect(ics.replace(/\r\n/g, "")).not.toMatch(/[\r\n]/);
    expect(lines).toContain("PRODID:-//Caddy//Family calendar//EN");
    expect(lines).toContain("X-WR-CALNAME:Caddy");
  });

  it("writes timed events in UTC with stable UIDs and a DTSTAMP", () => {
    expect(lines).toContain("UID:event-abc-20261022@caddy.household");
    expect(lines).toContain("DTSTART:20261022T171500Z");
    expect(lines).toContain("DTEND:20261022T174500Z");
    expect(lines).toContain("DTSTAMP:20261021T080000Z");
    expect(lines).toContain("SUMMARY:Dentist\\, Ivy\\; check-up");
    expect(lines).toContain("LOCATION:Main St\\, Limerick");
    expect(lines).toContain("DESCRIPTION:Bring card\\nAsk about braces");
  });

  it("leaves DTEND out when an event has no end time", () => {
    const block = ics.slice(ics.indexOf("UID:event-noend"));
    expect(block.slice(0, block.indexOf("END:VEVENT"))).not.toContain("DTEND");
  });

  it("writes all-day events as dates with an exclusive end", () => {
    expect(lines).toContain("DTSTART;VALUE=DATE:20261026");
    expect(lines).toContain("DTEND;VALUE=DATE:20261031");
  });

  it("adds task due dates as all-day 'Due:' events", () => {
    expect(lines).toContain("UID:task-t1@caddy.household");
    expect(lines).toContain("SUMMARY:Due: Book NCT");
    expect(lines).toContain("DTSTART;VALUE=DATE:20261024");
    expect(lines).toContain("DTEND;VALUE=DATE:20261025");
    expect(lines).toContain("URL:https://ncts.ie/");
    expect(lines).toContain("TRANSP:TRANSPARENT");
  });

  it("balances every BEGIN with an END", () => {
    expect(lines.filter((l) => l === "BEGIN:VEVENT")).toHaveLength(4);
    expect(lines.filter((l) => l === "END:VEVENT")).toHaveLength(4);
  });

  it("is identical for identical input (stable for calendar apps)", () => {
    expect(
      generateICalendar({
        now: NOW,
        tasks: [{ id: "t", title: "x", dueOn: "2026-10-24" }],
      }),
    ).toBe(
      generateICalendar({
        now: NOW,
        tasks: [{ id: "t", title: "x", dueOn: "2026-10-24" }],
      }),
    );
  });
});

describe("feed tokens", () => {
  it("are random, URL-safe and hashed as hex SHA-256", () => {
    const a = generateFeedToken();
    const b = generateFeedToken();
    expect(a).not.toBe(b);
    expect(a).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(hashFeedToken("abc")).toBe(
      "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad",
    );
  });

  it("parse from a URL segment with or without .ics", () => {
    const token = generateFeedToken();
    expect(parseFeedToken(token)).toBe(token);
    expect(parseFeedToken(`${token}.ics`)).toBe(token);
    expect(parseFeedToken("short")).toBeNull();
    expect(parseFeedToken(`${token}/../x`)).toBeNull();
  });

  it("build https and webcal URLs", () => {
    expect(feedUrls("https://caddy.example/", "tok")).toEqual({
      https: "https://caddy.example/api/ical/tok.ics",
      webcal: "webcal://caddy.example/api/ical/tok.ics",
    });
  });

  it("touch last_used_at at most hourly", () => {
    expect(shouldTouchLastUsed(null, NOW)).toBe(true);
    expect(
      shouldTouchLastUsed(new Date(NOW.getTime() - 59 * 60_000), NOW),
    ).toBe(false);
    expect(
      shouldTouchLastUsed(new Date(NOW.getTime() - 60 * 60_000), NOW),
    ).toBe(true);
  });
});
