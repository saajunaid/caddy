import { describe, expect, it } from "vitest";
import {
  computeWfhRelief,
  daysInYear,
  percentToBasisPoints,
  roundRational,
  type EvidenceInput,
  type WfhRule,
} from "./wfh";

const RULE: WfhRule = {
  ratePercent: 30,
  categories: [
    "remote_working_electricity",
    "remote_working_heating",
    "remote_working_broadband",
  ],
  allowanceCategory: "employer_remote_working_allowance",
};

const FULL = 10000; // 100% in basis points
const elec = (paidCents: number, share = FULL): EvidenceInput => ({
  category: "remote_working_electricity",
  paidCents,
  shareBasisPoints: share,
});
/** Spread `total` days over the year's months (whole days, early months first). */
function days(total: number): number[] {
  const months = Array<number>(12).fill(Math.floor(total / 12));
  for (let i = 0; i < total % 12; i += 1) months[i] += 1;
  return months;
}

describe("computeWfhRelief", () => {
  it("worked example: A €3,128.60, B 148, C 365, D 0", () => {
    // By hand: 312,860 × 148 = 46,303,280 cent-days; ÷ 365 = 126,858.30 (€1,268.58 share)
    // × 30% = 38,057.49 cents → €380.57 (one rounding at the end).
    // (The prototype showed €380.58; that figure came from floating-point display rounding.)
    const result = computeWfhRelief(RULE, {
      year: 2026,
      evidence: [
        elec(148620),
        {
          category: "remote_working_heating",
          paidCents: 110240,
          shareBasisPoints: FULL,
        },
        {
          category: "remote_working_broadband",
          paidCents: 54000,
          shareBasisPoints: FULL,
        },
      ],
      daysByMonth: days(148),
    });
    expect(result.allowableCents).toBe(312860);
    expect(result.wfhDays).toBe(148);
    expect(result.daysInYear).toBe(365);
    expect(result.wfhShareCents).toBe(126858);
    expect(result.baseCents).toBe(126858);
    expect(result.claimableCents).toBe(38057);
    expect(result.flooredAtZero).toBe(false);
    // Exact 38,057.4904 × 20% = 7,611.498 → €76.11
    expect(result.taxBackCents.standard).toBe(7611);
    // × 40% = 15,222.996 → €152.23
    expect(result.taxBackCents.higher).toBe(15223);
    expect(result.categories).toEqual([
      {
        category: "remote_working_electricity",
        count: 1,
        paidCents: 148620,
        allowableCents: 148620,
      },
      {
        category: "remote_working_heating",
        count: 1,
        paidCents: 110240,
        allowableCents: 110240,
      },
      {
        category: "remote_working_broadband",
        count: 1,
        paidCents: 54000,
        allowableCents: 54000,
      },
    ]);
  });

  it("shared bills: applies each person's share before anything else", () => {
    // 148,620 × 50% = 74,310; × 148 ÷ 365 × 30% = 329,936,400 ÷ 36,500 = 9,039.35 → €90.39
    const result = computeWfhRelief(RULE, {
      year: 2026,
      evidence: [elec(148620, 5000)],
      daysByMonth: days(148),
    });
    expect(result.categories[0]).toMatchObject({
      paidCents: 148620,
      allowableCents: 74310,
    });
    expect(result.allowableCents).toBe(74310);
    expect(result.claimableCents).toBe(9039);
  });

  it("odd shares stay exact: 33.33% of €100.01", () => {
    // 10,001 × 3,333 = 33,333,333 (÷10,000 = 3,333.3333 cents). × 365/365 × 30% = 1,000.00 → €10.00
    const result = computeWfhRelief(RULE, {
      year: 2026,
      evidence: [elec(10001, 3333)],
      daysByMonth: [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31],
    });
    expect(result.wfhDays).toBe(365);
    expect(result.allowableCents).toBe(3333);
    expect(result.claimableCents).toBe(1000);
  });

  it("leap year divides by 366", () => {
    // 100,000 × 100 × 30 ÷ (366 × 100) = 8,196.72 → €81.97
    const result = computeWfhRelief(RULE, {
      year: 2028,
      evidence: [elec(100000)],
      daysByMonth: days(100),
    });
    expect(result.daysInYear).toBe(366);
    expect(result.claimableCents).toBe(8197);
  });

  it("29 February only counts in a leap year", () => {
    const feb29 = [0, 29, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0];
    expect(() =>
      computeWfhRelief(RULE, { year: 2026, evidence: [], daysByMonth: feb29 }),
    ).toThrow(/days/);
    expect(
      computeWfhRelief(RULE, { year: 2028, evidence: [], daysByMonth: feb29 })
        .wfhDays,
    ).toBe(29);
  });

  it("employer allowance larger than the share of bills → nothing claimable, never negative", () => {
    // Share: 100,000 × 10 ÷ 365 = 2,739.73; minus D 5,000 = −2,260.27 → 0
    const result = computeWfhRelief(RULE, {
      year: 2026,
      evidence: [
        elec(100000),
        {
          category: "employer_remote_working_allowance",
          paidCents: 5000,
          shareBasisPoints: FULL,
        },
      ],
      daysByMonth: days(10),
    });
    expect(result.allowanceCents).toBe(5000);
    expect(result.baseCents).toBe(-2260);
    expect(result.claimableCents).toBe(0);
    expect(result.flooredAtZero).toBe(true);
    expect(result.taxBackCents).toEqual({ standard: 0, higher: 0 });
  });

  it("employer allowance reduces the share before the 30%", () => {
    // (312,860 × 148 ÷ 365 − 32,000) × 30% = (126,858.30 − 32,000) × 0.3 = 28,457.49 → €284.57
    const result = computeWfhRelief(RULE, {
      year: 2026,
      evidence: [
        elec(312860),
        {
          category: "employer_remote_working_allowance",
          paidCents: 32000,
          shareBasisPoints: FULL,
        },
      ],
      daysByMonth: days(148),
    });
    expect(result.claimableCents).toBe(28457);
  });

  it("missing months are listed and count as zero days", () => {
    const daysByMonth = [10, 12, null, 8, null, 0, 0, 0, 0, 0, 0, null];
    const result = computeWfhRelief(RULE, {
      year: 2026,
      evidence: [elec(50000)],
      daysByMonth,
    });
    expect(result.wfhDays).toBe(30);
    expect(result.monthsMissing).toEqual([3, 5, 12]);
  });

  it("no evidence or no days → zero, not an error", () => {
    const none = computeWfhRelief(RULE, {
      year: 2026,
      evidence: [],
      daysByMonth: Array(12).fill(null),
    });
    expect(none.claimableCents).toBe(0);
    expect(none.monthsMissing).toHaveLength(12);
    expect(none.flooredAtZero).toBe(false);
  });

  it("ignores categories outside remote working", () => {
    const result = computeWfhRelief(RULE, {
      year: 2026,
      evidence: [
        { category: "medical", paidCents: 99999, shareBasisPoints: FULL },
      ],
      daysByMonth: days(100),
    });
    expect(result.allowableCents).toBe(0);
  });

  it("rounds exactly half a cent up", () => {
    // 610 × 1 × 30 ÷ (366 × 100) = 0.5 cent → 1 cent
    const result = computeWfhRelief(RULE, {
      year: 2028,
      evidence: [elec(610)],
      daysByMonth: [1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
    });
    expect(result.claimableCents).toBe(1);
  });

  it("rejects fractional cents and impossible day counts", () => {
    expect(() =>
      computeWfhRelief(RULE, {
        year: 2026,
        evidence: [elec(10.5)],
        daysByMonth: days(1),
      }),
    ).toThrow();
    expect(() =>
      computeWfhRelief(RULE, {
        year: 2026,
        evidence: [],
        daysByMonth: [32, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
      }),
    ).toThrow();
  });
});

describe("helpers", () => {
  it("days in year", () => {
    expect(daysInYear(2026)).toBe(365);
    expect(daysInYear(2028)).toBe(366);
    expect(daysInYear(2100)).toBe(365);
    expect(daysInYear(2000)).toBe(366);
  });

  it("round half away from zero", () => {
    expect(roundRational(5n, 10n)).toBe(1);
    expect(roundRational(4n, 10n)).toBe(0);
    expect(roundRational(-5n, 10n)).toBe(-1);
  });

  it("percent to basis points", () => {
    expect(percentToBasisPoints("50")).toBe(5000);
    expect(percentToBasisPoints("33.33")).toBe(3333);
    expect(percentToBasisPoints(100)).toBe(10000);
    expect(percentToBasisPoints("12.5")).toBe(1250);
    expect(() => percentToBasisPoints("0")).toThrow();
    expect(() => percentToBasisPoints("100.01")).toThrow();
    expect(() => percentToBasisPoints("abc")).toThrow();
  });
});
