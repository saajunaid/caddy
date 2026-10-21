// Parsing of individual published values: rents, dates, bedrooms, property types.
// Pure functions, no I/O. Unknown or ambiguous input returns null; nothing is guessed.
import { addDays } from "../../../server/domain/dates.ts";
import { parseToCents } from "../../../server/domain/money.ts";
import type { PropertyType } from "./types.ts";

/** Collapse whitespace (including non-breaking spaces) and trim. */
export function clean(text: string | null | undefined): string | null {
  if (text == null) return null;
  const value = text.replace(/[\s ​]+/g, " ").trim();
  return value === "" ? null : value;
}

const AMOUNT = /(\d{1,3}(?:,\d{3})+|\d+)(?:\.(\d{1,2}))?(?!\d)/;

/**
 * "€1,495", "€1495", "From €1525", "€1,407 per calendar month", "1,302", "€1,462.50" → cents.
 * Returns null for "TBC", empty cells or text without an amount.
 */
export function parseRentCents(text: string | null | undefined): number | null {
  const value = clean(text);
  if (!value) return null;
  const match = AMOUNT.exec(value);
  if (!match) return null;
  return parseToCents(`${match[1]}${match[2] ? `.${match[2]}` : ""}`);
}

/** "327 Units", "20", "1 home" → 327, 20, 1. Null when there's no whole number. */
export function parseInteger(text: string | null | undefined): number | null {
  const value = clean(text);
  if (!value) return null;
  const match = /^(\d{1,3}(?:,\d{3})+|\d+)\b/.exec(value);
  if (!match) return null;
  return Number(match[1].replace(/,/g, ""));
}

const MONTHS: Record<string, number> = {
  jan: 1,
  feb: 2,
  mar: 3,
  apr: 4,
  may: 5,
  jun: 6,
  jul: 7,
  aug: 8,
  sep: 9,
  sept: 9,
  oct: 10,
  nov: 11,
  dec: 12,
};

function monthNumber(name: string): number | null {
  const key = name.toLowerCase();
  if (key.length < 3) return null;
  const short = key.startsWith("sept") ? "sept" : key.slice(0, 3);
  const month = MONTHS[short];
  if (!month) return null;
  // Accept "Oct", "Oct." and "October"; reject words that merely start like a month.
  const full = new Intl.DateTimeFormat("en-IE", {
    month: "long",
    timeZone: "UTC",
  })
    .format(new Date(Date.UTC(2026, month - 1, 1)))
    .toLowerCase();
  return full.startsWith(key) ? month : null;
}

function isoDate(year: number, month: number, day: number): string | null {
  const iso = `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
  try {
    addDays(iso, 0); // throws for impossible dates like 31 November
    return iso;
  } catch {
    return null;
  }
}

/**
 * Irish date formats → ISO date:
 * "2 November 2026", "02 November 2026 at 12:00", "21st of October 2026",
 * "Wed. Oct. 7th 2026", "02/11/2026" (day first). Null when no unambiguous date is present.
 */
export function parseIrishDate(text: string | null | undefined): string | null {
  const value = clean(text);
  if (!value) return null;

  const numeric = /\b(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})\b/.exec(value);
  if (numeric) {
    return isoDate(Number(numeric[3]), Number(numeric[2]), Number(numeric[1]));
  }

  const dayFirst =
    /\b(\d{1,2})(?:st|nd|rd|th)?(?:\s+of)?\s+([A-Za-z]{3,9})\.?,?\s+(\d{4})\b/.exec(
      value,
    );
  if (dayFirst) {
    const month = monthNumber(dayFirst[2]);
    if (month) return isoDate(Number(dayFirst[3]), month, Number(dayFirst[1]));
  }

  const monthFirst =
    /\b([A-Za-z]{3,9})\.?\s+(\d{1,2})(?:st|nd|rd|th)?,?\s+(\d{4})\b/.exec(
      value,
    );
  if (monthFirst) {
    const month = monthNumber(monthFirst[1]);
    if (month)
      return isoDate(Number(monthFirst[3]), month, Number(monthFirst[2]));
  }
  return null;
}

const WORD_NUMBERS: Record<string, number> = {
  one: 1,
  two: 2,
  three: 3,
  four: 4,
  five: 5,
  six: 6,
};

/** Bedrooms in a unit label: "3 Bed Duplex", "Three-bedroom house", "2-bed", "Studio". */
export function parseBedrooms(label: string | null | undefined): number | null {
  const value = clean(label)?.toLowerCase();
  if (!value) return null;
  const digits = /(\d+)\s*-?\s*(?:bed|bedroom|bedrooms|br)\b/.exec(value);
  if (digits) return Number(digits[1]);
  const words =
    /\b(one|two|three|four|five|six)[\s-]*(?:bed|bedroom|bedrooms)\b/.exec(
      value,
    );
  if (words) return WORD_NUMBERS[words[1]];
  if (/\bstudios?\b/.test(value)) return 0;
  return null;
}

/** Property type in a unit label. "Home", "2 bed" or anything unclear → "unknown". */
export function parsePropertyType(
  label: string | null | undefined,
): PropertyType {
  const value = clean(label)?.toLowerCase();
  if (!value) return "unknown";
  if (/\b(duplex|duplexes|maisonettes?)\b/.test(value)) return "duplex";
  if (
    /\b(houses?|terrace|terraced|semi-detached|detached|bungalows?|townhouses?)\b/.test(
      value,
    ) ||
    /\bmid-terrace/.test(value)
  ) {
    return "house";
  }
  if (/\b(apartments?|apts?|flats?|penthouses?|studios?)\b/.test(value)) {
    return "apartment";
  }
  return "unknown";
}

/** "1, 2 & 3 Bed" → [1, 2, 3]; "Studio, 1 & 2 Bed" → [0, 1, 2]; anything else → []. */
export function parseBedroomsSummary(
  text: string | null | undefined,
): number[] {
  const value = clean(text)?.toLowerCase();
  if (!value || !/\bbed/.test(value)) return [];
  const found = new Set<number>();
  if (/\bstudio/.test(value)) found.add(0);
  const before = value.split(/\bbed/)[0];
  for (const match of before.matchAll(/\d+/g)) found.add(Number(match[0]));
  return [...found].sort((a, b) => a - b);
}

/** "Shankill, Co. Dublin" → { locality: "Shankill", county: "Dublin" }. */
export function splitLocation(text: string | null | undefined): {
  locality: string | null;
  county: string | null;
} {
  const value = clean(text);
  if (!value) return { locality: null, county: null };
  const countyMatch = /\b(?:Co\.?|County)\s+([A-Z][A-Za-z]+)\s*$/.exec(value);
  const county = countyMatch ? countyMatch[1] : null;
  const rest = countyMatch ? value.slice(0, countyMatch.index) : value;
  const locality = clean(rest.replace(/[,\s]+$/, "").split(",")[0]);
  return { locality, county };
}
