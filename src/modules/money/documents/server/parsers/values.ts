// Low-level readers for amounts, dates, units and identifiers in bill text. Pure; runs in Node
// (relative .ts imports only). Every reader returns null rather than guessing.

/** Normalise text from a PDF text layer or OCR: unify spaces, dashes and line endings. */
export function normalizeText(text: string): string {
  return text
    .normalize("NFKC")
    .replace(/\r\n?/g, "\n")
    .replace(/[   \t]/g, " ")
    .replace(/[‐-―−]/g, "-")
    .replace(/[‘’]/g, "'")
    .replace(/ {2,}/g, " ")
    .split("\n")
    .map((line) => line.trim())
    .join("\n");
}

/** Lower-case, accent-free copy for keyword matching ("Bord Gáis" → "bord gais"). */
export function foldForMatch(text: string): string {
  return text.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
}

export function splitLines(text: string): string[] {
  return text.split("\n").filter((line) => line.length > 0);
}

// Money ---------------------------------------------------------------------------------------------

// An amount with exactly two decimals, optionally signed, with € or EUR, optionally "CR" (credit).
// Not followed by more digits, "%", "c"/"cent" (unit rates), "kWh" or "per" (rates per day/unit).
const MONEY =
  /(?<![\d.,])(-)?(?:€|EUR\s?)?\s?(-)?(\d{1,3}(?:,\d{3})+|\d+)\.(\d{2})(?!\d|\.\d|,\d)(?!\s?%)(?!\s?c(?:ent)?s?\b)(?!\s?c\/)(?!\s?\/\s?kwh)(?!\s?kwh)(?!\s?per\b)(\s?CR\b)?/gi;

export type MoneyToken = { cents: number; index: number; raw: string };

export function findMoney(text: string): MoneyToken[] {
  const tokens: MoneyToken[] = [];
  for (const match of text.matchAll(MONEY)) {
    const [raw, minusBefore, minusAfter, whole, fraction, credit] = match;
    const cents = Number(whole.replace(/,/g, "")) * 100 + Number(fraction);
    if (!Number.isSafeInteger(cents)) continue;
    const negative = Boolean(minusBefore || minusAfter || credit);
    tokens.push({
      cents: negative ? -cents : cents,
      index: match.index ?? 0,
      raw: raw.trim(),
    });
  }
  return tokens;
}

// Dates ---------------------------------------------------------------------------------------------

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
const MONTH_NAME =
  "(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|june?|july?|aug(?:ust)?|sept?(?:ember)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)";

const DATE_PATTERNS: {
  re: RegExp;
  parts: (m: RegExpExecArray) => [number, number, number];
}[] = [
  // 2026-10-03
  {
    re: /(?<!\d)(\d{4})-(\d{2})-(\d{2})(?!\d)/gi,
    parts: (m) => [Number(m[1]), Number(m[2]), Number(m[3])],
  },
  // 03/10/2026, 3-10-2026, 03.10.2026, 03/10/26 (Irish order: day first)
  {
    re: /(?<![\d./-])(\d{1,2})([/.-])(\d{1,2})\2(\d{4}|\d{2})(?![\d/.-]\d)/gi,
    parts: (m) => [twoDigitYear(m[4]), Number(m[3]), Number(m[1])],
  },
  // 3 Oct 2026, 03 October 2026, 3rd October 2026, 3-Oct-2026, 3 Oct '26
  {
    re: new RegExp(
      `(?<!\\d)(\\d{1,2})(?:st|nd|rd|th)?[\\s-]+${MONTH_NAME}\\.?,?[\\s-]+'?(\\d{4}|\\d{2})(?!\\d)`,
      "gi",
    ),
    parts: (m) => [twoDigitYear(m[3]), monthNumber(m[2]), Number(m[1])],
  },
  // October 3, 2026
  {
    re: new RegExp(
      `\\b${MONTH_NAME}\\.?\\s+(\\d{1,2})(?:st|nd|rd|th)?,?\\s+(\\d{4})(?!\\d)`,
      "gi",
    ),
    parts: (m) => [Number(m[3]), monthNumber(m[1]), Number(m[2])],
  },
];

function twoDigitYear(value: string): number {
  return value.length === 2 ? 2000 + Number(value) : Number(value);
}

function monthNumber(name: string): number {
  return (
    MONTHS[
      name.slice(0, name.toLowerCase().startsWith("sept") ? 4 : 3).toLowerCase()
    ] ?? 0
  );
}

export function isoDate(y: number, m: number, d: number): string | null {
  if (y < 2000 || y > 2100 || m < 1 || m > 12 || d < 1 || d > 31) return null;
  const date = new Date(Date.UTC(y, m - 1, d));
  if (date.getUTCMonth() !== m - 1 || date.getUTCDate() !== d) return null;
  return date.toISOString().slice(0, 10);
}

export type DateToken = { iso: string; index: number; end: number };

/** Every real calendar date in the text, in reading order. */
export function findDates(text: string): DateToken[] {
  const found: DateToken[] = [];
  for (const { re, parts } of DATE_PATTERNS) {
    re.lastIndex = 0;
    let match: RegExpExecArray | null;
    while ((match = re.exec(text))) {
      const [y, m, d] = parts(match);
      const iso = isoDate(y, m, d);
      const index = match.index;
      const end = index + match[0].length;
      if (iso && !found.some((t) => index < t.end && end > t.index)) {
        found.push({ iso, index, end });
      }
    }
  }
  return found.sort((a, b) => a.index - b.index);
}

// Numbers, units and rates -------------------------------------------------------------------------

/** "1,234.50" → "1234.5"; "412" → "412". Exact decimal string, no floating point. */
export function decimalString(raw: string): string | null {
  const cleaned = raw.replace(/,/g, "");
  const match = /^(\d+)(?:\.(\d+))?$/.exec(cleaned);
  if (!match) return null;
  const whole = match[1].replace(/^0+(?=\d)/, "");
  const fraction = (match[2] ?? "").replace(/0+$/, "");
  return fraction ? `${whole}.${fraction}` : whole;
}

/** Moves the decimal point two places right: euro per kWh "0.3712" → cent per kWh "37.12". */
export function eurosToCentsString(raw: string): string | null {
  const value = decimalString(raw);
  if (!value) return null;
  const [whole, fraction = ""] = value.split(".");
  const padded = fraction.padEnd(2, "0");
  return decimalString(
    `${whole}${padded.slice(0, 2)}.${padded.slice(2) || "0"}`,
  );
}

const KWH = /(?<![\d.,])(\d{1,3}(?:,\d{3})+|\d+)(\.\d+)?\s?kwh\b/i;
const RATE_CENTS =
  /(?<![\d.,])(\d{1,3}(?:\.\d{1,4})?)\s?(?:c|cent|cents)(?:\s?(?:\/|per)\s?kwh)?\b/i;
const RATE_EUROS = /€\s?(\d\.\d{2,6})\s?(?:\/|per)\s?kwh\b/i;
const PLAIN_NUMBER =
  /(?<![\d.,€])(\d{1,3}(?:,\d{3})+|\d+)(\.\d{1,3})?(?![\d.,]*\s?(?:%|c\b|cent|\/|per))/g;

/**
 * Units used on a line. Prefers "412 kWh"; otherwise meter readings "previous present used"
 * where used = present − previous; otherwise a single plain number. Null when unclear.
 */
export function readUnits(
  text: string,
): { value: string; via: "kwh" | "readings" | "single" } | null {
  const kwh = KWH.exec(text);
  if (kwh) {
    const value = decimalString(kwh[1] + (kwh[2] ?? ""));
    if (value) return { value, via: "kwh" };
  }
  const withoutMoney = blankOut(
    text,
    findMoney(text).map((t) => [t.index, t.index + t.raw.length]),
  );
  const withoutRates = withoutMoney
    .replace(new RegExp(RATE_CENTS.source, "gi"), " ")
    .replace(new RegExp(RATE_EUROS.source, "gi"), " ");
  const numbers = [...withoutRates.matchAll(PLAIN_NUMBER)]
    .map((m) => decimalString(m[1] + (m[2] ?? "")))
    .filter((n): n is string => n !== null);
  if (numbers.length >= 3) {
    for (let i = 2; i < numbers.length; i += 1) {
      const [prev, present, used] = [
        numbers[i - 2],
        numbers[i - 1],
        numbers[i],
      ];
      if (isInteger(prev) && isInteger(present) && isInteger(used)) {
        if (
          BigInt(present) - BigInt(prev) === BigInt(used) &&
          BigInt(used) > 0n
        ) {
          return { value: used, via: "readings" };
        }
      }
    }
    return null;
  }
  if (numbers.length === 1) return { value: numbers[0], via: "single" };
  return null;
}

function isInteger(value: string): boolean {
  return /^\d+$/.test(value);
}

function blankOut(text: string, ranges: [number, number][]): string {
  let out = text;
  for (const [start, end] of ranges) {
    out = out.slice(0, start) + " ".repeat(end - start) + out.slice(end);
  }
  return out;
}

/** Unit rate in cent per kWh as a decimal string: "37.12c", "37.12 c/kWh" or "€0.3712/kWh". */
export function readRate(text: string): string | null {
  const euros = RATE_EUROS.exec(text);
  if (euros) return eurosToCentsString(euros[1]);
  const cents = RATE_CENTS.exec(text);
  if (cents) return decimalString(cents[1]);
  return null;
}

/** "VAT @ 9%" → "9"; "13.5%" → "13.5". */
export function readPercent(text: string): string | null {
  const match = /(?<![\d.])(\d{1,2}(?:\.\d{1,2})?)\s?%/.exec(text);
  return match ? decimalString(match[1]) : null;
}

// Identifiers -------------------------------------------------------------------------------------------

export const MASK = "••••";

/** Keeps the last four characters only: "9 1234 5678" → "•••• 5678". */
export function maskIdentifier(raw: string): string | null {
  const compact = raw.replace(/[\s-]/g, "");
  if (compact.length < 5) return null;
  return `${MASK} ${compact.slice(-4)}`;
}

/** Account number after a label: digits (spaces or dashes allowed) or one letters-and-digits token. */
export function readAccount(text: string): string | null {
  const cleaned = text.replace(
    /^[\s:.#-]*(?:no\.?|number|ref(?:erence)?)?[\s:.#]*/i,
    "",
  );
  const digits = /^(\d(?:[ -]?\d){4,19})(?![\d])/.exec(cleaned);
  if (digits) return maskIdentifier(digits[1]);
  const token = /^([A-Z0-9]{5,20})(?![A-Za-z0-9])/i.exec(cleaned);
  if (token && (token[1].match(/\d/g) ?? []).length >= 4) {
    return maskIdentifier(token[1]);
  }
  return null;
}

/** MPRN: 11 digits beginning with 10 (spaces allowed). */
export function readMprn(text: string): string | null {
  const match = /(?<!\d)(1\s?0(?:\s?\d){9})(?!\s?\d)/.exec(text);
  return match ? maskIdentifier(match[1]) : null;
}

/** GPRN: 7 digits (spaces allowed). */
export function readGprn(text: string): string | null {
  const match = /(?<![\d])(\d(?:\s?\d){6})(?!\s?\d)/.exec(text);
  return match ? maskIdentifier(match[1]) : null;
}

/** Invoice or bill number: first token of 4–24 letters/digits that contains a digit. */
export function readReference(text: string): string | null {
  const cleaned = text.replace(/^[\s:.#-]*(?:no\.?|number)?[\s:.#]*/i, "");
  const match = /^([A-Z0-9][A-Z0-9/-]{3,23})(?![A-Za-z0-9])/i.exec(cleaned);
  if (!match || !/\d/.test(match[1])) return null;
  return match[1].toUpperCase();
}

/**
 * Masks every run of 7 or more digits (single spaces or dashes allowed inside) down to its last four,
 * so snippets shown on screen never carry full account, meter, phone or card numbers. Dates survive.
 */
export function redactSnippet(line: string, maxLength = 140): string {
  const masked = line.replace(/\d(?:[ -]?\d){6,}/g, (run) => {
    if (/^\d{4}-\d{2}-\d{2}$|^\d{1,2}-\d{1,2}-\d{2,4}$/.test(run)) return run;
    return `${MASK}${run.replace(/[ -]/g, "").slice(-4)}`;
  });
  return masked.length > maxLength
    ? `${masked.slice(0, maxLength - 1)}…`
    : masked;
}
