import { describe, expect, it } from "vitest";
import {
  decimalString,
  eurosToCentsString,
  findDates,
  findMoney,
  maskIdentifier,
  normalizeText,
  readAccount,
  readGprn,
  readMprn,
  readPercent,
  readRate,
  readReference,
  readUnits,
  redactSnippet,
} from "./values";

const cents = (text: string) => findMoney(text).map((t) => t.cents);
const dates = (text: string) => findDates(text).map((d) => d.iso);

describe("findMoney", () => {
  it("reads euro amounts with thousands separators and signs", () => {
    expect(cents("Total €1,234.56")).toEqual([123456]);
    expect(cents("EUR 45.00 and 7.10")).toEqual([4500, 710]);
    expect(cents("Credit -€61.45")).toEqual([-6145]);
    expect(cents("Credit €-61.45")).toEqual([-6145]);
    expect(cents("Balance 20.00 CR")).toEqual([-2000]);
  });

  it("ignores rates, percentages, kWh, dates and long decimals", () => {
    expect(cents("@ 37.12c per kWh")).toEqual([]);
    expect(cents("37.12 c/kWh")).toEqual([]);
    expect(cents("VAT 13.50%")).toEqual([]);
    expect(cents("412.00 kWh")).toEqual([]);
    expect(cents("on 12.10.2026")).toEqual([]);
    expect(cents("€0.8273 per day")).toEqual([]);
    expect(cents("€0.27 per day")).toEqual([]);
  });

  it("doesn't treat a separator dash as a minus sign", () => {
    expect(cents("Total - €212.48")).toEqual([21248]);
  });
});

describe("findDates", () => {
  it("reads Irish day-first numeric dates", () => {
    expect(dates("03/10/2026")).toEqual(["2026-10-03"]);
    expect(dates("3-10-2026 and 12.10.2026")).toEqual([
      "2026-10-03",
      "2026-10-12",
    ]);
    expect(dates("14/10/26 18:42")).toEqual(["2026-10-14"]);
  });

  it("reads written months in several styles", () => {
    expect(dates("3 Oct 2026")).toEqual(["2026-10-03"]);
    expect(dates("03 October 2026")).toEqual(["2026-10-03"]);
    expect(dates("1st September 2026")).toEqual(["2026-09-01"]);
    expect(dates("12-Sept-2026")).toEqual(["2026-09-12"]);
    expect(dates("October 3, 2026")).toEqual(["2026-10-03"]);
    expect(dates("2026-10-03")).toEqual(["2026-10-03"]);
  });

  it("rejects impossible dates instead of guessing", () => {
    expect(dates("31/02/2026")).toEqual([]);
    expect(dates("13/13/2026")).toEqual([]);
    expect(dates("29/02/2028")).toEqual(["2028-02-29"]);
  });

  it("keeps reading order for periods", () => {
    expect(dates("01 Jul 2026 to 30 Aug 2026")).toEqual([
      "2026-07-01",
      "2026-08-30",
    ]);
  });
});

describe("decimals and rates", () => {
  it("keeps exact decimal strings", () => {
    expect(decimalString("1,104")).toBe("1104");
    expect(decimalString("37.10")).toBe("37.1");
    expect(decimalString("007")).toBe("7");
    expect(decimalString("abc")).toBeNull();
  });

  it("converts euro per kWh to cent per kWh without floating point", () => {
    expect(eurosToCentsString("0.3712")).toBe("37.12");
    expect(eurosToCentsString("0.342")).toBe("34.2");
    expect(eurosToCentsString("0.01137")).toBe("1.137");
    expect(eurosToCentsString("1.5")).toBe("150");
  });

  it("reads unit rates in cent or euro", () => {
    expect(readRate("412 kWh @ 37.12c per kWh €152.93")).toBe("37.12");
    expect(readRate("380 kWh €0.3420/kWh €129.96")).toBe("34.2");
    expect(readRate("no rate here €12.00")).toBeNull();
  });

  it("reads percentages", () => {
    expect(readPercent("VAT @ 9% on €194.94")).toBe("9");
    expect(readPercent("VAT (13.5%)")).toBe("13.5");
  });
});

describe("readUnits", () => {
  it("prefers an explicit kWh figure", () => {
    expect(readUnits("412 kWh @ 37.12c €152.93")).toEqual({
      value: "412",
      via: "kwh",
    });
    expect(readUnits("1,104 kWh")).toEqual({ value: "1104", via: "kwh" });
  });

  it("works out units from previous and present meter readings", () => {
    expect(readUnits("23,145 A 23,987 E 842 36.50c €307.33")).toEqual({
      value: "842",
      via: "readings",
    });
  });

  it("returns null when numbers don't add up", () => {
    expect(readUnits("100 200 300 €12.00")).toBeNull();
  });

  it("accepts a single plain number", () => {
    expect(readUnits(": 412")).toEqual({ value: "412", via: "single" });
  });
});

describe("identifiers", () => {
  it("masks to the last four characters", () => {
    expect(maskIdentifier("9 1234 4821")).toBe("•••• 4821");
    expect(maskIdentifier("123")).toBeNull();
  });

  it("reads account numbers without swallowing following words", () => {
    expect(readAccount(" 9 1234 4821 Bill Date 03 Oct 2026")).toBe("•••• 4821");
    expect(readAccount(": 8 765 4302")).toBe("•••• 4302");
    expect(readAccount(" No. AB12345678")).toBe("•••• 5678");
    expect(readAccount(" holder name")).toBeNull();
  });

  it("reads MPRN and GPRN", () => {
    expect(readMprn(" 10 012 345 678")).toBe("•••• 5678");
    expect(readMprn(": 10098765432")).toBe("•••• 5432");
    expect(readMprn(" 12345")).toBeNull();
    expect(readGprn(" 1234567")).toBe("•••• 4567");
  });

  it("reads invoice references that contain a digit", () => {
    expect(readReference(": inv-2026-0142")).toBe("INV-2026-0142");
    expect(readReference(" EI2026100347")).toBe("EI2026100347");
    expect(readReference(" pending")).toBeNull();
  });
});

describe("redactSnippet", () => {
  it("masks long digit runs but keeps amounts and dates", () => {
    expect(redactSnippet("Account 9 1234 4821 due 03/10/2026 €212.48")).toBe(
      "Account ••••4821 due 03/10/2026 €212.48",
    );
    expect(redactSnippet("MPRN 10012345678")).toBe("MPRN ••••5678");
    expect(redactSnippet("on 2026-10-03")).toBe("on 2026-10-03");
  });

  it("truncates long lines", () => {
    expect(redactSnippet("x".repeat(200)).length).toBe(140);
  });
});

describe("normalizeText", () => {
  it("unifies spaces, dashes and line endings", () => {
    expect(normalizeText("Total due\r\n01/09/2026 – 30/09/2026")).toBe(
      "Total due\n01/09/2026 - 30/09/2026",
    );
  });
});
