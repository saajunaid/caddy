/** Synthetic fixtures for Utilities unit tests. No real household data. */
import { decimal, int } from "./exact.ts";
import type { Offer, PricedUsage } from "./cost.ts";

/** The prototype's household: 4,920 day · 3,410 night · 610 peak kWh a year. */
export const PROTOTYPE_USAGE: PricedUsage = {
  bands: ["day", "night", "peak"],
  annualKwh: { day: int(4920), night: int(3410), peak: int(610) },
};

export function makeOffer(overrides: Partial<Offer> = {}): Offer {
  return {
    id: "energia",
    supplier: "Energia",
    tariffName: "Smart time-of-use",
    utilityType: "electricity",
    rates: {
      day: decimal("34.20"),
      night: decimal("17.10"),
      peak: decimal("39.90"),
    },
    standingChargeCentsPerYear: 28000,
    discountPercent: decimal("22"),
    discountIncludesStanding: false,
    discountMonths: 12,
    cashbackCents: 0,
    exitFeeCents: 0,
    vatPercent: decimal("9.00"),
    sourceUrl: "https://www.bonkers.ie/",
    checkedOn: "2026-10-20",
    notes: null,
    decision: null,
    isCurrentRenewal: false,
    ...overrides,
  };
}
