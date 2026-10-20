import { describe, expect, it } from "vitest";
import { formatMoney, multiplyCents, parseToCents, sumCents } from "./money";

describe("parseToCents", () => {
  it("parses common formats exactly", () => {
    expect(parseToCents("212.48")).toBe(21248);
    expect(parseToCents("€1,486.20")).toBe(148620);
    expect(parseToCents("12.5")).toBe(1250);
    expect(parseToCents("7")).toBe(700);
    expect(parseToCents("-61.45")).toBe(-6145);
  });

  it("avoids floating-point drift", () => {
    expect(parseToCents("0.1") + parseToCents("0.2")).toBe(30);
  });

  it("rejects ambiguous input", () => {
    expect(() => parseToCents("12.345")).toThrow();
    expect(() => parseToCents("abc")).toThrow();
    expect(() => parseToCents("")).toThrow();
  });
});

describe("sumCents", () => {
  it("adds and rejects non-integers", () => {
    expect(sumCents([148620, 110240, 54000])).toBe(312860);
    expect(() => sumCents([1.5])).toThrow();
  });
});

describe("multiplyCents", () => {
  it("apportions and rounds half away from zero", () => {
    // Remote working relief example: €3,128.60 × 148/365 = €1,268.58 (1268.5830…)
    expect(multiplyCents(312860, 148, 365)).toBe(126858);
    // × 30% = €380.574 → €380.57
    expect(multiplyCents(126858, 30, 100)).toBe(38057);
    expect(multiplyCents(5, 1, 2)).toBe(3);
    expect(multiplyCents(-5, 1, 2)).toBe(-3);
  });

  it("rejects bad factors", () => {
    expect(() => multiplyCents(100, 1, 0)).toThrow();
    expect(() => multiplyCents(100, 0.3, 1)).toThrow();
  });
});

describe("formatMoney", () => {
  it("formats euro amounts", () => {
    expect(formatMoney(21248)).toBe("€212.48");
    expect(formatMoney(149500, "EUR", { wholeUnits: true })).toBe("€1,495");
  });
});
