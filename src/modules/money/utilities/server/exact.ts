/**
 * Exact rational numbers (bigint numerator / denominator) for tariff arithmetic.
 * Unit rates are fractional cents per kWh and usage is fractional kWh, so products are
 * kept exact and rounded once, at the end, to whole cents. Pure, no I/O.
 */

export type Exact = { readonly n: bigint; readonly d: bigint };

function gcd(a: bigint, b: bigint): bigint {
  let x = a < 0n ? -a : a;
  let y = b < 0n ? -b : b;
  while (y !== 0n) [x, y] = [y, x % y];
  return x;
}

function make(n: bigint, d: bigint): Exact {
  if (d === 0n) throw new Error("Division by zero");
  if (d < 0n) [n, d] = [-n, -d];
  const g = gcd(n, d);
  return g > 1n ? { n: n / g, d: d / g } : { n, d };
}

export const ZERO: Exact = { n: 0n, d: 1n };
export const ONE: Exact = { n: 1n, d: 1n };

/** A whole number, e.g. cents or days. */
export function int(value: number | bigint): Exact {
  if (typeof value === "number" && !Number.isSafeInteger(value)) {
    throw new Error(`Not a whole number: ${value}`);
  }
  return { n: BigInt(value), d: 1n };
}

export function ratio(
  numerator: number | bigint,
  denominator: number | bigint,
) {
  return make(int(numerator).n, int(denominator).n);
}

const DECIMAL = /^([+-])?(\d+)(?:\.(\d+))?(?:e([+-]?\d+))?$/i;

/**
 * Parse a decimal such as "37.1200" or 4920.5 without floating-point error.
 * Postgres numeric columns can arrive as JSON numbers; their shortest decimal form is exact
 * for the precisions stored here (≤ 4 decimal places), so String(value) recovers the value.
 */
export function decimal(value: string | number): Exact {
  if (typeof value === "number" && !Number.isFinite(value)) {
    throw new Error(`Not a number: ${value}`);
  }
  const match = DECIMAL.exec(String(value).trim());
  if (!match) throw new Error(`Not a decimal: "${value}"`);
  const [, sign, whole, fraction = "", exponent = "0"] = match;
  let n = BigInt(whole + fraction);
  let d = 10n ** BigInt(fraction.length);
  const e = Number(exponent);
  if (e > 0) n *= 10n ** BigInt(e);
  if (e < 0) d *= 10n ** BigInt(-e);
  return make(sign === "-" ? -n : n, d);
}

export function add(...values: Exact[]): Exact {
  return values.reduce((a, b) => make(a.n * b.d + b.n * a.d, a.d * b.d), ZERO);
}

export function sub(a: Exact, b: Exact): Exact {
  return make(a.n * b.d - b.n * a.d, a.d * b.d);
}

export function mul(...values: Exact[]): Exact {
  return values.reduce((a, b) => make(a.n * b.n, a.d * b.d), ONE);
}

export function div(a: Exact, b: Exact): Exact {
  if (b.n === 0n) throw new Error("Division by zero");
  return make(a.n * b.d, a.d * b.n);
}

export function compare(a: Exact, b: Exact): number {
  const diff = a.n * b.d - b.n * a.d;
  return diff < 0n ? -1 : diff > 0n ? 1 : 0;
}

export function isZero(a: Exact): boolean {
  return a.n === 0n;
}

/** Round half away from zero to a whole number (for amounts already in cents). */
export function round(a: Exact): number {
  const negative = a.n < 0n;
  const abs = negative ? -a.n : a.n;
  const rounded = (abs * 2n + a.d) / (a.d * 2n);
  const result = Number(negative ? -rounded : rounded);
  if (!Number.isSafeInteger(result)) throw new Error("Amount out of range");
  return result === 0 ? 0 : result; // never -0
}

/** Decimal string with up to `digits` places, trailing zeros trimmed (display only). */
export function toDecimalString(a: Exact, digits: number): string {
  const scale = 10n ** BigInt(digits);
  const scaled = round(mul(a, { n: scale, d: 1n }));
  const negative = scaled < 0;
  const abs = BigInt(Math.abs(scaled));
  const whole = abs / scale;
  const fraction = (abs % scale)
    .toString()
    .padStart(digits, "0")
    .replace(/0+$/, "");
  return `${negative ? "-" : ""}${whole}${fraction ? `.${fraction}` : ""}`;
}
