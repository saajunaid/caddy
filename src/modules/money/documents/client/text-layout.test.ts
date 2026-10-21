import { describe, expect, it } from "vitest";
import { itemsToLines, looksScanned } from "./text-layout";

describe("itemsToLines", () => {
  it("joins fragments on one baseline left to right, lines top to bottom", () => {
    const lines = itemsToLines([
      { str: "€212.48", x: 400, y: 500, height: 10 },
      { str: "Total Amount Due", x: 50, y: 500.6, height: 10 },
      { str: "Bill Date", x: 50, y: 700, height: 10 },
      { str: "03 Oct 2026", x: 300, y: 699, height: 10 },
      { str: "   ", x: 10, y: 600, height: 10 },
    ]);
    expect(lines).toEqual([
      "Bill Date 03 Oct 2026",
      "Total Amount Due €212.48",
    ]);
  });

  it("keeps separate lines apart", () => {
    const lines = itemsToLines([
      { str: "Day Units 412 kWh", x: 50, y: 400, height: 9 },
      { str: "Night Units 288 kWh", x: 50, y: 388, height: 9 },
    ]);
    expect(lines).toEqual(["Day Units 412 kWh", "Night Units 288 kWh"]);
  });
});

describe("looksScanned", () => {
  it("treats an almost empty text layer as a scan", () => {
    expect(looksScanned("", 1)).toBe(true);
    expect(looksScanned("Page 1", 2)).toBe(true);
    expect(
      looksScanned(
        "Electric Ireland Bill Date 03 Oct 2026 Total Amount Due €212.48",
        1,
      ),
    ).toBe(false);
  });
});
