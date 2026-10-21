import { describe, expect, it } from "vitest";
import { decimal, int, round, ZERO } from "./exact";
import {
  discountFraction,
  offerCost,
  type Offer,
  type PricedUsage,
} from "./cost";
import { makeOffer, PROTOTYPE_USAGE } from "./testing";

const usage = PROTOTYPE_USAGE;

const noSwitch = { switchBeforeEnd: false };

function priced(
  offer: Offer,
  u: PricedUsage | null = usage,
  options = noSwitch,
) {
  const cost = offerCost(offer, u, options);
  if (!cost.comparable) throw new Error(cost.reason);
  return cost;
}

describe("offerCost", () => {
  it("prices units, discount, standing charge and VAT exactly", () => {
    // Units 4920×34.20 + 3410×17.10 + 610×39.90 = 250,914c.
    // Year 1: (250,914 × 0.78 + 28,000) × 1.09 = 243,847.0828c → €2,438.47.
    // Year 2: (250,914 + 28,000) × 1.09 = 304,016.26c → €3,040.16.
    const cost = priced(makeOffer());
    expect(cost.year1Cents).toBe(243847);
    expect(cost.year2Cents).toBe(304016);
    expect(cost.year1).toEqual(decimal("243847.0828"));
    expect(cost.includes).toBe("22% off units for 12 mo");
    expect(cost.breakdown).toEqual([
      { label: "Units", cents: 250914 },
      { label: "Standing charge", cents: 28000 },
      { label: "Discount", cents: -55201 },
      { label: "VAT 9%", cents: 20134 },
    ]);
  });

  it("rounds once per output, not per line", () => {
    // 1 kWh at 10.5c + 9% VAT = 11.445c → 11c. Rounding lines first would give 11 + 1 = 12c.
    const cost = priced(
      makeOffer({
        rates: { standard: decimal("10.5") },
        standingChargeCentsPerYear: 0,
        discountPercent: ZERO,
      }),
      { bands: ["standard"], annualKwh: { standard: int(1) } },
    );
    expect(cost.year1Cents).toBe(11);
    expect(cost.breakdown.map((l) => l.cents)).toEqual([11, 0, 1]);
  });

  it("pro-rates a discount by month over year 1", () => {
    const offer = makeOffer({ discountMonths: 6 });
    expect(discountFraction(offer)).toEqual(decimal("0.11"));
    // (278,914 − 250,914 × 0.11) × 1.09 = 273,931.6714c.
    const cost = priced(offer);
    expect(cost.year1Cents).toBe(273932);
    expect(cost.year2Cents).toBe(304016);
    expect(cost.assumptions).toContain(
      "22% off unit rates for the first 6 months, so 11% across year 1 (pro-rated by month).",
    );
  });

  it("applies the discount to the standing charge only when the offer says so", () => {
    const cost = priced(
      makeOffer({
        discountPercent: decimal("10"),
        discountIncludesStanding: true,
      }),
    );
    // 278,914 × 0.9 × 1.09 = 273,614.634c.
    expect(cost.year1Cents).toBe(273615);
    expect(cost.includes).toBe("10% off units + standing for 12 mo");
  });

  it("takes cashback off year 1 only", () => {
    const cost = priced(makeOffer({ cashbackCents: 10000 }));
    expect(cost.year1Cents).toBe(243847 - 10000);
    expect(cost.year2Cents).toBe(304016);
    expect(cost.includes).toBe("22% off units for 12 mo · €100 cashback");
    expect(cost.assumptions).toContain("€100.00 cashback in year 1 only.");
  });

  it("adds the exit fee only when switching before the contract ends", () => {
    const offer = makeOffer({ exitFeeCents: 5000 });
    expect(priced(offer).year1Cents).toBe(243847);
    const early = priced(offer, usage, { switchBeforeEnd: true });
    expect(early.year1Cents).toBe(248847);
    expect(early.year2Cents).toBe(304016);
    expect(early.breakdown.at(-1)).toEqual({ label: "Exit fee", cents: 5000 });
    // Staying with the current supplier never costs an exit fee.
    const renewal = priced(
      makeOffer({ exitFeeCents: 5000, isCurrentRenewal: true }),
      usage,
      {
        switchBeforeEnd: true,
      },
    );
    expect(renewal.year1Cents).toBe(243847);
  });

  it("marks an offer not comparable when it lacks a band the household uses", () => {
    const cost = offerCost(
      makeOffer({ rates: { day: decimal("30"), night: decimal("15") } }),
      usage,
      noSwitch,
    );
    expect(cost.comparable).toBe(false);
    expect(!cost.comparable && cost.reason).toBe(
      "Not comparable: no peak rate entered, and your usage has 610 kWh peak a year. Caddy doesn't guess missing rates.",
    );
  });

  it("won't price energy offers without usage", () => {
    const cost = offerCost(makeOffer(), null, noSwitch);
    expect(cost.comparable).toBe(false);
  });

  it("ignores rates for bands the household doesn't use", () => {
    const cost = priced(
      makeOffer({ rates: { standard: decimal("30"), day: decimal("99") } }),
      { bands: ["standard"], annualKwh: { standard: int(1000) } },
    );
    // (30,000 × 0.78 + 28,000) × 1.09 = 56,026c.
    expect(cost.year1Cents).toBe(56026);
  });

  it("prices gas", () => {
    const cost = priced(
      makeOffer({
        utilityType: "gas",
        rates: { gas: decimal("11.25") },
        standingChargeCentsPerYear: 12000,
        discountPercent: ZERO,
      }),
      { bands: ["gas"], annualKwh: { gas: decimal("9000.5") } },
    );
    // (9000.5 × 11.25 + 12,000) × 1.09 = 123,448.63125c.
    expect(cost.year1Cents).toBe(123449);
    expect(cost.includes).toBe("No discount");
  });

  it("prices fixed-price services like broadband without usage", () => {
    const cost = priced(
      makeOffer({
        utilityType: "broadband",
        rates: {},
        standingChargeCentsPerYear: 48780,
        discountPercent: decimal("50"),
        discountMonths: 6,
        vatPercent: decimal("23"),
      }),
      null,
    );
    // 48,780 × (1 − 0.25) × 1.23 = 44,999.55c.
    expect(cost.year1Cents).toBe(45000);
    expect(cost.year2Cents).toBe(round(decimal("59999.4")));
    expect(cost.includes).toBe("50% off price for 6 mo");
  });

  it("explains every step as a sentence", () => {
    expect(priced(makeOffer()).assumptions).toEqual([
      "Units: day 4,920 kWh × 34.20c + night 3,410 kWh × 17.10c + peak 610 kWh × 39.90c = €2,509.14 a year before VAT.",
      "Standing charge €280.00 a year before VAT.",
      "22% off unit rates for the whole of year 1.",
      "9% VAT added.",
      "Year 2: same rates and standing charge, without the discount or cashback.",
    ]);
  });
});
