import { describe, expect, it } from "vitest";
import {
  CURRENCIES,
  exponentOf,
  formatEur,
  formatMinor,
  minorToDecimal,
  noRateMessage,
  parseMinor,
  parseRate,
  pickRate,
  toEurCents,
  type FxRate,
} from "./currency";

describe("minor units", () => {
  it("use ISO 4217 exponents", () => {
    expect(exponentOf("EUR")).toBe(2);
    expect(exponentOf("TRY")).toBe(2);
    expect(exponentOf("JPY")).toBe(0);
    expect(exponentOf("ISK")).toBe(0);
    expect(exponentOf("HUF")).toBe(2);
    expect(() => exponentOf("XYZ")).toThrow(/Unsupported/);
    expect(CURRENCIES[0]).toBe("EUR");
    for (const c of [
      "MAD",
      "AED",
      "EGP",
      "THB",
      "CZK",
      "PLN",
      "SEK",
      "NOK",
      "DKK",
      "CHF",
    ])
      expect(CURRENCIES).toContain(c);
  });

  it("parse typed prices without floating point", () => {
    expect(parseMinor("1,234.56", "EUR")).toBe(123456);
    expect(parseMinor("€612", "EUR")).toBe(61200);
    expect(parseMinor("0.1", "EUR")).toBe(10);
    expect(parseMinor("2150", "TRY")).toBe(215000);
    expect(parseMinor("¥15,000", "JPY")).toBe(15000);
    expect(() => parseMinor("100.5", "JPY")).toThrow(/no decimal places/);
    expect(() => parseMinor("1.234", "EUR")).toThrow(/at most 2/);
    expect(() => parseMinor("-5", "EUR")).toThrow(/Not a price/);
    expect(() => parseMinor("abc", "EUR")).toThrow(/Not a price/);
  });

  it("format in the price's own currency", () => {
    expect(minorToDecimal(215000, "TRY")).toBe("2150.00");
    expect(minorToDecimal(5, "EUR")).toBe("0.05");
    expect(minorToDecimal(15000, "JPY")).toBe("15000");
    expect(formatMinor(15000, "JPY")).toBe("JP¥15,000");
    expect(formatMinor(61200, "EUR")).toBe("€612.00");
    expect(formatMinor(215000, "TRY")).toMatch(/2,150\.00/);
  });

  it("format euro totals as whole euros when there are no cents", () => {
    expect(formatEur(268100)).toBe("€2,681");
    expect(formatEur(6012)).toBe("€60.12");
    expect(formatEur(0)).toBe("€0");
  });
});

describe("conversion to euro", () => {
  it("parses rates exactly", () => {
    expect(parseRate("55.6009")).toEqual({ num: 556009n, den: 10000n });
    expect(parseRate("0.84028000")).toEqual({
      num: 84028000n,
      den: 100000000n,
    });
    expect(() => parseRate("0")).toThrow(/positive/);
    expect(() => parseRate("1e3")).toThrow(/Not a rate/);
  });

  it("converts once with half-up rounding", () => {
    // ₺2,150.00 at 35.7612 TRY per EUR = €60.1210...
    expect(toEurCents(215000, "TRY", "35.7612")).toBe(6012);
    // £100.00 at 0.84028 GBP per EUR = €119.0079...
    expect(toEurCents(10000, "GBP", "0.84028")).toBe(11901);
    // ¥15,000 at 177.34 JPY per EUR = €84.5833...
    expect(toEurCents(15000, "JPY", "177.34")).toBe(8458);
    // Exactly half a cent rounds up: 1 unit at rate 2 = 0.5 cent.
    expect(toEurCents(1, "USD", "2")).toBe(1);
    // ISK has no minor unit: 1,000 kr at 136.20 = €7.3421...
    expect(toEurCents(1000, "ISK", "136.20")).toBe(734);
    expect(toEurCents(61200, "EUR", null)).toBe(61200);
  });

  it("never converts without a rate", () => {
    expect(() => toEurCents(100, "TRY", null)).toThrow(/No rate/);
  });

  it("stays exact for large amounts", () => {
    // The intermediate product exceeds 2^53; bigint keeps it exact (checked with Python Fraction).
    expect(toEurCents(900719925474099, "USD", "1.1215")).toBe(803138587136959);
  });
});

describe("choosing a rate", () => {
  const rates: FxRate[] = [
    { id: "a", currency: "TRY", rateDate: "2026-10-09", rate: "35.1" },
    { id: "b", currency: "TRY", rateDate: "2026-10-13", rate: "35.3" },
    { id: "c", currency: "TRY", rateDate: "2026-10-16", rate: "35.5" },
    { id: "d", currency: "GBP", rateDate: "2026-10-12", rate: "0.84" },
  ];

  it("takes the latest on or before the checked date", () => {
    expect(pickRate(rates, "TRY", "2026-10-13")?.id).toBe("b");
    expect(pickRate(rates, "TRY", "2026-10-12")?.id).toBe("a"); // weekend gap
    expect(pickRate(rates, "TRY", "2026-10-30")?.id).toBe("c");
  });

  it("never uses a later rate or another currency's", () => {
    expect(pickRate(rates, "TRY", "2026-10-08")).toBeNull();
    expect(pickRate(rates, "USD", "2026-10-30")).toBeNull();
  });

  it("explains why a price can't be converted", () => {
    expect(noRateMessage("TRY", "2026-10-12")).toBe(
      "Can't convert TRY: no rate on or before 12 Oct",
    );
    expect(noRateMessage("MAD", "2026-10-12")).toMatch(
      /ECB doesn't publish a MAD rate/,
    );
  });
});
