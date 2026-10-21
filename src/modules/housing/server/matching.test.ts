// @vitest-environment node
import { describe, expect, it } from "vitest";
import {
  bestMatch,
  listingMatch,
  matchSummary,
  unitMatch,
  unitSummary,
} from "./matching";
import type { PropertyType, UnitType } from "./types";

function unit(
  bedrooms: number | null,
  property_type: PropertyType,
  rent_cents: number | null = null,
  label = `${bedrooms} bed ${property_type}`,
): UnitType {
  return { label, bedrooms, property_type, rent_cents, homes: null };
}

describe("unitMatch", () => {
  it("matches 3-bed houses only among 3-beds", () => {
    expect(unitMatch(unit(3, "house"))).toBe("match");
    expect(unitMatch(unit(3, "apartment"))).toBe("none");
    expect(unitMatch(unit(3, "duplex"))).toBe("none");
  });

  it("matches every 4-bed home, whatever the type", () => {
    expect(unitMatch(unit(4, "house"))).toBe("match");
    expect(unitMatch(unit(4, "apartment"))).toBe("match");
    expect(unitMatch(unit(4, "duplex"))).toBe("match");
    expect(unitMatch(unit(4, "unknown"))).toBe("match");
  });

  it("treats bigger homes like 4-beds", () => {
    expect(unitMatch(unit(5, "apartment"))).toBe("match");
  });

  it("flags 3-beds with an unknown type as possible, never a silent drop", () => {
    expect(unitMatch(unit(3, "unknown"))).toBe("possible");
  });

  it("ignores smaller homes", () => {
    for (const type of ["house", "apartment", "duplex", "unknown"] as const) {
      expect(unitMatch(unit(0, type))).toBe("none");
      expect(unitMatch(unit(1, type))).toBe("none");
      expect(unitMatch(unit(2, type))).toBe("none");
    }
  });
});

describe("bestMatch", () => {
  it("takes the strongest level", () => {
    expect(bestMatch([])).toBe("none");
    expect(bestMatch(["none", "possible"])).toBe("possible");
    expect(bestMatch(["possible", "match", "none"])).toBe("match");
  });
});

describe("listingMatch", () => {
  it("matches when any unit type matches (mixed developments)", () => {
    const result = listingMatch([
      unit(2, "apartment", 124000),
      unit(3, "house", 149500),
      unit(4, "house", 172000),
    ]);
    expect(result.matches).toBe("match");
    expect(result.minMatchingRentCents).toBe(149500);
    expect(result.matchingUnits.map((u) => u.bedrooms)).toEqual([3, 4]);
  });

  it("prefers definite matches over possible ones for the rent and summary", () => {
    const result = listingMatch([
      unit(3, "unknown", 120000),
      unit(4, "duplex", 165000),
    ]);
    expect(result.matches).toBe("match");
    expect(result.minMatchingRentCents).toBe(165000);
  });

  it("is possible when the only 3-beds have no stated type", () => {
    const result = listingMatch([
      unit(1, "apartment"),
      unit(3, "unknown", 171400),
    ]);
    expect(result.matches).toBe("possible");
    expect(result.minMatchingRentCents).toBe(171400);
  });

  it("is no match for 3-bed apartments and duplexes", () => {
    expect(
      listingMatch([unit(3, "apartment"), unit(3, "duplex"), unit(2, "house")])
        .matches,
    ).toBe("none");
  });

  it("keeps rent unknown when the matching units don't state one", () => {
    expect(
      listingMatch([unit(4, "house", null)]).minMatchingRentCents,
    ).toBeNull();
  });

  it("treats units with unstated bedrooms as possible unless the summary rules them out", () => {
    const unknownBeds = unit(null, "house", null, "Townhouse");
    expect(listingMatch([unknownBeds]).matches).toBe("possible");
    expect(listingMatch([unknownBeds], [2, 3]).matches).toBe("possible");
    expect(listingMatch([unknownBeds], [1, 2]).matches).toBe("none");
  });

  it("is possible when nothing at all is known about the homes", () => {
    expect(listingMatch([], []).matches).toBe("possible");
    expect(listingMatch([], [1, 2]).matches).toBe("none");
  });
});

describe("summaries", () => {
  it("describes units in plain words", () => {
    expect(unitSummary(unit(3, "house"))).toBe("3 bed house");
    expect(unitSummary(unit(4, "duplex"))).toBe("4 bed duplex");
    expect(unitSummary(unit(3, "unknown"))).toBe("3 bed, type not stated");
    expect(unitSummary(unit(0, "apartment"))).toBe("Studio apartment");
    expect(unitSummary(unit(null, "house", null, "Townhouse"))).toBe(
      "Townhouse",
    );
    expect(
      matchSummary([unit(3, "house"), unit(3, "house"), unit(4, "house")]),
    ).toBe("3 bed house · 4 bed house");
  });
});
