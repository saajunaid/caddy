// @vitest-environment node
import { describe, expect, it } from "vitest";
import {
  clean,
  parseBedrooms,
  parseBedroomsSummary,
  parseInteger,
  parseIrishDate,
  parsePropertyType,
  parseRentCents,
  splitLocation,
} from "./values";

describe("parseRentCents", () => {
  it("reads the rent formats used on newstarterhomes.ie", () => {
    expect(parseRentCents("€1,495")).toBe(149500);
    expect(parseRentCents("€1495")).toBe(149500);
    expect(parseRentCents("From €1525")).toBe(152500);
    expect(parseRentCents("€1,407 per calendar month")).toBe(140700);
    expect(parseRentCents("1,302")).toBe(130200);
    expect(parseRentCents("€1,462.50")).toBe(146250);
    expect(parseRentCents("€1339.50")).toBe(133950);
    expect(parseRentCents("Prices starting from €1,495")).toBe(149500);
  });

  it("leaves missing or unstated rents as null", () => {
    expect(parseRentCents("TBC")).toBeNull();
    expect(parseRentCents("")).toBeNull();
    expect(parseRentCents(null)).toBeNull();
    expect(parseRentCents(" ")).toBeNull();
  });
});

describe("parseInteger", () => {
  it("reads counts", () => {
    expect(parseInteger("327 Units")).toBe(327);
    expect(parseInteger("20")).toBe(20);
    expect(parseInteger("1,200 homes")).toBe(1200);
    expect(parseInteger("TBC")).toBeNull();
    expect(parseInteger(undefined)).toBeNull();
  });
});

describe("parseIrishDate", () => {
  it("reads long-form dates", () => {
    expect(parseIrishDate("2 November 2026")).toBe("2026-11-02");
    expect(parseIrishDate("02 November 2026 at 12:00")).toBe("2026-11-02");
    expect(parseIrishDate("27 October 2026 at 12:00")).toBe("2026-10-27");
    expect(parseIrishDate("6 Nov 2026")).toBe("2026-11-06");
    expect(parseIrishDate("6 Sept 2026")).toBe("2026-09-06");
  });

  it("reads ordinals and the calendar's aria labels", () => {
    expect(
      parseIrishDate(
        "The Sidings applications will be open from 09:00 on the 21st of October 2026.",
      ),
    ).toBe("2026-10-21");
    expect(parseIrishDate("Wednesday the 21st of October 2026")).toBe(
      "2026-10-21",
    );
    expect(parseIrishDate("Wed. Oct. 7th 2026")).toBe("2026-10-07");
  });

  it("reads numeric dates day first, as in Ireland", () => {
    expect(parseIrishDate("02/11/2026")).toBe("2026-11-02");
    expect(parseIrishDate("Listed: 20/10/2026")).toBe("2026-10-20");
    expect(parseIrishDate("(until 2/11/2026)")).toBe("2026-11-02");
  });

  it("rejects impossible or missing dates", () => {
    expect(parseIrishDate("31 November 2026")).toBeNull();
    expect(parseIrishDate("31/02/2026")).toBeNull();
    expect(parseIrishDate("Applications open soon")).toBeNull();
    expect(parseIrishDate("Marching 2026")).toBeNull();
    expect(parseIrishDate(null)).toBeNull();
  });
});

describe("parseBedrooms", () => {
  it("reads digits and words", () => {
    expect(parseBedrooms("3 Bed Duplex (The Cherry)")).toBe(3);
    expect(parseBedrooms("2-bed duplex")).toBe(2);
    expect(parseBedrooms("1-bed")).toBe(1);
    expect(parseBedrooms("Three-bedroom house")).toBe(3);
    expect(parseBedrooms("four bedroom home")).toBe(4);
    expect(parseBedrooms("2 BED APARTMENT - 3 PERSON")).toBe(2);
    expect(parseBedrooms("3 Bedroom House")).toBe(3);
    expect(parseBedrooms("Studio")).toBe(0);
  });

  it("returns null when bedrooms aren't stated", () => {
    expect(parseBedrooms("Townhouse")).toBeNull();
    expect(parseBedrooms("Type A")).toBeNull();
    expect(parseBedrooms("")).toBeNull();
  });
});

describe("parsePropertyType", () => {
  it("recognises houses, including terraced, semi-detached and bungalows", () => {
    expect(parsePropertyType("3 Bed House")).toBe("house");
    expect(parsePropertyType("Three-bedroom terraced house")).toBe("house");
    expect(parsePropertyType("2 Bed Mid-Terraced House")).toBe("house");
    expect(parsePropertyType("2 bed mid terrace house")).toBe("house");
    expect(parsePropertyType("3 Bed Semi Detached")).toBe("house");
    expect(parsePropertyType("Two-bedroom bungalows")).toBe("house");
    expect(parsePropertyType("Three-bedroom houses")).toBe("house");
  });

  it("treats duplexes as duplexes even when called apartments", () => {
    expect(parsePropertyType("2 Bed Duplex Apartment")).toBe("duplex");
    expect(parsePropertyType("Three-bedroom duplexes")).toBe("duplex");
    expect(parsePropertyType("3 Bed Duplex (The Cherry)")).toBe("duplex");
  });

  it("recognises apartments", () => {
    expect(parsePropertyType("1 Bed Apt")).toBe("apartment");
    expect(parsePropertyType("Two-bedroom apartments")).toBe("apartment");
    expect(parsePropertyType("Studio")).toBe("apartment");
    expect(parsePropertyType("1 Bed ground floor apartment")).toBe("apartment");
  });

  it("never guesses: 'home' and bare sizes are unknown", () => {
    expect(parsePropertyType("Three-bedroom home")).toBe("unknown");
    expect(parsePropertyType("3 bed")).toBe("unknown");
    expect(parsePropertyType("2-bed")).toBe("unknown");
    expect(parsePropertyType("")).toBe("unknown");
  });
});

describe("parseBedroomsSummary", () => {
  it("lists every size in the summary", () => {
    expect(parseBedroomsSummary("1, 2 & 3 Bed")).toEqual([1, 2, 3]);
    expect(parseBedroomsSummary("3 Bed")).toEqual([3]);
    expect(parseBedroomsSummary("Studio, 1 & 2 Bed")).toEqual([0, 1, 2]);
    expect(parseBedroomsSummary("Not stated")).toEqual([]);
    expect(parseBedroomsSummary(null)).toEqual([]);
  });
});

describe("splitLocation", () => {
  it("separates locality and county", () => {
    expect(splitLocation("Shankill, Co. Dublin")).toEqual({
      locality: "Shankill",
      county: "Dublin",
    });
    expect(splitLocation("Clondalkin, Dublin 22, Co. Dublin")).toEqual({
      locality: "Clondalkin",
      county: "Dublin",
    });
    expect(splitLocation("Castletroy, County Limerick")).toEqual({
      locality: "Castletroy",
      county: "Limerick",
    });
    expect(splitLocation("Limerick City")).toEqual({
      locality: "Limerick City",
      county: null,
    });
    expect(splitLocation(null)).toEqual({ locality: null, county: null });
  });
});

describe("clean", () => {
  it("collapses whitespace including non-breaking spaces", () => {
    expect(clean(" 2-bed \n duplex ")).toBe("2-bed duplex");
    expect(clean("   ")).toBeNull();
  });
});
