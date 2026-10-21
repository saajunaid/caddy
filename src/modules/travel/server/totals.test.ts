import { describe, expect, it } from "vitest";
import type { FxRate } from "./currency";
import { component } from "./test-fixtures";
import { budgetText, candidateTotal, estimateShare } from "./totals";

const rates: FxRate[] = [
  { id: "try-17", currency: "TRY", rateDate: "2026-10-17", rate: "35.7612" },
  { id: "try-09", currency: "TRY", rateDate: "2026-10-09", rate: "34" },
];

describe("candidate totals", () => {
  // Albufeira from the prototype: €612 + €1,764 + €96 + €24 (estimate) = €2,496.
  const albufeira = [
    component({
      kind: "flight",
      priceMinor: 61200,
      includes: "2×20kg bags",
      excludes: "Seats",
    }),
    component({
      kind: "accommodation",
      priceMinor: 176400,
      includes: "Half board",
      excludes: "Lunches",
    }),
    component({ kind: "transfer", priceMinor: 9600 }),
    component({
      kind: "other",
      provider: null,
      priceMinor: 2400,
      isEstimate: true,
      includes: "half board",
    }),
  ];

  it("adds every price in euro and splits it per person", () => {
    const total = candidateTotal(albufeira, [], {
      travellers: 4,
      budgetCents: 320000,
    });
    expect(total.totalCents).toBe(249600);
    expect(total.complete).toBe(true);
    expect(total.perPersonCents).toBe(62400);
    expect(total.estimateCents).toBe(2400);
    expect(total.budget).toEqual({ status: "within", remainingCents: 70400 });
    expect(total.includes).toEqual(["2×20kg bags", "Half board"]);
    expect(total.excludes).toEqual(["Seats", "Lunches"]);
    expect(total.oldestCheck).toBe("2026-10-12");
  });

  it("rounds the per-person share half-up", () => {
    const total = candidateTotal([component({ priceMinor: 100 })], [], {
      travellers: 3,
      budgetCents: null,
    });
    expect(total.perPersonCents).toBe(33);
    const half = candidateTotal([component({ priceMinor: 5 })], [], {
      travellers: 2,
      budgetCents: null,
    });
    expect(half.perPersonCents).toBe(3);
  });

  it("converts other currencies with the latest rate on or before the checked date", () => {
    const transfer = component({
      currency: "TRY",
      priceMinor: 215000,
      checkedAt: "2026-10-18T10:00:00Z",
    });
    const total = candidateTotal([transfer], rates, {
      travellers: 4,
      budgetCents: null,
    });
    expect(total.lines[0].eurCents).toBe(6012);
    expect(total.lines[0].rate?.id).toBe("try-17");
    expect(total.totalCents).toBe(6012);
  });

  it("keeps the rate pinned when the price was saved", () => {
    const transfer = component({
      currency: "TRY",
      priceMinor: 215000,
      checkedAt: "2026-10-18T10:00:00Z",
      fxRate: rates[1],
    });
    const total = candidateTotal([transfer], rates, {
      travellers: 4,
      budgetCents: null,
    });
    expect(total.lines[0].rate?.id).toBe("try-09");
    expect(total.lines[0].eurCents).toBe(6324); // 2150 / 34 = 63.235…
  });

  it("uses the Dublin date of the check", () => {
    // 23:30 UTC on 16 Oct is 00:30 on 17 Oct in Dublin (summer time).
    const transfer = component({
      currency: "TRY",
      priceMinor: 215000,
      checkedAt: "2026-10-16T23:30:00Z",
    });
    const total = candidateTotal([transfer], rates, {
      travellers: 1,
      budgetCents: null,
    });
    expect(total.lines[0].rate?.id).toBe("try-17");
  });

  it("leaves out prices it can't convert and says why", () => {
    const total = candidateTotal(
      [
        component({ priceMinor: 100000 }),
        component({
          currency: "TRY",
          priceMinor: 215000,
          checkedAt: "2026-10-01T10:00:00Z",
        }),
      ],
      rates,
      { travellers: 2, budgetCents: 90000 },
    );
    expect(total.totalCents).toBe(100000);
    expect(total.complete).toBe(false);
    expect(total.lines[1].eurCents).toBeNull();
    expect(total.lines[1].problem).toBe(
      "Can't convert TRY: no rate on or before 1 Oct",
    );
    expect(total.budget).toEqual({ status: "over", overCents: 10000 });
    // Under budget so far, but a price is missing: "within" isn't known.
    const partial = candidateTotal(
      [
        component({ priceMinor: 100000 }),
        component({ currency: "MAD", priceMinor: 900000 }),
      ],
      rates,
      { travellers: 2, budgetCents: 320000 },
    );
    expect(partial.budget).toBeNull();
    expect(partial.perPersonCents).toBe(50000);
    const none = candidateTotal(
      [component({ currency: "MAD", priceMinor: 900000 })],
      rates,
      { travellers: 2, budgetCents: 320000 },
    );
    expect(none).toMatchObject({
      totalCents: 0,
      converted: 0,
      perPersonCents: null,
      budget: null,
    });
  });

  it("has no per-person share or budget status without prices", () => {
    const total = candidateTotal([], [], { travellers: 4, budgetCents: 1000 });
    expect(total.totalCents).toBe(0);
    expect(total.perPersonCents).toBeNull();
    expect(total.budget).toBeNull();
    expect(total.oldestCheck).toBeNull();
  });

  it("describes the estimated share and budget", () => {
    const total = candidateTotal(
      [
        component({ priceMinor: 233100 }),
        component({ priceMinor: 35000, isEstimate: true }),
      ],
      [],
      { travellers: 4, budgetCents: 250000 },
    );
    expect(estimateShare(total)).toBe("€350 of €2,681 is estimated");
    expect(budgetText(total.budget!)).toBe("over budget by €181");
    expect(budgetText({ status: "within", remainingCents: 51900 })).toBe(
      "within budget (€519 to spare)",
    );
    expect(
      estimateShare(
        candidateTotal([component({ priceMinor: 100 })], [], {
          travellers: 1,
          budgetCents: null,
        }),
      ),
    ).toBeNull();
  });
});
