import { describe, expect, it } from "vitest";
import {
  applyProposals,
  crossFieldErrors,
  formatFieldValue,
  fromDocumentRow,
  inputValue,
  monthsCovered,
  parseFieldInput,
  periodLabel,
  toDocumentUpdate,
} from "./review";

describe("applyProposals", () => {
  it("never overwrites fields the user confirmed", () => {
    const next = applyProposals(
      { supplier: "SSE Airtricity", total_cents: 10000, vat_cents: 900 },
      ["supplier", "total_cents"],
      {
        supplier: { value: "Electric Ireland", confidence: "high" },
        total_cents: { value: 21248, confidence: "high" },
        vat_cents: { value: 1754, confidence: "high" },
      },
    );
    expect(next).toEqual({
      supplier: "SSE Airtricity",
      total_cents: 10000,
      vat_cents: 1754,
    });
  });

  it("a proposal with only candidates never clears an existing value", () => {
    const next = applyProposals({ total_cents: 5000 }, [], {
      total_cents: { value: null, confidence: "low", candidates: [5000, 7500] },
    });
    expect(next.total_cents).toBe(5000);
  });

  it("ignores unknown keys", () => {
    const next = applyProposals({}, [], {
      ["nonsense" as "supplier"]: { value: "x", confidence: "high" },
    });
    expect(next).toEqual({});
  });
});

describe("parseFieldInput", () => {
  it("money to cents, exactly", () => {
    expect(parseFieldInput("total_cents", "€1,212.48")).toEqual({
      ok: true,
      value: 121248,
    });
    expect(parseFieldInput("total_cents", "-61.45")).toEqual({
      ok: true,
      value: -6145,
    });
    expect(parseFieldInput("total_cents", "12.345").ok).toBe(false);
  });

  it("empty means unknown", () => {
    expect(parseFieldInput("supplier", "  ")).toEqual({
      ok: true,
      value: null,
    });
  });

  it("dates must be real", () => {
    expect(parseFieldInput("document_date", "2026-02-29").ok).toBe(false);
    expect(parseFieldInput("document_date", "2028-02-29")).toEqual({
      ok: true,
      value: "2028-02-29",
    });
  });

  it("decimals stay exact strings", () => {
    expect(parseFieldInput("day_kwh", "1,104")).toEqual({
      ok: true,
      value: "1104",
    });
    expect(parseFieldInput("day_rate_cents", "37.12c")).toEqual({
      ok: true,
      value: "37.12",
    });
    expect(parseFieldInput("vat_rate_percent", "13.5%")).toEqual({
      ok: true,
      value: "13.5",
    });
    expect(parseFieldInput("day_kwh", "lots").ok).toBe(false);
  });

  it("identifiers are stored masked, whatever the user types", () => {
    expect(parseFieldInput("account_number_masked", "9 1234 4821")).toEqual({
      ok: true,
      value: "•••• 4821",
    });
    expect(parseFieldInput("mprn_masked", "5678")).toEqual({
      ok: true,
      value: "•••• 5678",
    });
    expect(parseFieldInput("mprn_masked", "•••• 5678")).toEqual({
      ok: true,
      value: "•••• 5678",
    });
    expect(parseFieldInput("account_number_masked", "ab12345cd")).toEqual({
      ok: true,
      value: "•••• 45CD",
    });
    expect(parseFieldInput("account_number_masked", "12").ok).toBe(false);
  });

  it("document type must be known", () => {
    expect(parseFieldInput("document_type", "gas_bill")).toEqual({
      ok: true,
      value: "gas_bill",
    });
    expect(parseFieldInput("document_type", "tax_return").ok).toBe(false);
  });
});

describe("display", () => {
  it("formats values by kind", () => {
    expect(formatFieldValue("total_cents", 21248)).toBe("€212.48");
    expect(formatFieldValue("document_date", "2026-10-03")).toBe("3 Oct 2026");
    expect(formatFieldValue("day_kwh", "412")).toBe("412 kWh");
    expect(formatFieldValue("vat_rate_percent", "9")).toBe("9%");
    expect(formatFieldValue("document_type", "electricity_bill")).toBe(
      "Electricity bill",
    );
    expect(formatFieldValue("supplier", null)).toBe("Unknown");
  });

  it("input values for money avoid floating point", () => {
    expect(inputValue("total_cents", 21248)).toBe("212.48");
    expect(inputValue("total_cents", -5)).toBe("-0.05");
    expect(inputValue("total_cents", null)).toBe("");
  });

  it("period labels", () => {
    expect(periodLabel("2026-09-01", "2026-09-30", null)).toBe("Sep 2026");
    expect(periodLabel("2026-07-01", "2026-08-30", null)).toBe("Jul–Aug 2026");
    expect(periodLabel("2026-12-01", "2027-01-31", null)).toBe(
      "Dec 2026–Jan 2027",
    );
    expect(periodLabel(null, null, "2026-10-14")).toBe("14 Oct 2026");
    expect(periodLabel(null, null, null)).toBeNull();
  });
});

describe("monthsCovered", () => {
  it("one-month and two-month bills", () => {
    expect(monthsCovered("2026-09-01", "2026-09-30", null, 2026)).toEqual([9]);
    expect(monthsCovered("2026-07-01", "2026-08-30", null, 2026)).toEqual([
      7, 8,
    ]);
  });

  it("only counts months with at least a week of the bill", () => {
    // 12 Sep – 11 Oct: both months have more than a week.
    expect(monthsCovered("2026-09-12", "2026-10-11", null, 2026)).toEqual([
      9, 10,
    ]);
    // 28 Aug – 30 Sep: 4 days of August don't count.
    expect(monthsCovered("2026-08-28", "2026-09-30", null, 2026)).toEqual([9]);
  });

  it("only months inside the tax year", () => {
    expect(monthsCovered("2026-12-01", "2027-01-31", null, 2026)).toEqual([12]);
    expect(monthsCovered("2026-12-01", "2027-01-31", null, 2027)).toEqual([1]);
  });

  it("falls back to the bill date", () => {
    expect(monthsCovered(null, null, "2026-10-14", 2026)).toEqual([10]);
    expect(monthsCovered(null, null, null, 2026)).toEqual([]);
  });
});

describe("columns and details", () => {
  it("round-trips through a documents row", () => {
    const values = {
      supplier: "Electric Ireland",
      document_type: "electricity_bill",
      total_cents: 21248,
      day_kwh: "412",
      account_number_masked: "•••• 4821",
    };
    const { columns, details } = toDocumentUpdate(values);
    expect(columns).toMatchObject({
      supplier: "Electric Ireland",
      total_cents: 21248,
    });
    expect(details).toEqual({
      day_kwh: "412",
      account_number_masked: "•••• 4821",
    });
    expect(fromDocumentRow({ ...columns, details })).toMatchObject(values);
  });

  it("ignores junk in details", () => {
    const values = fromDocumentRow({
      supplier: null,
      document_type: null,
      document_date: null,
      period_start: null,
      period_end: null,
      due_date: null,
      total_cents: null,
      vat_cents: null,
      details: { hacker: "x", day_kwh: { nested: true }, supplier: "override" },
    });
    expect(values.supplier).toBeNull();
    expect(values).not.toHaveProperty("hacker");
    expect(values).not.toHaveProperty("day_kwh");
  });

  it("flags a period that ends before it starts", () => {
    expect(
      crossFieldErrors({
        period_start: "2026-09-30",
        period_end: "2026-09-01",
      }),
    ).toHaveLength(1);
    expect(
      crossFieldErrors({
        period_start: "2026-09-01",
        period_end: "2026-09-30",
      }),
    ).toEqual([]);
  });
});
