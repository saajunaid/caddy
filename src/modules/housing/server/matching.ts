// The household's matching rule (PLAN §7.1). Pure, no I/O.
//
// Per unit type:  3 bedrooms AND house → match;  4+ bedrooms (any type) → match;
//                 3 bedrooms with unknown type → possible (never silently dropped);
//                 unknown bedrooms → possible unless the listing's bedroom summary rules
//                 out 3+ bedrooms (see listingMatch).
// A listing's match is the best of its unit types.
import type { MatchLevel, UnitType } from "./types.ts";

export const MATCH_RULE_TEXT =
  "Every 3-bed house and every home with 4 or more bedrooms, of any type. A 3-bed home whose type isn't stated shows as a possible match so nothing is silently dropped.";

const RANK: Record<MatchLevel, number> = { none: 0, possible: 1, match: 2 };

export function bestMatch(levels: readonly MatchLevel[]): MatchLevel {
  return levels.reduce<MatchLevel>(
    (best, level) => (RANK[level] > RANK[best] ? level : best),
    "none",
  );
}

/** Whether one unit type matches the household's needs. */
export function unitMatch(
  unit: Pick<UnitType, "bedrooms" | "property_type">,
): MatchLevel {
  const { bedrooms, property_type: type } = unit;
  if (bedrooms === null) return "none";
  if (bedrooms >= 4) return "match";
  if (bedrooms === 3) {
    if (type === "house") return "match";
    if (type === "unknown") return "possible";
  }
  return "none";
}

export type ListingMatch = {
  matches: MatchLevel;
  /** Lowest published rent among matching (or, failing that, possible) unit types. */
  minMatchingRentCents: number | null;
  /** Unit types at the listing's best level, for summaries like "3 bed house · 4 bed duplex". */
  matchingUnits: UnitType[];
};

/**
 * Listing-level match: the best of its unit types.
 * `summaryBedrooms` are the bedroom counts in the listing's "Bedrooms" summary ("2 & 3 Bed").
 * A unit whose bedrooms aren't stated is "possible" unless that summary rules out 3+ beds.
 * A listing with no unit types and no summary can't be ruled out, so it's "possible" too.
 */
export function listingMatch(
  units: readonly UnitType[],
  summaryBedrooms: readonly number[] = [],
): ListingMatch {
  const summaryAllowsMatch =
    summaryBedrooms.length === 0 || Math.max(...summaryBedrooms) >= 3;
  if (units.length === 0) {
    return {
      matches: summaryBedrooms.length === 0 ? "possible" : "none",
      minMatchingRentCents: null,
      matchingUnits: [],
    };
  }
  const levels: MatchLevel[] = units.map((unit) =>
    unit.bedrooms === null
      ? summaryAllowsMatch
        ? "possible"
        : "none"
      : unitMatch(unit),
  );
  const best = bestMatch(levels);
  const matchingUnits =
    best === "none" ? [] : units.filter((_, i) => levels[i] === best);
  const rents = matchingUnits
    .map((u) => u.rent_cents)
    .filter((r): r is number => r !== null);
  return {
    matches: best,
    minMatchingRentCents: rents.length > 0 ? Math.min(...rents) : null,
    matchingUnits,
  };
}

const TYPE_WORD: Record<UnitType["property_type"], string> = {
  house: "house",
  apartment: "apartment",
  duplex: "duplex",
  unknown: "type not stated",
};

/** "3 bed house", "4 bed duplex", "3 bed, type not stated". */
export function unitSummary(unit: UnitType): string {
  if (unit.bedrooms === null) return unit.label;
  const beds = unit.bedrooms === 0 ? "Studio" : `${unit.bedrooms} bed`;
  return unit.property_type === "unknown"
    ? `${beds}, ${TYPE_WORD.unknown}`
    : `${beds} ${TYPE_WORD[unit.property_type]}`;
}

/** Distinct summaries of the matching units, e.g. "3 bed house · 4 bed house". */
export function matchSummary(units: readonly UnitType[]): string {
  return [...new Set(units.map(unitSummary))].join(" · ");
}
