// newstarterhomes.ie HTML → structured data. See docs/integrations/newstarterhomes.md.
// Pure (string in, data out). Runs in plain Node for scheduled jobs and in the Next server.
import { load, type CheerioAPI } from "cheerio/slim";
import type {
  CalendarDates,
  IndexCard,
  IndexPage,
  SourceStatus,
  UnitType,
} from "./types.ts";
import {
  clean,
  parseBedrooms,
  parseInteger,
  parseIrishDate,
  parsePropertyType,
  parseRentCents,
} from "./values.ts";

export const SOURCE_ORIGIN = "https://newstarterhomes.ie";
export const INDEX_URL = `${SOURCE_ORIGIN}/rent/`;
export const CALENDAR_URL = `${SOURCE_ORIGIN}/rent/calendar/`;

/** "/rent/woodbrook1/" (absolute or relative to `base`) → "woodbrook1". */
export function listingSlug(href: string, base = INDEX_URL): string | null {
  let url: URL;
  try {
    url = new URL(href, base);
  } catch {
    return null;
  }
  if (url.hostname !== new URL(SOURCE_ORIGIN).hostname) return null;
  const match = /^\/rent\/([a-z0-9][a-z0-9_-]*)\/?$/i.exec(url.pathname);
  if (!match) return null;
  const slug = match[1].toLowerCase();
  // The index has "map" and "calendar" views under /rent/ too.
  if (slug === "map" || slug === "calendar") return null;
  return slug;
}

export function listingUrl(slug: string): string {
  return `${SOURCE_ORIGIN}/rent/${slug}/`;
}

function statusFromText(text: string | null): SourceStatus | null {
  const value = text?.toLowerCase() ?? "";
  if (/applications?\s+closed/.test(value)) return "closed";
  if (/coming\s+soon|will\s+be\s+open\s+from/.test(value)) return "coming_soon";
  if (/applications?\s+(are\s+)?open|now\s+open/.test(value)) return "open";
  return null;
}

/** One page of the /rent/ list view. */
export function parseIndexPage(html: string, pageUrl: string): IndexPage {
  const $ = load(html);
  const cards: IndexCard[] = [];
  $("article.property").each((_, element) => {
    const card = $(element);
    const href =
      card.find("a.button").attr("href") ?? card.find("a").attr("href");
    const slug = href ? listingSlug(href, pageUrl) : null;
    const title = clean(card.find("h3").first().text());
    if (!slug || !title) return;
    const statusText = clean(card.find("p.status").text());
    const classes = (card.attr("class") ?? "").split(/\s+/);
    const fromClass: SourceStatus | null = classes.includes("closed")
      ? "closed"
      : classes.includes("soon")
        ? "coming_soon"
        : classes.includes("open")
          ? "open"
          : null;
    cards.push({
      externalId: slug,
      url: listingUrl(slug),
      title,
      sourceStatus: statusFromText(statusText) ?? fromClass ?? "unknown",
      statusText,
      locationText: clean(card.find("p.location").text()),
      rentFromCents: parseRentCents(card.find("p.price").text()),
      listedOn: parseIrishDate(card.find("p.date").text()),
    });
  });

  const countText = clean($("#count").text());
  const totalMatch = countText ? /of\s+([\d,]+)/i.exec(countText) : null;
  const nextHref = $("#paging #next a, #next a").first().attr("href");
  return {
    cards,
    total: totalMatch ? Number(totalMatch[1].replace(/,/g, "")) : null,
    nextUrl: nextHref ? new URL(nextHref, pageUrl).toString() : null,
  };
}

/**
 * The calendar view lists every listing with the dates applications opened and closed.
 * Returns the latest dates per slug, plus every slug seen (a cross-check on pagination).
 */
export function parseCalendarPage(html: string): {
  slugs: string[];
  dates: CalendarDates;
} {
  const $ = load(html);
  const dates: CalendarDates = new Map();
  const slugs = new Set<string>();
  $("article.calendar").each((_, element) => {
    const article = $(element);
    const day = parseIrishDate(article.find("h4").attr("aria-label") ?? "");
    article.find("div").each((__, group) => {
      const box = $(group);
      const heading = clean(box.find("h5").text())?.toLowerCase() ?? "";
      const opens = /open/.test(heading);
      const closes = /clos|deadline/.test(heading);
      box.find("li").each((___, item) => {
        const li = $(item);
        const slug = listingSlug(li.find("a").attr("href") ?? "");
        if (!slug) return;
        slugs.add(slug);
        const entry = dates.get(slug) ?? {
          openingDate: null,
          closingDate: null,
        };
        if (opens && day) {
          if (!entry.openingDate || day > entry.openingDate)
            entry.openingDate = day;
          const until = /until\s+([\d/]+)/i.exec(li.text());
          const untilDate = until ? parseIrishDate(until[1]) : null;
          if (
            untilDate &&
            (!entry.closingDate || untilDate > entry.closingDate)
          ) {
            entry.closingDate = untilDate;
          }
        } else if (closes && day) {
          if (!entry.closingDate || day > entry.closingDate)
            entry.closingDate = day;
        }
        dates.set(slug, entry);
      });
    });
  });
  return { slugs: [...slugs].sort(), dates };
}

/** Facts on a listing's own page. */
export type ListingPage = {
  title: string | null;
  headerCounty: string | null;
  sourceStatus: SourceStatus | null;
  statusText: string | null;
  openingDate: string | null;
  closingDate: string | null;
  closingText: string | null;
  rentFromCents: number | null;
  locationText: string | null;
  bedroomsText: string | null;
  totalHomes: number | null;
  unitTypes: UnitType[];
  /** A table was present but couldn't be read (unexpected layout). */
  tableUnreadable: boolean;
  provider: string | null;
  applyUrl: string | null;
  latitude: number | null;
  longitude: number | null;
};

type Columns = { label: number; homes: number | null; rent: number | null };

function headerColumns(cells: string[]): Columns | null {
  const lower = cells.map((c) => c.toLowerCase());
  const label = lower.findIndex((c) =>
    /propert(y|ies)\s*(type|available)|^type$|^unit\s*type|^home\s*type/.test(
      c,
    ),
  );
  const rent = lower.findIndex(
    (c) =>
      /cost\s*rent/.test(c) ||
      (/\brent\b/.test(c) && !/market|reduction|discount|omv|%/.test(c)),
  );
  const homes = lower.findIndex((c) =>
    /num(b)?er\s+of\s+(homes|units|properties)|^units$|^no\.?\s+of|^homes$/.test(
      c,
    ),
  );
  if (label === -1 && rent === -1) return null;
  return {
    label: label === -1 ? 0 : label,
    homes: homes === -1 ? null : homes,
    rent: rent === -1 ? null : rent,
  };
}

/** The "Properties Available" table. Header row may be <th> in <thead> or <td> in <tbody>. */
function parseUnitTable(
  $: CheerioAPI,
): { units: UnitType[]; unreadable: boolean } | null {
  const tables = $("main table, #content table").toArray();
  if (tables.length === 0) return null;
  for (const table of tables) {
    const rows = $(table)
      .find("tr")
      .toArray()
      .map((row) =>
        $(row)
          .find("th, td")
          .toArray()
          .map((cell) => clean($(cell).text()) ?? ""),
      );
    let columns: Columns | null = null;
    const units: UnitType[] = [];
    for (const cells of rows) {
      if (cells.every((c) => c === "")) continue;
      if (!columns) {
        columns = headerColumns(cells);
        continue;
      }
      if (headerColumns(cells) && parseBedrooms(cells[columns.label]) === null)
        continue; // repeated header
      const label = cells[columns.label];
      if (!label) continue;
      units.push({
        label,
        bedrooms: parseBedrooms(label),
        property_type: parsePropertyType(label),
        rent_cents:
          columns.rent === null ? null : parseRentCents(cells[columns.rent]),
        homes:
          columns.homes === null ? null : parseInteger(cells[columns.homes]),
      });
    }
    if (columns && units.length > 0) return { units, unreadable: false };
  }
  return { units: [], unreadable: true };
}

function infoValue($: CheerioAPI, heading: RegExp): string | null {
  let value: string | null = null;
  $("#info li").each((_, element) => {
    const item = $(element);
    if (value === null && heading.test(clean(item.find("h3").text()) ?? "")) {
      value = clean(item.find("p").text());
    }
  });
  return value;
}

/** Parse a listing page such as https://newstarterhomes.ie/rent/woodbrook1/. */
export function parseListingPage(html: string): ListingPage {
  const $ = load(html);
  const header = $("#image .pa").first();
  const title = clean(header.find("h2").first().text());
  const headerLocation = clean(header.find("p.location").text());
  const headerCounty = headerLocation
    ? (/(?:Co\.?|County)\s+([A-Z][A-Za-z]+)/.exec(headerLocation)?.[1] ?? null)
    : null;

  // Open listings show "Applications Close: <date>"; others show a status line.
  const closeText = clean(header.find("p.close").text());
  const notice = clean(header.find("p.soon, p.status").first().text());
  let sourceStatus: SourceStatus | null = null;
  let statusText: string | null = null;
  let closingDate: string | null = null;
  let closingText: string | null = null;
  let openingDate: string | null = null;
  if (closeText && /close/i.test(closeText)) {
    sourceStatus = "open";
    statusText = "Applications Open";
    closingText = clean(closeText.replace(/^applications?\s+close:?/i, ""));
    closingDate = parseIrishDate(closingText);
  } else if (notice) {
    sourceStatus = statusFromText(notice);
    statusText = notice;
    if (sourceStatus === "coming_soon") {
      const from = /open\s+from\s+(.*)$/i.exec(notice);
      openingDate = parseIrishDate(from ? from[1] : notice);
    }
  }

  const table = parseUnitTable($);
  const provider = (() => {
    let name: string | null = null;
    $("#details h3").each((_, element) => {
      const h = $(element);
      if (name === null && /contact/i.test(h.text())) {
        name = clean(h.nextAll("p").first().text());
      }
    });
    return name;
  })();

  const applyHref =
    $("#apply a").attr("href") ?? header.find('a[rel="external"]').attr("href");
  const center = $("#map").attr("data-center");
  const coords = center
    ? /^\s*(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)\s*$/.exec(center)
    : null;
  const latitude = coords ? Number(coords[1]) : null;
  const longitude = coords ? Number(coords[2]) : null;
  // Ireland is roughly 51.2–55.5 N, 5.3–10.7 W; anything else is a broken pin.
  const plausible =
    latitude !== null &&
    longitude !== null &&
    latitude > 51 &&
    latitude < 56 &&
    longitude > -11 &&
    longitude < -5;

  return {
    title,
    headerCounty,
    sourceStatus,
    statusText,
    openingDate,
    closingDate,
    closingText,
    rentFromCents: parseRentCents(infoValue($, /starting\s+from/i)),
    locationText: infoValue($, /location/i),
    bedroomsText: infoValue($, /bedrooms?/i),
    totalHomes: parseInteger(infoValue($, /availability/i)),
    unitTypes: table?.units ?? [],
    tableUnreadable: table?.unreadable ?? false,
    provider,
    applyUrl: applyHref && /^https?:\/\//.test(applyHref) ? applyHref : null,
    latitude: plausible ? latitude : null,
    longitude: plausible ? longitude : null,
  };
}
