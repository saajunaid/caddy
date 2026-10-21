import { describe, expect, it } from "vitest";
import {
  add,
  compare,
  decimal,
  div,
  int,
  mul,
  ratio,
  round,
  sub,
  toDecimalString,
} from "./exact";
import {
  formatKwh,
  formatPercent,
  formatRate,
  monthRange,
  plural,
  shortDate,
} from "./format";

describe("exact arithmetic", () => {
  it("parses decimals from strings and database numbers without float error", () => {
    expect(decimal("37.1200")).toEqual({ n: 928n, d: 25n });
    expect(decimal(0.1)).toEqual({ n: 1n, d: 10n });
    expect(decimal("-3")).toEqual({ n: -3n, d: 1n });
    expect(decimal("1e-4")).toEqual({ n: 1n, d: 10000n });
    expect(decimal(1.5e3)).toEqual({ n: 1500n, d: 1n });
    expect(() => decimal("12,5")).toThrow();
    expect(() => decimal(Number.NaN)).toThrow();
  });

  it("adds 0.1 + 0.2 exactly", () => {
    expect(compare(add(decimal("0.1"), decimal("0.2")), decimal("0.3"))).toBe(
      0,
    );
  });

  it("multiplies fractional cents by fractional kWh exactly", () => {
    // 3410 kWh × 17.10c is 58311c exactly; floats give 58311.00000000001.
    expect(3410 * 17.1).not.toBe(58311);
    expect(mul(int(3410), decimal("17.10"))).toEqual({ n: 58311n, d: 1n });
  });

  it("rounds half away from zero, once", () => {
    expect(round(decimal("2.5"))).toBe(3);
    expect(round(decimal("-2.5"))).toBe(-3);
    expect(round(decimal("2.4999"))).toBe(2);
    expect(round(decimal("-0.4"))).toBe(0);
    expect(Object.is(round(decimal("-0.4")), -0)).toBe(false);
    expect(round(ratio(1, 3))).toBe(0);
    expect(round(ratio(2, 3))).toBe(1);
  });

  it("divides and subtracts", () => {
    expect(div(int(365), int(60))).toEqual({ n: 73n, d: 12n });
    expect(sub(int(1), ratio(1, 4))).toEqual({ n: 3n, d: 4n });
    expect(() => div(int(1), int(0))).toThrow(/zero/);
  });

  it("prints decimals for display", () => {
    expect(toDecimalString(decimal("34.2000"), 4)).toBe("34.2");
    expect(toDecimalString(ratio(1, 3), 2)).toBe("0.33");
    expect(toDecimalString(decimal("-1.5"), 2)).toBe("-1.5");
  });
});

describe("formatting", () => {
  it("formats dates deterministically", () => {
    expect(shortDate("2026-11-03")).toBe("3 Nov 2026");
    expect(monthRange("2025-09-01", "2026-08-31")).toBe("Sept 2025–Aug 2026");
    expect(monthRange("2026-09-01", "2026-09-30")).toBe("Sept 2026");
  });

  it("formats usage, rates and percentages", () => {
    expect(formatKwh(decimal("4919.6"))).toBe("4,920");
    expect(formatRate(decimal("34.2"))).toBe("34.20c");
    expect(formatRate(decimal("34.2012"))).toBe("34.2012c");
    expect(formatPercent(decimal("22.00"))).toBe("22%");
    expect(formatPercent(decimal("12.5"))).toBe("12.5%");
    expect(plural(1, "day")).toBe("1 day");
    expect(plural(1312, "day")).toBe("1,312 days");
  });
});
