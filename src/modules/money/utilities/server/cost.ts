/**
 * First-year and following-year cost of one offer with the household's own usage.
 * Exact arithmetic throughout; each output is rounded once to whole cents. Pure.
 */
import type { IsoDate } from "../../../../server/domain/dates.ts";
import {
  add,
  decimal,
  int,
  isZero,
  mul,
  ratio,
  round,
  sub,
  ZERO,
  ONE,
  type Exact,
} from "./exact.ts";
import { euros, formatKwh, formatPercent, formatRate } from "./format.ts";
import {
  BAND_LABELS,
  isEnergy,
  type Band,
  type Decision,
  type UtilityType,
} from "./types.ts";

export type Offer = {
  id: string;
  supplier: string;
  tariffName: string | null;
  utilityType: UtilityType;
  /** Cents per kWh, excluding VAT. A missing band means the offer has no rate for it. */
  rates: Partial<Record<Band, Exact>>;
  /** Cents per year, excluding VAT. For broadband, mobile and insurance: the annual price. */
  standingChargeCentsPerYear: number;
  discountPercent: Exact;
  discountIncludesStanding: boolean;
  /** Months of year 1 the discount lasts (0–12). */
  discountMonths: number;
  cashbackCents: number;
  /** Fee for leaving the current contract early to take this offer. */
  exitFeeCents: number;
  vatPercent: Exact;
  sourceUrl: string | null;
  checkedOn: IsoDate;
  notes: string | null;
  decision: Decision | null;
  isCurrentRenewal: boolean;
};

/** Usage the offer is priced against: annual kWh for each band the household uses. */
export type PricedUsage = {
  bands: readonly Band[];
  annualKwh: Partial<Record<Band, Exact>>;
};

export type CostLine = { label: string; cents: number };

export type OfferCost =
  | {
      comparable: true;
      /** Exact values, so savings can be computed before rounding. */
      year1: Exact;
      year2: Exact;
      year1Cents: number;
      year2Cents: number;
      /** Each line rounded for display; the totals are computed exactly. */
      breakdown: CostLine[];
      /** Short summary for the table's "Includes" column. */
      includes: string;
      assumptions: string[];
    }
  | { comparable: false; reason: string };

export type CostOptions = {
  /** True when switching happens before the current contract ends: the exit fee applies. */
  switchBeforeEnd: boolean;
};

const HUNDRED = int(100);

function list(words: string[]): string {
  if (words.length <= 1) return words.join("");
  return `${words.slice(0, -1).join(", ")} or ${words.at(-1)}`;
}

/** Share of year 1 the discount covers, e.g. 22% for 6 months → 11%. */
export function discountFraction(offer: Offer): Exact {
  const months = Math.min(Math.max(offer.discountMonths, 0), 12);
  return mul(offer.discountPercent, ratio(1, 100), ratio(months, 12));
}

export function offerCost(
  offer: Offer,
  usage: PricedUsage | null,
  options: CostOptions,
): OfferCost {
  const energy = isEnergy(offer.utilityType);
  if (energy && (!usage || usage.bands.length === 0)) {
    return {
      comparable: false,
      reason: "No usage entered yet, so this offer can't be priced.",
    };
  }
  const bands = energy && usage ? usage.bands : [];
  const missing = bands.filter((band) => offer.rates[band] === undefined);
  if (missing.length > 0) {
    const names = missing.map((b) => BAND_LABELS[b].toLowerCase());
    const amounts = missing
      .map(
        (b) =>
          `${formatKwh(usage?.annualKwh[b] ?? ZERO)} kWh ${BAND_LABELS[b].toLowerCase()}`,
      )
      .join(", ");
    return {
      comparable: false,
      reason: `Not comparable: no ${list(names)} rate entered, and your usage has ${amounts} a year. Caddy doesn't guess missing rates.`,
    };
  }
  if (!energy && offer.standingChargeCentsPerYear === 0) {
    return {
      comparable: false,
      reason: "Not comparable: no annual price entered.",
    };
  }

  const assumptions: string[] = [];
  const unitParts: string[] = [];
  let units = ZERO;
  for (const band of bands) {
    const kwh = usage?.annualKwh[band] ?? ZERO;
    const rate = offer.rates[band] ?? ZERO;
    units = add(units, mul(kwh, rate));
    unitParts.push(
      `${BAND_LABELS[band].toLowerCase()} ${formatKwh(kwh)} kWh × ${formatRate(rate)}`,
    );
  }
  if (energy) {
    assumptions.push(
      `Units: ${unitParts.join(" + ")} = ${euros(round(units))} a year before VAT.`,
    );
  }

  const standing = int(offer.standingChargeCentsPerYear);
  assumptions.push(
    energy
      ? `Standing charge ${euros(offer.standingChargeCentsPerYear)} a year before VAT.`
      : `Price ${euros(offer.standingChargeCentsPerYear)} a year before VAT.`,
  );

  const fraction = discountFraction(offer);
  const hasDiscount = !isZero(fraction);
  // Fixed-price services have no unit rates: their discount is on the price itself.
  const discountBase =
    offer.discountIncludesStanding || !energy ? add(units, standing) : units;
  const discount = mul(discountBase, fraction);
  const includes: string[] = [];
  if (hasDiscount) {
    const pct = formatPercent(offer.discountPercent);
    const what = !energy
      ? "the price"
      : offer.discountIncludesStanding
        ? "unit rates and standing charge"
        : "unit rates";
    const months = Math.min(offer.discountMonths, 12);
    assumptions.push(
      months === 12
        ? `${pct} off ${what} for the whole of year 1.`
        : `${pct} off ${what} for the first ${months} month${months === 1 ? "" : "s"}, so ${formatPercent(mul(fraction, HUNDRED))} across year 1 (pro-rated by month).`,
    );
    includes.push(
      `${pct} off ${energy ? (offer.discountIncludesStanding ? "units + standing" : "units") : "price"} for ${months} mo`,
    );
  }

  const exVat = sub(add(units, standing), discount);
  const vatRate = mul(offer.vatPercent, ratio(1, 100));
  const vat = mul(exVat, vatRate);
  assumptions.push(
    isZero(vatRate)
      ? "No VAT added."
      : `${formatPercent(offer.vatPercent)} VAT added.`,
  );

  const cashback = int(offer.cashbackCents);
  if (offer.cashbackCents > 0) {
    assumptions.push(`${euros(offer.cashbackCents)} cashback in year 1 only.`);
    includes.push(`${euros(offer.cashbackCents, true)} cashback`);
  }
  const exitFee =
    options.switchBeforeEnd && !offer.isCurrentRenewal
      ? int(offer.exitFeeCents)
      : ZERO;
  if (!isZero(exitFee)) {
    assumptions.push(
      `${euros(offer.exitFeeCents)} exit fee added to year 1 for leaving your current contract early.`,
    );
    includes.push(`${euros(offer.exitFeeCents, true)} exit fee`);
  }

  const year1 = sub(add(exVat, vat, exitFee), cashback);
  const year2 = mul(add(units, standing), add(ONE, vatRate));
  assumptions.push(
    hasDiscount || offer.cashbackCents > 0
      ? "Year 2: same rates and standing charge, without the discount or cashback."
      : "Year 2: same rates and standing charge.",
  );

  const breakdown: CostLine[] = [];
  if (energy) breakdown.push({ label: "Units", cents: round(units) });
  breakdown.push({
    label: energy ? "Standing charge" : "Price",
    cents: offer.standingChargeCentsPerYear,
  });
  if (hasDiscount)
    breakdown.push({ label: "Discount", cents: -round(discount) });
  breakdown.push({
    label: `VAT ${formatPercent(offer.vatPercent)}`,
    cents: round(vat),
  });
  if (offer.cashbackCents > 0) {
    breakdown.push({ label: "Cashback", cents: -offer.cashbackCents });
  }
  if (!isZero(exitFee)) {
    breakdown.push({ label: "Exit fee", cents: offer.exitFeeCents });
  }

  return {
    comparable: true,
    year1,
    year2,
    year1Cents: round(year1),
    year2Cents: round(year2),
    breakdown,
    includes: includes.length > 0 ? includes.join(" · ") : "No discount",
    assumptions,
  };
}

/** Year-1 saving of `option` against `baseline`, rounded once. Positive = cheaper. */
export function savingCents(baseline: Exact, option: Exact): number {
  return round(sub(baseline, option));
}

/** Parse a rate or percentage from the database (number or numeric string). */
export function exactOrUndefined(
  value: string | number | null | undefined,
): Exact | undefined {
  return value === null || value === undefined ? undefined : decimal(value);
}
