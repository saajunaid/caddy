/** Maps database rows to the pure Utilities types. Shared by pages and the daily job. Pure. */
import type { Database } from "../../../../lib/supabase/database.types.ts";
import { decimal, ZERO, type Exact } from "./exact.ts";
import {
  buildComparison,
  pricedUsage,
  type Comparison,
  type DualFuelInput,
} from "./compare.ts";
import type { Offer } from "./cost.ts";
import { usageProfile, type UsagePeriod, type UsageProfile } from "./usage.ts";
import {
  DECISIONS,
  DEFAULT_EXCLUDED_SUPPLIERS,
  expectedBands,
  isEnergy,
  METER_TYPES,
  UTILITY_TYPES,
  type Band,
  type Decision,
  type MeterType,
  type UtilityType,
} from "./types.ts";

type Tables = Database["public"]["Tables"];
export type ContractRow = Tables["utility_contracts"]["Row"];
export type UsageRow = Tables["utility_usage"]["Row"];
export type OfferRow = Tables["tariff_offers"]["Row"];
export type ComparisonRecord = Tables["utility_comparisons"]["Row"];

function exact(value: number | string | null): Exact | undefined {
  return value === null ? undefined : decimal(value);
}

export function asUtilityType(value: string): UtilityType {
  return (UTILITY_TYPES as readonly string[]).includes(value)
    ? (value as UtilityType)
    : "electricity";
}

export function asMeterType(value: string): MeterType {
  return (METER_TYPES as readonly string[]).includes(value)
    ? (value as MeterType)
    : "unknown";
}

export function asDecision(value: string | null): Decision | null {
  return value && (DECISIONS as readonly string[]).includes(value)
    ? (value as Decision)
    : null;
}

export function toUsagePeriod(row: UsageRow): UsagePeriod {
  const kwh: Partial<Record<Band, Exact>> = {};
  const bands: [Band, number | null][] = [
    ["day", row.day_kwh],
    ["night", row.night_kwh],
    ["peak", row.peak_kwh],
    ["standard", row.standard_kwh],
    ["gas", row.gas_kwh],
  ];
  for (const [band, value] of bands) {
    const parsed = exact(value);
    if (parsed !== undefined) kwh[band] = parsed;
  }
  return { periodStart: row.period_start, periodEnd: row.period_end, kwh };
}

export function toOffer(row: OfferRow): Offer {
  const rates: Partial<Record<Band, Exact>> = {};
  const bands: [Band, number | null][] = [
    ["day", row.day_rate_cents],
    ["night", row.night_rate_cents],
    ["peak", row.peak_rate_cents],
    ["standard", row.standard_rate_cents],
    ["gas", row.gas_rate_cents],
  ];
  for (const [band, value] of bands) {
    const parsed = exact(value);
    if (parsed !== undefined) rates[band] = parsed;
  }
  return {
    id: row.id,
    supplier: row.supplier,
    tariffName: row.tariff_name,
    utilityType: asUtilityType(row.utility_type),
    rates,
    standingChargeCentsPerYear: row.standing_charge_cents_per_year,
    discountPercent: exact(row.discount_percent) ?? ZERO,
    discountIncludesStanding: row.discount_includes_standing,
    discountMonths: row.discount_months,
    cashbackCents: row.cashback_cents,
    exitFeeCents: row.exit_fee_cents,
    vatPercent: exact(row.vat_percent) ?? ZERO,
    sourceUrl: row.source_url,
    checkedOn: row.checked_on,
    notes: row.notes,
    decision: asDecision(row.decision),
    isCurrentRenewal: row.is_current_renewal,
  };
}

/** Usage profile for a contract from its own usage rows. */
export function contractProfile(
  contract: Pick<ContractRow, "id" | "utility_type" | "meter_type">,
  usage: readonly UsageRow[],
): UsageProfile {
  return usageProfile(
    usage.filter((u) => u.contract_id === contract.id).map(toUsagePeriod),
    expectedBands(
      asUtilityType(contract.utility_type),
      asMeterType(contract.meter_type),
    ),
  );
}

/** Offers that belong in a contract's own table (same utility type). */
export function tableOffers(
  contract: Pick<ContractRow, "id" | "utility_type">,
  offers: readonly OfferRow[],
): Offer[] {
  return offers
    .filter(
      (o) =>
        o.contract_id === contract.id &&
        o.utility_type === contract.utility_type,
    )
    .map(toOffer);
}

export function excludedSuppliers(
  prefs: { excluded_suppliers: string[] } | null | undefined,
): string[] {
  return prefs
    ? [...prefs.excluded_suppliers]
    : [...DEFAULT_EXCLUDED_SUPPLIERS];
}

/** The comparison table for one contract, from the household's rows. */
export function contractComparison(
  contract: ContractRow,
  usage: readonly UsageRow[],
  offers: readonly OfferRow[],
  excluded: readonly string[],
  switchDate?: string | null,
): Comparison {
  const type = asUtilityType(contract.utility_type);
  return buildComparison({
    utilityType: type,
    contractEnd: contract.contract_end,
    profile: isEnergy(type) ? contractProfile(contract, usage) : null,
    offers: tableOffers(contract, offers),
    excludedSuppliers: excluded,
    switchDate,
  });
}

const ELECTRICITY_BANDS: readonly Band[] = ["day", "night", "peak", "standard"];

/**
 * Inputs for "dual fuel vs separate", when the household has both an electricity and a gas
 * contract, or a dual fuel contract. Null when it doesn't apply.
 */
export function householdDualFuel(
  contracts: readonly ContractRow[],
  usage: readonly UsageRow[],
  offers: readonly OfferRow[],
  excluded: readonly string[],
): DualFuelInput | null {
  const live = contracts.filter((c) => c.status !== "ended");
  const find = (type: UtilityType) => live.find((c) => c.utility_type === type);
  const elec = find("electricity");
  const gas = find("gas");
  const dual = find("dual_fuel");
  if (!dual && !(elec && gas)) return null;
  const elecSource = elec ?? dual;
  const gasSource = gas ?? dual;
  const ids = new Set([elec, gas, dual].flatMap((c) => (c ? [c.id] : [])));
  const energyOffers = offers.filter((o) => ids.has(o.contract_id));
  const ofType = (type: UtilityType) =>
    energyOffers.filter((o) => o.utility_type === type).map(toOffer);
  return {
    electricity: elecSource
      ? pricedUsage(contractProfile(elecSource, usage), ELECTRICITY_BANDS)
      : null,
    gas: gasSource
      ? pricedUsage(contractProfile(gasSource, usage), ["gas"])
      : null,
    electricityOffers: ofType("electricity"),
    gasOffers: ofType("gas"),
    dualOffers: ofType("dual_fuel"),
    excludedSuppliers: excluded,
  };
}
