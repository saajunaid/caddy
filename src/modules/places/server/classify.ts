// OpenStreetMap tags → nearby-place category and details. Pure; unit-tested.
import type { PlaceCategory } from "./categories.ts";
import type { PlaceDetails } from "./types.ts";

export type OsmTags = Readonly<Record<string, string | undefined>>;

/** Lower-case, strip accents (Coláiste → colaiste) and dots (N.S. → ns). */
export function foldText(value: string): string {
  return value
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/\./g, "");
}

const SECONDARY_NAME =
  /\b(secondary|post ?-?primary|community college|community school|comprehensive|colaiste|gaelcholaiste|college|high school|grammar school)\b/;
const PRIMARY_NAME =
  /\b(primary|national school|ns|scoil|gaelscoil|educate together|junior school|infants?)\b/;

type Level = "primary" | "secondary" | "school";

/** ISCED levels: 1 = primary, 2–3 = secondary. "1;2", "2-3" and the like. */
function levelFromIsced(value: string | undefined): Level | null {
  if (!value) return null;
  const v = foldText(value).replace(/post ?-?primary/g, "secondary");
  const digits = new Set(v.match(/\d/g) ?? []);
  const range = /(\d)\s*-\s*(\d)/.exec(v);
  if (range) {
    for (let d = Number(range[1]); d <= Number(range[2]); d += 1) {
      digits.add(String(d));
    }
  }
  const primary = digits.has("1") || /\bprimary\b/.test(v);
  const secondary =
    digits.has("2") ||
    digits.has("3") ||
    /\b(secondary|post-?primary)\b/.test(v);
  if (primary && secondary) return "school";
  if (primary) return "primary";
  if (secondary) return "secondary";
  return null;
}

/**
 * Primary vs secondary for amenity=school. Uses the level tags first, then Irish naming
 * conventions. When neither says, the level is unknown ("school"), never guessed.
 */
export function schoolLevel(tags: OsmTags): Level {
  for (const key of ["isced:level", "school:level", "school"]) {
    const level = levelFromIsced(tags[key]);
    if (level) return level;
  }
  const name = foldText(
    [tags.name, tags["name:en"], tags["name:ga"]].filter(Boolean).join(" "),
  );
  if (SECONDARY_NAME.test(name)) return "secondary";
  if (PRIMARY_NAME.test(name)) return "primary";
  return "school";
}

const FOOD_AMENITIES = new Set([
  "restaurant",
  "fast_food",
  "cafe",
  "food_court",
]);

/** Halal food: diet:halal=yes|only, a halal cuisine, or a food place/shop with "halal" in its name. */
export function halalEvidence(tags: OsmTags): string | null {
  const diet = tags["diet:halal"]?.toLowerCase();
  if (diet === "yes" || diet === "only") return diet;
  if (tags.cuisine && /halal/i.test(tags.cuisine)) return "cuisine";
  const isFoodPlace =
    FOOD_AMENITIES.has(tags.amenity ?? "") || Boolean(tags.shop);
  if (isFoodPlace && tags.name && /\bhalal\b/i.test(tags.name)) return "name";
  return null;
}

/** The category an OSM object belongs to, or null if it isn't one we show. */
export function classifyOsm(tags: OsmTags): PlaceCategory | null {
  const amenity = tags.amenity;
  if (amenity === "place_of_worship") {
    return tags.religion === "muslim" ? "mosque" : null;
  }
  if (amenity === "kindergarten" || amenity === "childcare") return "childcare";
  if (amenity === "school") return schoolLevel(tags);
  if (amenity === "university" || amenity === "college") return "higher";
  if (
    tags.highway === "bus_stop" ||
    (tags.public_transport === "platform" && tags.bus === "yes")
  ) {
    return "bus";
  }
  if (halalEvidence(tags)) return "halal";
  return null;
}

const NOUN: Record<PlaceCategory, string> = {
  childcare: "Childcare",
  primary: "Primary school",
  secondary: "Secondary school",
  school: "School",
  higher: "College",
  bus: "Bus stop",
  mosque: "Mosque",
  halal: "Halal food",
};

/** The object's name, or an honest placeholder when OSM has none. */
export function osmName(tags: OsmTags, category: PlaceCategory): string {
  const name = (tags.name ?? tags["name:en"] ?? tags["name:ga"])?.trim();
  if (name) return name.slice(0, 200);
  return `${NOUN[category]} (name not stated)`;
}

/** "12 Main Street, Castletroy, V94 X2Y3" from addr:* tags, or null. */
export function osmAddress(tags: OsmTags): string | null {
  const street = [tags["addr:housenumber"], tags["addr:street"]]
    .filter(Boolean)
    .join(" ");
  const parts = [
    street,
    tags["addr:suburb"],
    tags["addr:city"] ?? tags["addr:town"] ?? tags["addr:village"],
    tags["addr:postcode"],
  ].filter((p): p is string => Boolean(p && p.trim()));
  return parts.length ? parts.join(", ").slice(0, 300) : null;
}

const KIND: Record<string, string> = {
  kindergarten: "Preschool / ECCE",
  childcare: "Childcare",
  university: "University",
  college: "College / further education",
  place_of_worship: "Mosque",
};

/** A small, normalised subset of OSM tags. */
export function osmDetails(
  tags: OsmTags,
  category: PlaceCategory,
): PlaceDetails {
  const details: PlaceDetails = {};
  const set = <K extends keyof PlaceDetails>(
    key: K,
    value: string | undefined,
  ) => {
    const v = value?.trim();
    if (v) details[key] = v.slice(0, 200);
  };
  set("kind", tags.amenity ? KIND[tags.amenity] : undefined);
  set("openingHours", tags.opening_hours);
  set("website", tags.website ?? tags["contact:website"]);
  set("operator", tags.operator);
  if (category === "bus") {
    set("ref", tags.ref);
    set("routes", tags.route_ref);
  }
  if (category === "halal") {
    set("cuisine", tags.cuisine);
    set("halal", halalEvidence(tags) ?? undefined);
  }
  if (["primary", "secondary", "school"].includes(category)) {
    set("level", tags["isced:level"] ?? tags["school:level"]);
  }
  if (category === "mosque") set("denomination", tags.denomination);
  return details;
}
