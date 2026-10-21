import { describe, expect, it } from "vitest";
import { decimal, int, ZERO } from "./exact";
import {
  buildComparison,
  compareDualFuel,
  comparisonSnapshot,
  isExcluded,
  normaliseSupplier,
} from "./compare";
import { makeOffer, PROTOTYPE_USAGE } from "./testing";
import { usageProfile } from "./usage";

const profile = usageProfile(
  [
    {
      periodStart: "2025-09-01",
      periodEnd: "2026-08-31",
      kwh: { day: int(4920), night: int(3410), peak: int(610) },
    },
  ],
  ["day", "night", "peak"],
);

const renewal = makeOffer({
  id: "ei",
  supplier: "Electric Ireland",
  tariffName: "Renewal",
  rates: {
    day: decimal("37.12"),
    night: decimal("19.85"),
    peak: decimal("42.10"),
  },
  standingChargeCentsPerYear: 30200,
  discountPercent: ZERO,
  isCurrentRenewal: true,
  exitFeeCents: 0,
});
const energia = makeOffer({ exitFeeCents: 5000 });
const sse = makeOffer({
  id: "sse",
  supplier: "SSE Airtricity",
  rates: {
    day: decimal("35.10"),
    night: decimal("16.50"),
    peak: decimal("41.00"),
  },
  standingChargeCentsPerYear: 26500,
  discountPercent: decimal("18"),
  cashbackCents: 10000,
});
const bordGais = makeOffer({
  id: "bg",
  supplier: "Bord Gais",
  rates: { day: decimal("20"), night: decimal("10"), peak: decimal("25") },
  standingChargeCentsPerYear: 10000,
});
const pinergy = makeOffer({
  id: "pin",
  supplier: "Pinergy",
  rates: { day: decimal("32.90"), night: decimal("17.90") },
});

const offers = [pinergy, bordGais, renewal, sse, energia];

function compareAll(switchDate?: string) {
  return buildComparison({
    utilityType: "electricity",
    contractEnd: "2026-11-03",
    profile,
    offers,
    excludedSuppliers: ["Bord Gáis Energy"],
    switchDate,
  });
}

describe("supplier exclusions", () => {
  it("matches names regardless of accents, case and suffixes", () => {
    expect(normaliseSupplier("  Bord Gáis   Energy ")).toBe("bord gais energy");
    expect(isExcluded("Bord Gais", ["Bord Gáis Energy"])).toBe(true);
    expect(isExcluded("BORD GÁIS ENERGY", ["Bord Gáis Energy"])).toBe(true);
    expect(isExcluded("Bord Gáis Energy", ["bord gais"])).toBe(true);
    expect(isExcluded("Energia", ["Bord Gáis Energy"])).toBe(false);
    expect(isExcluded("Bord", ["Bord Gáis Energy"])).toBe(true);
    expect(isExcluded("Bordgais", ["Bord Gáis Energy"])).toBe(false);
    expect(isExcluded("Energia", [])).toBe(false);
  });
});

describe("buildComparison", () => {
  it("ranks by first-year cost and computes savings against the renewal", () => {
    const c = compareAll();
    const ranked = c.rows.filter((r) => r.status === "ranked");
    expect(ranked.map((r) => [r.rank, r.supplier, r.year1Cents])).toEqual([
      [1, "Energia", 243847],
      [2, "SSE Airtricity", 245881],
      [3, "Electric Ireland", 333758],
    ]);
    // 333,757.891 − 243,847.0828 = 89,910.8082c, rounded once.
    expect(ranked[0].vsRenewalCents).toBe(89911);
    expect(ranked[1].vsRenewalCents).toBe(87877);
    expect(ranked[2].vsRenewalCents).toBeNull();
    expect(c.best?.supplier).toBe("Energia");
    expect(c.renewal?.supplier).toBe("Electric Ireland");
  });

  it("shows excluded suppliers without ranking or recommending them", () => {
    const c = compareAll();
    const bg = c.rows.find((r) => r.offerId === "bg");
    expect(bg).toMatchObject({
      status: "excluded",
      rank: null,
      year1Cents: null,
      reason: "Excluded by your preference",
    });
    expect(c.best?.offerId).not.toBe("bg");
  });

  it("lists offers missing a band as not comparable, last", () => {
    const c = compareAll();
    expect(c.rows.map((r) => r.status)).toEqual([
      "ranked",
      "ranked",
      "ranked",
      "excluded",
      "not_comparable",
    ]);
    expect(c.rows.at(-1)?.reason).toMatch(/no peak rate entered/);
  });

  it("keeps an excluded current supplier as the baseline", () => {
    const c = buildComparison({
      utilityType: "electricity",
      contractEnd: "2026-11-03",
      profile,
      offers: [
        makeOffer({ ...renewal, supplier: "Bord Gáis Energy" }),
        energia,
      ],
      excludedSuppliers: ["Bord Gáis Energy"],
    });
    expect(c.renewal).toMatchObject({
      status: "excluded",
      rank: null,
      year1Cents: 333758,
    });
    expect(c.best?.supplier).toBe("Energia");
    expect(c.best?.vsRenewalCents).toBe(89911);
  });

  it("states every global assumption", () => {
    const c = compareAll();
    expect(c.assumptions).toEqual([
      "Usage: Day 4,920 · night 3,410 · peak 610 kWh a year. Based on 365 days of bills, Sept 2025–Aug 2026.",
      "PSO levy left out: it's the same for every supplier, so it doesn't change the ranking.",
      "Unit rates and standing charges are as you entered them, before VAT.",
      "Switch assumed on your contract end date (3 Nov 2026), so no exit fee.",
      "Never ranked or recommended, by your preference: Bord Gáis Energy.",
      "Year 2 assumes prices stay the same; suppliers can change them with notice.",
    ]);
    expect(c.estimateLabel).toBe("Estimate");
    expect(c.blocked).toBeNull();
  });

  it("adds exit fees when switching before the contract ends", () => {
    const c = compareAll("2026-10-21");
    const row = c.rows.find((r) => r.offerId === "energia");
    expect(row?.year1Cents).toBe(243847 + 5000);
    expect(c.assumptions).toContain(
      "Switching on 21 Oct 2026, before your contract ends on 3 Nov 2026: any exit fee you entered is added to year 1.",
    );
    // Switching on or after the end date: no exit fee.
    expect(
      compareAll("2026-11-03").rows.find((r) => r.offerId === "energia")
        ?.year1Cents,
    ).toBe(243847);
  });

  it("refuses to price energy offers without usage", () => {
    const c = buildComparison({
      utilityType: "electricity",
      contractEnd: null,
      profile: usageProfile([]),
      offers: [energia],
      excludedSuppliers: [],
    });
    expect(c.blocked).toMatch(/never national averages/);
    expect(c.rows[0].status).toBe("not_comparable");
    expect(c.best).toBeNull();
    expect(c.assumptions).toContain(
      "Contract end date unknown: switching is assumed to happen when it ends, so no exit fee.",
    );
  });

  it("labels limited data", () => {
    const short = usageProfile([
      {
        periodStart: "2026-09-01",
        periodEnd: "2026-09-30",
        kwh: { day: int(400), night: int(280), peak: int(50) },
      },
    ]);
    const c = buildComparison({
      utilityType: "electricity",
      contractEnd: "2026-11-03",
      profile: short,
      offers: [energia],
      excludedSuppliers: [],
    });
    expect(c.estimateLabel).toBe("Estimate (limited data)");
    expect(c.warnings[0]).toMatch(/only 30 days of bills/);
  });

  it("leaves the PSO levy note out for gas", () => {
    const c = buildComparison({
      utilityType: "gas",
      contractEnd: "2027-03-14",
      profile: usageProfile([]),
      offers: [],
      excludedSuppliers: [],
    });
    expect(c.assumptions.join(" ")).not.toContain("PSO");
  });

  it("produces a JSON-safe snapshot", () => {
    const snapshot = comparisonSnapshot(compareAll());
    const roundTrip = JSON.parse(JSON.stringify(snapshot));
    expect(roundTrip).toEqual(snapshot);
    expect(snapshot.results.bestOfferId).toBe("energia");
    expect(snapshot.usageBasis.annualKwh).toEqual({
      day: 4920,
      night: 3410,
      peak: 610,
    });
  });
});

describe("compareDualFuel", () => {
  const gasUsage = { bands: ["gas" as const], annualKwh: { gas: int(9000) } };
  const flogas = makeOffer({
    id: "flogas",
    supplier: "Flogas",
    utilityType: "gas",
    rates: { gas: decimal("11.25") },
    standingChargeCentsPerYear: 12000,
    discountPercent: ZERO,
  });
  const sseDual = makeOffer({
    id: "sse-dual",
    supplier: "SSE Airtricity",
    utilityType: "dual_fuel",
    rates: {
      day: decimal("34"),
      night: decimal("17"),
      peak: decimal("40"),
      gas: decimal("11"),
    },
    standingChargeCentsPerYear: 40000,
    discountPercent: decimal("10"),
  });
  const bgDual = makeOffer({
    ...sseDual,
    id: "bg-dual",
    supplier: "Bord Gáis Energy",
    standingChargeCentsPerYear: 0,
  });

  it("compares the best separate pair with the best dual fuel offer", () => {
    const result = compareDualFuel({
      electricity: PROTOTYPE_USAGE,
      gas: gasUsage,
      electricityOffers: [energia, renewal],
      gasOffers: [flogas],
      dualOffers: [sseDual, bgDual],
      excludedSuppliers: ["Bord Gáis Energy"],
    });
    // Separate: 243,847.0828 + 123,442.5 = 367,289.5828c.
    // Dual: (348,650 × 0.9 + 40,000) × 1.09 = 385,625.65c.
    expect(result.separate).toMatchObject({
      electricity: { supplier: "Energia", year1Cents: 243847 },
      gas: { supplier: "Flogas", year1Cents: 123443 },
      year1Cents: 367290,
    });
    expect(result.dual).toMatchObject({
      supplier: "SSE Airtricity",
      year1Cents: 385626,
    });
    expect(result.differenceCents).toBe(-18336);
    expect(result.verdict).toBe(
      "Separate suppliers (Energia + Flogas) are €183.36 cheaper in year 1 than the best dual fuel offer.",
    );
    expect(result.missing).toEqual([]);
  });

  it("says when dual fuel is cheaper", () => {
    const result = compareDualFuel({
      electricity: PROTOTYPE_USAGE,
      gas: gasUsage,
      electricityOffers: [renewal],
      gasOffers: [flogas],
      dualOffers: [sseDual],
      excludedSuppliers: [],
    });
    expect(result.differenceCents).toBeGreaterThan(0);
    expect(result.verdict).toMatch(
      /^Dual fuel with SSE Airtricity is €[\d,.]+ cheaper/,
    );
  });

  it("explains what's missing", () => {
    const result = compareDualFuel({
      electricity: PROTOTYPE_USAGE,
      gas: null,
      electricityOffers: [energia],
      gasOffers: [flogas],
      dualOffers: [sseDual],
      excludedSuppliers: [],
    });
    expect(result.separate).toBeNull();
    expect(result.dual).toBeNull();
    expect(result.differenceCents).toBeNull();
    expect(result.missing).toEqual(["gas usage"]);
    expect(result.verdict).toBe(
      "Add gas usage to compare dual fuel with separate suppliers.",
    );
  });

  it("never picks an excluded supplier on either side", () => {
    const result = compareDualFuel({
      electricity: PROTOTYPE_USAGE,
      gas: gasUsage,
      electricityOffers: [energia],
      gasOffers: [flogas],
      dualOffers: [bgDual],
      excludedSuppliers: ["Bord Gáis Energy"],
    });
    expect(result.dual).toBeNull();
    expect(result.missing).toEqual(["a comparable dual fuel offer"]);
  });
});
