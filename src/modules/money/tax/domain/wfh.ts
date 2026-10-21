// Irish remote working relief, computed exactly. Pure: no I/O, relative imports only.
//
// Revenue's formula (2022 onwards): ((A × B ÷ C) − D) × 30%
//   A = allowable bills (electricity, heating, broadband; the claimant's share if shared)
//   B = remote working days, C = days in the year, D = employer remote working allowance paid.
// Everything is integer cents and integer basis points held as BigInt rationals. The claimable
// amount is rounded once (half up) at the end and floored at zero. Intermediate figures shown to
// the user are rounded for display only; they never feed the result.

export type WfhRule = {
  /** 30 for the 2022+ rule. */
  ratePercent: number;
  /** Evidence categories that count towards A. */
  categories: readonly string[];
  /** Evidence category whose amounts make up D. */
  allowanceCategory: string;
};

export type EvidenceInput = {
  category: string;
  /** Amount counted for the year, in cents. */
  paidCents: number;
  /** This person's share of the bill, in basis points: 10000 = 100%, 5000 = 50%. */
  shareBasisPoints: number;
};

export type WfhInput = {
  year: number;
  evidence: readonly EvidenceInput[];
  /** Days worked from home per month, January first. Null = not entered. */
  daysByMonth: readonly (number | null)[];
};

export type CategoryLine = {
  category: string;
  count: number;
  /** Sum of the bills before applying shares. */
  paidCents: number;
  /** After applying shares (display rounding). */
  allowableCents: number;
};

export type WfhBreakdown = {
  year: number;
  ratePercent: number;
  /** C */
  daysInYear: number;
  /** B */
  wfhDays: number;
  monthsMissing: number[];
  categories: CategoryLine[];
  /** A (display rounding). */
  allowableCents: number;
  /** A × B ÷ C (display rounding). */
  wfhShareCents: number;
  /** D */
  allowanceCents: number;
  /** (A × B ÷ C) − D (display rounding; may be negative). */
  baseCents: number;
  /** ((A × B ÷ C) − D) × rate, one rounding, never below zero. */
  claimableCents: number;
  /** True when D was larger than the share of bills, so nothing is claimable. */
  flooredAtZero: boolean;
  /** Estimated tax back at the standard and higher rates. Estimates, not advice. */
  taxBackCents: { standard: number; higher: number };
};

export const STANDARD_RATE_PERCENT = 20;
export const HIGHER_RATE_PERCENT = 40;

export function isLeapYear(year: number): boolean {
  return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
}

export function daysInYear(year: number): number {
  return isLeapYear(year) ? 366 : 365;
}

export function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

/** numerator ÷ denominator rounded half away from zero, as a safe integer. */
export function roundRational(numerator: bigint, denominator: bigint): number {
  if (denominator === 0n) throw new Error("Division by zero");
  const negative = numerator < 0n !== denominator < 0n;
  const n = numerator < 0n ? -numerator : numerator;
  const d = denominator < 0n ? -denominator : denominator;
  const rounded = (n * 2n + d) / (d * 2n);
  const result = Number(negative ? -rounded : rounded);
  if (!Number.isSafeInteger(result)) throw new Error("Amount out of range");
  return result;
}

function assertWhole(value: number, name: string, min: number, max: number) {
  if (!Number.isSafeInteger(value) || value < min || value > max) {
    throw new Error(`${name} must be a whole number between ${min} and ${max}`);
  }
}

/** "50" or "33.33" percent → basis points (5000, 3333). Exact for up to two decimals. */
export function percentToBasisPoints(percent: string | number): number {
  const text =
    typeof percent === "number" ? percent.toFixed(2) : percent.trim();
  const match = /^(\d{1,3})(?:\.(\d{1,2}))?$/.exec(text);
  if (!match) throw new Error(`Not a percentage: ${percent}`);
  const bp = Number(match[1]) * 100 + Number((match[2] ?? "").padEnd(2, "0"));
  if (bp <= 0 || bp > 10000)
    throw new Error("Share must be above 0% and at most 100%");
  return bp;
}

export function computeWfhRelief(rule: WfhRule, input: WfhInput): WfhBreakdown {
  assertWhole(input.year, "year", 2000, 2100);
  assertWhole(rule.ratePercent, "rate", 0, 100);
  if (input.daysByMonth.length !== 12)
    throw new Error("Need 12 months of WFH days");

  const C = daysInYear(input.year);
  const monthsMissing: number[] = [];
  let B = 0;
  input.daysByMonth.forEach((days, index) => {
    if (days === null) {
      monthsMissing.push(index + 1);
      return;
    }
    assertWhole(days, "days", 0, daysInMonth(input.year, index + 1));
    B += days;
  });

  // A as an exact rational: An / 10000 (cents × basis points).
  const lines = new Map<string, { count: number; paid: number; an: bigint }>();
  for (const category of rule.categories)
    lines.set(category, { count: 0, paid: 0, an: 0n });
  let An = 0n;
  let D = 0;
  for (const item of input.evidence) {
    assertWhole(item.paidCents, "paidCents", 0, Number.MAX_SAFE_INTEGER);
    assertWhole(item.shareBasisPoints, "share", 1, 10000);
    if (item.category === rule.allowanceCategory) {
      D += item.paidCents;
      continue;
    }
    const line = lines.get(item.category);
    if (!line) continue; // Not a remote working category (e.g. medical): ignored here.
    const contribution = BigInt(item.paidCents) * BigInt(item.shareBasisPoints);
    line.count += 1;
    line.paid += item.paidCents;
    line.an += contribution;
    An += contribution;
  }

  const bigB = BigInt(B);
  const bigC = BigInt(C);
  const bigD = BigInt(D);
  const rate = BigInt(rule.ratePercent);
  // (A × B ÷ C) − D  =  (An × B − D × C × 10000) ÷ (C × 10000)
  const baseNumerator = An * bigB - bigD * bigC * 10000n;
  const baseDenominator = bigC * 10000n;
  const floored = baseNumerator < 0n;
  const positive = floored ? 0n : baseNumerator;

  return {
    year: input.year,
    ratePercent: rule.ratePercent,
    daysInYear: C,
    wfhDays: B,
    monthsMissing,
    categories: [...lines.entries()].map(([category, l]) => ({
      category,
      count: l.count,
      paidCents: l.paid,
      allowableCents: roundRational(l.an, 10000n),
    })),
    allowableCents: roundRational(An, 10000n),
    wfhShareCents: roundRational(An * bigB, baseDenominator),
    allowanceCents: D,
    baseCents: roundRational(baseNumerator, baseDenominator),
    claimableCents: roundRational(positive * rate, baseDenominator * 100n),
    flooredAtZero: floored,
    taxBackCents: {
      standard: roundRational(
        positive * rate * BigInt(STANDARD_RATE_PERCENT),
        baseDenominator * 10000n,
      ),
      higher: roundRational(
        positive * rate * BigInt(HIGHER_RATE_PERCENT),
        baseDenominator * 10000n,
      ),
    },
  };
}
