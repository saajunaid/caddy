/**
 * Builds the comparison table for a contract: prices every offer with the household's usage,
 * ranks by first-year cost, keeps excluded suppliers out of the ranking, and states every
 * assumption. Also compares the best dual fuel offer with the best separate pair. Pure.
 */
import type { IsoDate } from "../../../../server/domain/dates.ts";
import { add, compare, round, sub, type Exact } from "./exact.ts";
import {
  offerCost,
  type CostLine,
  type Offer,
  type PricedUsage,
} from "./cost.ts";
import { euros, shortDate } from "./format.ts";
import {
  annualUsageSentence,
  coverageSentence,
  usageWarnings,
  usedBands,
  type UsageProfile,
} from "./usage.ts";
import {
  isEnergy,
  type Band,
  type Decision,
  type UtilityType,
} from "./types.ts";

/** Lower-case, accents and punctuation removed: "Bord Gáis" → "bord gais". */
export function normaliseSupplier(name: string): string {
  return name
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

/** Whether a supplier is on the exclusion list. "Bord Gais" matches "Bord Gáis Energy" and back. */
export function isExcluded(
  supplier: string,
  excluded: readonly string[],
): boolean {
  const name = normaliseSupplier(supplier);
  if (!name) return false;
  return excluded.some((entry) => {
    const other = normaliseSupplier(entry);
    if (!other) return false;
    return (
      name === other ||
      name.startsWith(`${other} `) ||
      other.startsWith(`${name} `)
    );
  });
}

export type RowStatus = "ranked" | "excluded" | "not_comparable";

export type ComparisonRow = {
  offerId: string;
  supplier: string;
  tariffName: string | null;
  isCurrentRenewal: boolean;
  decision: Decision | null;
  sourceUrl: string | null;
  checkedOn: IsoDate;
  status: RowStatus;
  rank: number | null;
  year1Cents: number | null;
  year2Cents: number | null;
  /** Year-1 saving against the current renewal price. Positive = cheaper than renewing. */
  vsRenewalCents: number | null;
  includes: string;
  /** Why the row isn't ranked. */
  reason: string | null;
  assumptions: string[];
  breakdown: CostLine[];
};

export type Comparison = {
  rows: ComparisonRow[];
  best: ComparisonRow | null;
  renewal: ComparisonRow | null;
  /** Global assumptions, as sentences. */
  assumptions: string[];
  /** Caveats about the usage data. */
  warnings: string[];
  /** Why nothing could be priced, when that's the case. */
  blocked: string | null;
  /** "Estimate" or "Estimate (limited data)". */
  estimateLabel: string;
  /** Snapshot of the usage used, for utility_comparisons.usage_basis. */
  usageBasis: {
    summary: string;
    annualKwh: Partial<Record<Band, number>>;
    coveredDays: number;
    from: IsoDate | null;
    to: IsoDate | null;
    limited: boolean;
    missingBands: Band[];
    switchDate: IsoDate | null;
    contractEnd: IsoDate | null;
    excludedSuppliers: string[];
  };
};

export type ComparisonInput = {
  utilityType: UtilityType;
  contractEnd: IsoDate | null;
  /** Null for broadband, mobile and insurance, which aren't priced on usage. */
  profile: UsageProfile | null;
  offers: readonly Offer[];
  excludedSuppliers: readonly string[];
  /** When the household would switch. Defaults to the contract end date (no exit fee). */
  switchDate?: IsoDate | null;
};

export function pricedUsage(
  profile: UsageProfile,
  only?: readonly Band[],
): PricedUsage {
  const bands = usedBands(profile).filter(
    (band) => !only || only.includes(band),
  );
  return { bands, annualKwh: profile.annualKwh };
}

function byCost(
  a: { year1: Exact; supplier: string; id: string },
  b: { year1: Exact; supplier: string; id: string },
): number {
  return (
    compare(a.year1, b.year1) ||
    a.supplier.localeCompare(b.supplier) ||
    a.id.localeCompare(b.id)
  );
}

export function buildComparison(input: ComparisonInput): Comparison {
  const energy = isEnergy(input.utilityType);
  const profile = input.profile;
  const usage = energy && profile ? pricedUsage(profile) : null;
  const switchDate = input.switchDate ?? input.contractEnd;
  const switchBeforeEnd =
    !!switchDate && !!input.contractEnd && switchDate < input.contractEnd;

  const priced = input.offers.map((offer) => ({
    offer,
    cost: offerCost(offer, usage, { switchBeforeEnd }),
    excluded: isExcluded(offer.supplier, input.excludedSuppliers),
  }));

  const renewalEntry = priced.find((p) => p.offer.isCurrentRenewal);
  const renewalYear1 =
    renewalEntry && renewalEntry.cost.comparable
      ? renewalEntry.cost.year1
      : null;

  const rankable = priced
    .filter((p) => p.cost.comparable && !p.excluded)
    .map((p) => ({
      ...p,
      year1: (p.cost as { year1: Exact }).year1,
      supplier: p.offer.supplier,
      id: p.offer.id,
    }))
    .sort(byCost);
  const rankOf = new Map(rankable.map((p, i) => [p.offer.id, i + 1]));

  const rows: ComparisonRow[] = priced.map(({ offer, cost, excluded }) => {
    const common = {
      offerId: offer.id,
      supplier: offer.supplier,
      tariffName: offer.tariffName,
      isCurrentRenewal: offer.isCurrentRenewal,
      decision: offer.decision,
      sourceUrl: offer.sourceUrl,
      checkedOn: offer.checkedOn,
    };
    // The current renewal stays visible with its numbers even if excluded: it's the baseline.
    const showNumbers =
      cost.comparable && (!excluded || offer.isCurrentRenewal);
    const status: RowStatus = !cost.comparable
      ? "not_comparable"
      : excluded
        ? "excluded"
        : "ranked";
    return {
      ...common,
      status,
      rank: rankOf.get(offer.id) ?? null,
      year1Cents: showNumbers && cost.comparable ? cost.year1Cents : null,
      year2Cents: showNumbers && cost.comparable ? cost.year2Cents : null,
      vsRenewalCents:
        showNumbers &&
        cost.comparable &&
        renewalYear1 &&
        !offer.isCurrentRenewal
          ? round(sub(renewalYear1, cost.year1))
          : null,
      includes: cost.comparable ? cost.includes : "",
      reason: !cost.comparable
        ? cost.reason
        : excluded
          ? "Excluded by your preference"
          : null,
      assumptions: showNumbers && cost.comparable ? cost.assumptions : [],
      breakdown: showNumbers && cost.comparable ? cost.breakdown : [],
    };
  });

  const order: Record<RowStatus, number> = {
    ranked: 0,
    excluded: 1,
    not_comparable: 2,
  };
  rows.sort(
    (a, b) =>
      order[a.status] - order[b.status] ||
      (a.rank ?? 0) - (b.rank ?? 0) ||
      Number(b.isCurrentRenewal) - Number(a.isCurrentRenewal) ||
      a.supplier.localeCompare(b.supplier),
  );

  const assumptions: string[] = [];
  const warnings: string[] = [];
  let blocked: string | null = null;
  if (energy) {
    if (!profile || profile.bands.length === 0) {
      blocked =
        "Add at least one bill period of usage to price offers. Caddy only uses your own bills, never national averages.";
    } else {
      assumptions.push(
        `Usage: ${annualUsageSentence(profile)}. ${coverageSentence(profile)}`,
      );
      warnings.push(...usageWarnings(profile));
    }
    if (input.utilityType !== "gas") {
      assumptions.push(
        "PSO levy left out: it's the same for every supplier, so it doesn't change the ranking.",
      );
    }
    assumptions.push(
      "Unit rates and standing charges are as you entered them, before VAT.",
    );
  } else {
    assumptions.push("Prices are as you entered them, before VAT.");
  }
  if (!input.contractEnd) {
    assumptions.push(
      "Contract end date unknown: switching is assumed to happen when it ends, so no exit fee.",
    );
  } else if (switchBeforeEnd && switchDate) {
    assumptions.push(
      `Switching on ${shortDate(switchDate)}, before your contract ends on ${shortDate(input.contractEnd)}: any exit fee you entered is added to year 1.`,
    );
  } else {
    assumptions.push(
      `Switch assumed on your contract end date (${shortDate(input.contractEnd)}), so no exit fee.`,
    );
  }
  if (input.excludedSuppliers.length > 0) {
    assumptions.push(
      `Never ranked or recommended, by your preference: ${input.excludedSuppliers.join(", ")}.`,
    );
  }
  assumptions.push(
    "Year 2 assumes prices stay the same; suppliers can change them with notice.",
  );

  const best = rows.find((r) => r.rank === 1) ?? null;
  const renewal = rows.find((r) => r.isCurrentRenewal) ?? null;
  return {
    rows,
    best,
    renewal,
    assumptions,
    warnings,
    blocked,
    estimateLabel: profile?.limited ? "Estimate (limited data)" : "Estimate",
    usageBasis: {
      summary: profile ? coverageSentence(profile) : "Not usage-based",
      annualKwh: Object.fromEntries(
        (profile?.bands ?? []).map((band) => [
          band,
          profile?.annualKwh[band] ? round(profile.annualKwh[band]) : 0,
        ]),
      ),
      coveredDays: profile?.coveredDays ?? 0,
      from: profile?.from ?? null,
      to: profile?.to ?? null,
      limited: profile?.limited ?? false,
      missingBands: profile?.missingBands ?? [],
      switchDate: switchDate ?? null,
      contractEnd: input.contractEnd,
      excludedSuppliers: [...input.excludedSuppliers],
    },
  };
}

/** JSON-safe copy of a comparison for utility_comparisons (usage_basis + results). */
export function comparisonSnapshot(comparison: Comparison) {
  return {
    usageBasis: comparison.usageBasis,
    results: {
      version: 1,
      rows: comparison.rows,
      bestOfferId: comparison.best?.offerId ?? null,
      assumptions: comparison.assumptions,
      warnings: comparison.warnings,
      blocked: comparison.blocked,
      estimateLabel: comparison.estimateLabel,
    },
  };
}

// Dual fuel vs separate suppliers -------------------------------------------------------------

export type DualFuelPick = {
  offerId: string;
  supplier: string;
  tariffName: string | null;
  year1Cents: number;
  year2Cents: number;
};

export type DualFuelResult = {
  separate: {
    electricity: DualFuelPick;
    gas: DualFuelPick;
    year1Cents: number;
    year2Cents: number;
  } | null;
  dual: DualFuelPick | null;
  /** Separate minus dual fuel, year 1. Positive = dual fuel is cheaper. */
  differenceCents: number | null;
  verdict: string;
  /** What's missing for a full comparison. */
  missing: string[];
  assumptions: string[];
};

export type DualFuelInput = {
  electricity: PricedUsage | null;
  gas: PricedUsage | null;
  electricityOffers: readonly Offer[];
  gasOffers: readonly Offer[];
  dualOffers: readonly Offer[];
  excludedSuppliers: readonly string[];
};

function cheapest(
  offers: readonly Offer[],
  usage: PricedUsage | null,
  excluded: readonly string[],
): { pick: DualFuelPick; year1: Exact; year2: Exact } | null {
  if (!usage || usage.bands.length === 0) return null;
  const options = offers
    .filter((offer) => !isExcluded(offer.supplier, excluded))
    .flatMap((offer) => {
      const cost = offerCost(offer, usage, { switchBeforeEnd: false });
      return cost.comparable
        ? [
            {
              offer,
              year1: cost.year1,
              year2: cost.year2,
              supplier: offer.supplier,
              id: offer.id,
              cost,
            },
          ]
        : [];
    })
    .sort(byCost);
  const best = options[0];
  if (!best) return null;
  return {
    pick: {
      offerId: best.offer.id,
      supplier: best.offer.supplier,
      tariffName: best.offer.tariffName,
      year1Cents: best.cost.year1Cents,
      year2Cents: best.cost.year2Cents,
    },
    year1: best.year1,
    year2: best.year2,
  };
}

export function compareDualFuel(input: DualFuelInput): DualFuelResult {
  const excluded = input.excludedSuppliers;
  const elec = cheapest(input.electricityOffers, input.electricity, excluded);
  const gas = cheapest(input.gasOffers, input.gas, excluded);
  const combined: PricedUsage | null =
    input.electricity && input.gas
      ? {
          bands: [...input.electricity.bands, ...input.gas.bands],
          annualKwh: {
            ...input.electricity.annualKwh,
            ...input.gas.annualKwh,
          },
        }
      : null;
  const dual = cheapest(input.dualOffers, combined, excluded);

  const missing: string[] = [];
  if (!input.electricity || input.electricity.bands.length === 0)
    missing.push("electricity usage");
  if (!input.gas || input.gas.bands.length === 0) missing.push("gas usage");
  if (!elec && input.electricity?.bands.length)
    missing.push("a comparable electricity offer");
  if (!gas && input.gas?.bands.length) missing.push("a comparable gas offer");
  if (!dual && combined) missing.push("a comparable dual fuel offer");

  const separate =
    elec && gas
      ? {
          electricity: elec.pick,
          gas: gas.pick,
          year1Cents: round(add(elec.year1, gas.year1)),
          year2Cents: round(add(elec.year2, gas.year2)),
        }
      : null;
  const difference =
    elec && gas && dual
      ? round(sub(add(elec.year1, gas.year1), dual.year1))
      : null;

  let verdict: string;
  if (difference === null) {
    verdict = `Add ${missing.join(", ") || "offers"} to compare dual fuel with separate suppliers.`;
  } else if (difference > 0) {
    verdict = `Dual fuel with ${dual?.pick.supplier} is ${euros(difference)} cheaper in year 1 than the best separate pair.`;
  } else if (difference < 0) {
    verdict = `Separate suppliers (${elec?.pick.supplier} + ${gas?.pick.supplier}) are ${euros(-difference)} cheaper in year 1 than the best dual fuel offer.`;
  } else {
    verdict = "Dual fuel and the best separate pair cost the same in year 1.";
  }

  return {
    separate,
    dual: dual?.pick ?? null,
    differenceCents: difference,
    verdict,
    missing,
    assumptions: [
      "Uses your own electricity and gas usage, the cheapest comparable offer on each side, and the same rules as the tables.",
      "Assumes you switch when each contract ends, so no exit fees.",
      "Excluded suppliers are left out on both sides.",
    ],
  };
}
