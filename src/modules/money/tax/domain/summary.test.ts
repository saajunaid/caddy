import { describe, expect, it } from "vitest";
import { centsToDecimal, csvCell, taxYearCsv } from "./csv";
import {
  buildYearSummary,
  monthsSoFar,
  selectRule,
  type EvidenceRow,
  type RuleRecord,
} from "./summary";

const RULE: RuleRecord = {
  ruleCode: "IE_REMOTE_WORKING_RELIEF",
  version: 1,
  taxYearFrom: 2022,
  taxYearTo: null,
  ruleJson: {
    formula: "((A × B ÷ C) − D) × 30%",
    rate_percent: 30,
    categories: [
      "remote_working_electricity",
      "remote_working_heating",
      "remote_working_broadband",
    ],
    allowance_category: "employer_remote_working_allowance",
    notes: ["Relief is given at the claimant's highest rate of income tax."],
  },
  officialSourceUrl:
    "https://www.revenue.ie/en/jobs-and-pensions/eworking/calculate-allowable-remote-working-costs.aspx",
  reviewedOn: "2026-10-21",
  status: "active",
};
const CATEGORIES = [
  "remote_working_electricity",
  "remote_working_heating",
  "remote_working_broadband",
];

const evidence = (over: Partial<EvidenceRow>): EvidenceRow => ({
  id: "e",
  memberId: "m1",
  category: "remote_working_electricity",
  paidCents: 21248,
  sharePercent: 100,
  documentId: "d",
  supplier: "Electric Ireland",
  periodStart: "2026-09-01",
  periodEnd: "2026-09-30",
  documentDate: "2026-10-03",
  ...over,
});

describe("selectRule", () => {
  it("picks the newest active version covering the year", () => {
    const v2 = { ...RULE, version: 2, taxYearFrom: 2027 };
    expect(selectRule([RULE, v2], 2026)?.record.version).toBe(1);
    expect(selectRule([RULE, v2], 2027)?.record.version).toBe(2);
    expect(selectRule([RULE], 2021)).toBeNull();
  });

  it("ignores drafts and malformed rule JSON", () => {
    expect(selectRule([{ ...RULE, status: "draft" }], 2026)).toBeNull();
    expect(
      selectRule([{ ...RULE, ruleJson: { rate_percent: "30" } }], 2026),
    ).toBeNull();
  });
});

describe("monthsSoFar", () => {
  it("past, current and future years", () => {
    expect(monthsSoFar(2025, "2026-10-21")).toHaveLength(12);
    expect(monthsSoFar(2026, "2026-10-21")).toEqual([
      1, 2, 3, 4, 5, 6, 7, 8, 9, 10,
    ]);
    expect(monthsSoFar(2027, "2026-10-21")).toEqual([]);
  });
});

describe("buildYearSummary", () => {
  const summary = buildYearSummary({
    year: 2026,
    today: "2026-10-21",
    rules: [RULE],
    members: [
      { id: "m1", name: "Junaid" },
      { id: "m2", name: "Ammara" },
    ],
    evidence: [
      evidence({ id: "e1" }),
      evidence({
        id: "e2",
        category: "remote_working_broadband",
        paidCents: 4500,
        sharePercent: 50,
        periodStart: "2026-10-01",
        periodEnd: "2026-10-31",
      }),
      evidence({
        id: "e3",
        memberId: "m2",
        category: "remote_working_broadband",
        paidCents: 4500,
        sharePercent: 50,
        periodStart: "2026-10-01",
        periodEnd: "2026-10-31",
      }),
    ],
    wfhDays: [
      { memberId: "m1", month: 9, days: 12 },
      { memberId: "m1", month: 10, days: 10 },
    ],
    categories: CATEGORIES,
  });

  it("computes each member separately with their own share", () => {
    const [junaid, ammara] = summary.members;
    expect(junaid.breakdown?.allowableCents).toBe(21248 + 2250);
    expect(junaid.breakdown?.wfhDays).toBe(22);
    expect(junaid.daysByMonth[8]).toBe(12);
    // (23,498 × 22 ÷ 365) × 30% = 424.89 → 425 cents
    expect(junaid.breakdown?.claimableCents).toBe(425);
    expect(ammara.breakdown?.allowableCents).toBe(2250);
    expect(ammara.breakdown?.wfhDays).toBe(0);
    expect(ammara.breakdown?.monthsMissing).toHaveLength(12);
  });

  it("lists evidence months per category against months so far", () => {
    const [electricity, heating, broadband] = summary.checklist;
    expect(electricity.covered).toEqual([9]);
    expect(electricity.missing).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 10]);
    expect(heating.covered).toEqual([]);
    expect(broadband.covered).toEqual([10]);
  });

  it("exports CSV with exact amounts and the claim disclaimer", () => {
    const csv = taxYearCsv(summary, {
      generatedOn: "2026-10-21",
      categoryLabel: (c) => c,
    });
    expect(csv).toContain("Tax year,2026");
    expect(csv).toContain("it never files a claim");
    expect(csv).toContain(
      "Junaid,remote_working_electricity,Electric Ireland,2026-09-01,2026-09-30,2026-10-03,212.48,100,d",
    );
    expect(csv).toContain("Junaid,234.98,22,365,14.16,0.00,4.25,0.85,1.70,");
    expect(csv.endsWith("\r\n")).toBe(true);
  });
});

describe("csv safety", () => {
  it("quotes and escapes", () => {
    expect(csvCell('Say "hi", ok')).toBe('"Say ""hi"", ok"');
    expect(csvCell(null)).toBe("");
  });

  it("neutralises spreadsheet formulas from document text", () => {
    expect(csvCell('=HYPERLINK("x")')).toBe('"\'=HYPERLINK(""x"")"');
    expect(csvCell("+353")).toBe("'+353");
    expect(csvCell(-5)).toBe("-5");
  });

  it("formats cents without floating point", () => {
    expect(centsToDecimal(21248)).toBe("212.48");
    expect(centsToDecimal(5)).toBe("0.05");
    expect(centsToDecimal(-6145)).toBe("-61.45");
  });
});
