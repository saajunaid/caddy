// Currency maths for the travel planner. Pure, no I/O, runs in plain Node (jobs) and the app.
// Amounts are integer minor units of their currency. Conversion to euro uses a dated ECB rate
// held as an exact decimal string and bigint arithmetic, rounding half-up exactly once.
import type { IsoDate } from "../../../server/domain/dates.ts";

/** ISO 4217 minor-unit exponents for the currencies Caddy accepts. */
export const CURRENCY_EXPONENTS = {
  EUR: 2,
  GBP: 2,
  USD: 2,
  TRY: 2,
  MAD: 2,
  AED: 2,
  EGP: 2,
  JPY: 0,
  CHF: 2,
  PLN: 2,
  CZK: 2,
  HUF: 2,
  ISK: 0,
  SEK: 2,
  NOK: 2,
  DKK: 2,
  RON: 2,
  THB: 2,
  AUD: 2,
  CAD: 2,
  NZD: 2,
} as const satisfies Record<string, number>;

export type Currency = keyof typeof CURRENCY_EXPONENTS;

/** Currencies offered in forms, euro first. */
export const CURRENCIES = Object.keys(
  CURRENCY_EXPONENTS,
) as readonly Currency[];

/**
 * Currencies the ECB publishes a daily reference rate for (subset Caddy accepts). Others (MAD,
 * AED, EGP) can be entered but can't be converted until a rate source exists for them.
 */
export const ECB_CURRENCIES: ReadonlySet<string> = new Set([
  "USD",
  "JPY",
  "CZK",
  "DKK",
  "GBP",
  "HUF",
  "PLN",
  "RON",
  "SEK",
  "CHF",
  "ISK",
  "NOK",
  "TRY",
  "AUD",
  "CAD",
  "NZD",
  "THB",
]);

export function isCurrency(value: string): value is Currency {
  return (CURRENCIES as readonly string[]).includes(value);
}

export function exponentOf(currency: string): number {
  if (!isCurrency(currency))
    throw new Error(`Unsupported currency ${currency}`);
  return CURRENCY_EXPONENTS[currency];
}

/**
 * Parse a price typed by a person ("1,234.56", "€612", "2150") into minor units of `currency`.
 * Rejects more decimal places than the currency has (e.g. "100.5" yen).
 */
export function parseMinor(input: string, currency: string): number {
  const exponent = exponentOf(currency);
  const cleaned = input.trim().replace(/[€£$¥₺,\s]/g, "");
  const match = /^(\d+)(?:\.(\d+))?$/.exec(cleaned);
  if (!match) throw new Error(`Not a price: "${input}"`);
  const [, whole, fraction = ""] = match;
  if (fraction.length > exponent) {
    throw new Error(
      exponent === 0
        ? `${currency} prices have no decimal places`
        : `${currency} prices have at most ${exponent} decimal places`,
    );
  }
  const minor =
    BigInt(whole) * 10n ** BigInt(exponent) +
    BigInt(fraction.padEnd(exponent, "0") || "0");
  if (minor > BigInt(Number.MAX_SAFE_INTEGER))
    throw new Error("Price too large");
  return Number(minor);
}

/** Minor units as a plain decimal string, e.g. (215000, "TRY") → "2150.00", (5000, "JPY") → "5000". */
export function minorToDecimal(minor: number, currency: string): string {
  if (!Number.isSafeInteger(minor) || minor < 0)
    throw new Error(`Not a whole non-negative amount: ${minor}`);
  const exponent = exponentOf(currency);
  if (exponent === 0) return String(minor);
  const digits = String(minor).padStart(exponent + 1, "0");
  return `${digits.slice(0, -exponent)}.${digits.slice(-exponent)}`;
}

/** Display a price in its own currency, e.g. "₺2,150.00", "¥5,000", "€612.00". */
export function formatMinor(minor: number, currency: string): string {
  const exponent = exponentOf(currency);
  return new Intl.NumberFormat("en-IE", {
    style: "currency",
    currency,
    minimumFractionDigits: exponent,
    maximumFractionDigits: exponent,
    // A decimal string keeps formatting exact (no float division).
  }).format(minorToDecimal(minor, currency) as Intl.StringNumericLiteral);
}

/** Display euro cents: whole euros when there are no cents ("€2,681"), else "€60.12". */
export function formatEur(cents: number): string {
  const whole = cents % 100 === 0;
  return new Intl.NumberFormat("en-IE", {
    style: "currency",
    currency: "EUR",
    minimumFractionDigits: whole ? 0 : 2,
    maximumFractionDigits: whole ? 0 : 2,
  }).format(minorToDecimal(cents, "EUR") as Intl.StringNumericLiteral);
}

/** "55.60090000" → "55.6009", "136.20000000" → "136.2", "2" → "2". */
export function trimRate(rate: string): string {
  return rate.includes(".") ? rate.replace(/\.?0+$/, "") : rate;
}

export type Rational = { num: bigint; den: bigint };

/** An exact decimal rate string ("55.6009", "0.84028000") as a fraction. */
export function parseRate(rate: string): Rational {
  const match = /^(\d+)(?:\.(\d+))?$/.exec(rate.trim());
  if (!match) throw new Error(`Not a rate: "${rate}"`);
  const [, whole, fraction = ""] = match;
  const num = BigInt(whole + fraction);
  if (num === 0n) throw new Error("Rate must be positive");
  return { num, den: 10n ** BigInt(fraction.length) };
}

/** A stored ECB reference rate: `rate` units of `currency` per 1 EUR on `rateDate`. */
export type FxRate = {
  id: string;
  currency: string;
  rateDate: IsoDate;
  /** Exact decimal string as stored (numeric), never a float. */
  rate: string;
};

/**
 * Convert minor units of `currency` to euro cents using `rate` (units per 1 EUR).
 * cents = minor × 100 × den ÷ (10^exponent × num), rounded half-up once.
 */
export function toEurCents(
  minor: number,
  currency: string,
  rate: string | null,
): number {
  if (!Number.isSafeInteger(minor) || minor < 0)
    throw new Error(`Not a whole non-negative amount: ${minor}`);
  if (currency === "EUR") return minor;
  if (rate === null) throw new Error(`No rate to convert ${currency}`);
  const { num, den } = parseRate(rate);
  const exponent = BigInt(exponentOf(currency));
  const numerator = BigInt(minor) * 100n * den;
  const denominator = 10n ** exponent * num;
  return Number((numerator * 2n + denominator) / (denominator * 2n));
}

/** The latest rate for `currency` dated on or before `date`, or null. */
export function pickRate(
  rates: readonly FxRate[],
  currency: string,
  date: IsoDate,
): FxRate | null {
  let best: FxRate | null = null;
  for (const rate of rates) {
    if (rate.currency !== currency || rate.rateDate > date) continue;
    if (!best || rate.rateDate > best.rateDate) best = rate;
  }
  return best;
}

const shortDate = new Intl.DateTimeFormat("en-IE", {
  timeZone: "UTC",
  day: "numeric",
  month: "short",
});

/** "12 Oct" for a date-only value. */
export function formatShortDate(date: IsoDate): string {
  return shortDate.format(new Date(`${date}T00:00:00Z`));
}

/** Why a price can't be converted, in words for the UI. */
export function noRateMessage(currency: string, checkedOn: IsoDate): string {
  if (!ECB_CURRENCIES.has(currency)) {
    return `Can't convert ${currency}: the ECB doesn't publish a ${currency} rate. Enter the price in euro if the site shows one.`;
  }
  return `Can't convert ${currency}: no rate on or before ${formatShortDate(checkedOn)}`;
}
