/**
 * Money helpers. Amounts are integer minor units (cents) to avoid floating-point errors.
 * Pure functions, no I/O.
 */

export type Cents = number;
export type CurrencyCode = "EUR" | "GBP" | "USD" | (string & {});

function assertCents(value: Cents): void {
  if (!Number.isSafeInteger(value)) {
    throw new Error(`Money must be a whole number of cents, got ${value}`);
  }
}

/**
 * Parse a decimal string such as "1,234.56", "€12.5" or "-3" into cents
 * without going through floating point.
 */
export function parseToCents(input: string): Cents {
  const cleaned = input.trim().replace(/[€£$,\s]/g, "");
  const match = /^(-)?(\d+)(?:\.(\d{1,2}))?$/.exec(cleaned);
  if (!match) throw new Error(`Not a money amount: "${input}"`);
  const [, sign, whole, fraction = ""] = match;
  const cents = Number(whole) * 100 + Number(fraction.padEnd(2, "0"));
  assertCents(cents);
  return sign ? -cents : cents;
}

/** Sum amounts in the same currency. */
export function sumCents(values: readonly Cents[]): Cents {
  return values.reduce((total, value) => {
    assertCents(value);
    return total + value;
  }, 0);
}

/**
 * Multiply by a rational factor (numerator / denominator) and round half away from zero.
 * Use for percentages and apportioning, e.g. 30% → (30, 100), 148 of 365 days → (148, 365).
 */
export function multiplyCents(
  value: Cents,
  numerator: number,
  denominator: number,
): Cents {
  assertCents(value);
  if (
    !Number.isSafeInteger(numerator) ||
    !Number.isSafeInteger(denominator) ||
    denominator === 0
  ) {
    throw new Error(
      "numerator and denominator must be whole numbers, denominator non-zero",
    );
  }
  const product = BigInt(value) * BigInt(numerator);
  const divisor = BigInt(denominator);
  const negative = product < 0n !== divisor < 0n;
  const absProduct = product < 0n ? -product : product;
  const absDivisor = divisor < 0n ? -divisor : divisor;
  const rounded = (absProduct * 2n + absDivisor) / (absDivisor * 2n);
  return Number(negative ? -rounded : rounded);
}

/** Format cents for display, e.g. 21248 → "€212.48". */
export function formatMoney(
  value: Cents,
  currency: CurrencyCode = "EUR",
  options: { wholeUnits?: boolean } = {},
): string {
  assertCents(value);
  const digits = options.wholeUnits ? 0 : 2;
  return new Intl.NumberFormat("en-IE", {
    style: "currency",
    currency,
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  }).format(value / 100);
}
