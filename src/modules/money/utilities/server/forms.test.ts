import { describe, expect, it } from "vitest";
import {
  centsToInput,
  offerToInput,
  offerTypesFor,
  overlapsExisting,
  parseContract,
  parseOffer,
  parseUsage,
} from "./forms";

describe("parseContract", () => {
  const base = {
    utility_type: "electricity",
    supplier: " Electric Ireland ",
    meter_type: "smart_tou",
    contract_end: "2026-11-03",
  };

  it("accepts a contract and trims text", () => {
    const parsed = parseContract(base);
    expect(parsed).toEqual({
      ok: true,
      value: {
        utility_type: "electricity",
        supplier: "Electric Ireland",
        tariff_name: null,
        account_label: null,
        meter_type: "smart_tou",
        contract_start: null,
        contract_end: "2026-11-03",
        status: "active",
        notes: null,
      },
    });
  });

  it("allows an unknown end date", () => {
    const parsed = parseContract({ ...base, contract_end: "" });
    expect(parsed.ok && parsed.value.contract_end).toBeNull();
  });

  it("refuses full account numbers and MPRNs", () => {
    const parsed = parseContract({ ...base, account_label: "100 1234 5678" });
    expect(parsed).toEqual({
      ok: false,
      error: expect.stringMatching(/last 4 digits/),
    });
    expect(parseContract({ ...base, account_label: "•••• 4821" }).ok).toBe(
      true,
    );
  });

  it("checks dates", () => {
    expect(parseContract({ ...base, contract_end: "2026-02-30" })).toEqual({
      ok: false,
      error: "End date isn't a real date.",
    });
    expect(parseContract({ ...base, contract_start: "2026-11-03" })).toEqual({
      ok: false,
      error: "The end date must be after the start date.",
    });
  });

  it("drops the meter type for non-energy contracts", () => {
    const parsed = parseContract({ ...base, utility_type: "broadband" });
    expect(parsed.ok && parsed.value.meter_type).toBe("unknown");
  });

  it("requires a supplier and a valid type", () => {
    expect(parseContract({ ...base, supplier: "" })).toEqual({
      ok: false,
      error: "Enter the supplier.",
    });
    expect(parseContract({ ...base, utility_type: "water" }).ok).toBe(false);
  });
});

describe("parseUsage", () => {
  it("accepts kWh per band and a bill total", () => {
    expect(
      parseUsage({
        period_start: "2026-09-01",
        period_end: "2026-09-30",
        day_kwh: "1,412.5",
        night_kwh: "288",
        peak_kwh: "",
        total: "€212.48",
      }),
    ).toEqual({
      ok: true,
      value: {
        period_start: "2026-09-01",
        period_end: "2026-09-30",
        day_kwh: 1412.5,
        night_kwh: 288,
        peak_kwh: null,
        standard_kwh: null,
        gas_kwh: null,
        total_cents: 21248,
      },
    });
  });

  it("needs at least one band and a valid period", () => {
    expect(
      parseUsage({ period_start: "2026-09-01", period_end: "2026-09-30" }),
    ).toEqual({
      ok: false,
      error: "Enter the kWh for at least one band, exactly as on the bill.",
    });
    expect(
      parseUsage({
        period_start: "2026-09-30",
        period_end: "2026-09-01",
        day_kwh: "1",
      }),
    ).toEqual({ ok: false, error: "The period must end after it starts." });
    expect(
      parseUsage({
        period_start: "2026-09-01",
        period_end: "2026-09-30",
        day_kwh: "-1",
      }).ok,
    ).toBe(false);
  });

  it("detects overlapping periods but allows a shared meter-read day", () => {
    const existing = [{ period_start: "2026-08-01", period_end: "2026-08-31" }];
    expect(
      overlapsExisting(
        { period_start: "2026-08-31", period_end: "2026-09-30" },
        existing,
      ),
    ).toBe(false);
    expect(
      overlapsExisting(
        { period_start: "2026-08-15", period_end: "2026-09-30" },
        existing,
      ),
    ).toBe(true);
  });
});

describe("offerToInput", () => {
  it("round-trips a saved offer through the form", () => {
    const row = {
      supplier: "Energia",
      tariff_name: null,
      utility_type: "electricity",
      day_rate_cents: 34.2,
      night_rate_cents: 17.1,
      peak_rate_cents: null,
      standard_rate_cents: null,
      gas_rate_cents: null,
      standing_charge_cents_per_year: 28005,
      discount_percent: 22,
      discount_includes_standing: true,
      discount_months: 6,
      cashback_cents: 10000,
      exit_fee_cents: 0,
      vat_percent: 9,
      source_url: null,
      checked_on: "2026-10-20",
      notes: null,
      is_current_renewal: false,
    };
    const input = offerToInput(row);
    expect(input.standing_charge).toBe("280.05");
    expect(input.exit_fee).toBe("");
    expect(centsToInput(5)).toBe("0.05");
    const parsed = parseOffer(input, "electricity", "2026-10-21");
    expect(parsed.ok && parsed.value).toMatchObject({
      day_rate_cents: 34.2,
      standing_charge_cents_per_year: 28005,
      discount_months: 6,
      discount_includes_standing: true,
      cashback_cents: 10000,
    });
  });
});

describe("parseOffer", () => {
  const base = {
    supplier: "Energia",
    day_rate_cents: "34.20",
    night_rate_cents: "17.10",
    peak_rate_cents: "39.9",
    standing_charge: "280",
    discount_percent: "22",
    vat_percent: "9",
    source_url: "https://www.bonkers.ie/compare-gas-electricity-prices/",
    checked_on: "2026-10-20",
  };

  it("converts euros to cents and keeps rates exact", () => {
    const parsed = parseOffer(base, "electricity", "2026-10-21");
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.value).toMatchObject({
      utility_type: "electricity",
      day_rate_cents: 34.2,
      standing_charge_cents_per_year: 28000,
      discount_percent: 22,
      discount_months: 12,
      cashback_cents: 0,
      exit_fee_cents: 0,
      vat_percent: 9,
      is_current_renewal: false,
      gas_rate_cents: null,
    });
  });

  it("catches rates entered in euros", () => {
    expect(
      parseOffer(
        { ...base, day_rate_cents: "0.342" },
        "electricity",
        "2026-10-21",
      ),
    ).toEqual({
      ok: false,
      error:
        "Day rate looks like euros per kWh. Enter cents, e.g. 34.20 for €0.3420.",
    });
  });

  it("requires a checked date that isn't in the future", () => {
    expect(
      parseOffer({ ...base, checked_on: "" }, "electricity", "2026-10-21").ok,
    ).toBe(false);
    expect(
      parseOffer(
        { ...base, checked_on: "2026-10-22" },
        "electricity",
        "2026-10-21",
      ),
    ).toEqual({ ok: false, error: "The checked date can't be in the future." });
  });

  it("only accepts web links as sources", () => {
    expect(
      parseOffer(
        { ...base, source_url: "javascript:alert(1)" },
        "electricity",
        "2026-10-21",
      ).ok,
    ).toBe(false);
  });

  it("ignores rates for bands the offer type can't have", () => {
    const parsed = parseOffer(
      { ...base, utility_type: "gas", gas_rate_cents: "11.25" },
      "gas",
      "2026-10-21",
    );
    expect(parsed.ok && parsed.value.day_rate_cents).toBeNull();
    expect(parsed.ok && parsed.value.gas_rate_cents).toBe(11.25);
  });

  it("limits offer types to the contract", () => {
    expect(offerTypesFor("electricity")).toEqual(["electricity", "dual_fuel"]);
    expect(offerTypesFor("broadband")).toEqual(["broadband"]);
    expect(
      parseOffer(
        { ...base, utility_type: "broadband" },
        "electricity",
        "2026-10-21",
      ).ok,
    ).toBe(false);
  });

  it("needs an annual price for fixed-price services", () => {
    expect(
      parseOffer(
        { supplier: "Eir", vat_percent: "23", checked_on: "2026-10-20" },
        "broadband",
        "2026-10-21",
      ),
    ).toEqual({ ok: false, error: "Enter the annual price before VAT." });
  });

  it("checks the discount months", () => {
    expect(
      parseOffer(
        { ...base, discount_months: "13" },
        "electricity",
        "2026-10-21",
      ),
    ).toEqual({
      ok: false,
      error: "Discount months must be a whole number from 0 to 12.",
    });
    const none = parseOffer(
      { ...base, discount_percent: "", discount_months: "12" },
      "electricity",
      "2026-10-21",
    );
    expect(none.ok && none.value.discount_months).toBe(0);
  });
});
