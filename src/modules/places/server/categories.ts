// Nearby-place categories, search radii and list sizes. Pure data, shared by jobs and the app.

export type CategoryKey =
  "childcare" | "primary" | "secondary" | "higher" | "bus" | "mosque" | "halal";

/** Stored category. "school" = a school whose level OSM doesn't state; shown under Primary and Secondary. */
export type PlaceCategory = CategoryKey | "school";

export type CategoryDef = {
  key: CategoryKey;
  label: string;
  /** One-letter glyph on map pins and filter chips (matches the prototype). */
  glyph: string;
  /** Theme colour variable for the pin and chip. */
  color: string;
  /** Default search radius in metres. */
  radiusM: number;
  /** How many of the nearest to show. */
  limit: number;
};

export const CATEGORIES: readonly CategoryDef[] = [
  {
    key: "childcare",
    label: "Childcare / ECCE",
    glyph: "C",
    color: "var(--cyan)",
    radiusM: 2000,
    limit: 8,
  },
  {
    key: "primary",
    label: "Primary",
    glyph: "P",
    color: "var(--green)",
    radiusM: 2000,
    limit: 8,
  },
  {
    key: "secondary",
    label: "Secondary",
    glyph: "S",
    color: "var(--orange)",
    radiusM: 3000,
    limit: 8,
  },
  {
    key: "higher",
    label: "Further & higher ed",
    glyph: "U",
    color: "var(--purple)",
    radiusM: 10000,
    limit: 8,
  },
  {
    key: "bus",
    label: "Bus stops",
    glyph: "B",
    color: "var(--yellow)",
    radiusM: 500,
    limit: 5,
  },
  {
    key: "mosque",
    label: "Mosques",
    glyph: "M",
    color: "var(--pink)",
    radiusM: 5000,
    limit: 8,
  },
  {
    key: "halal",
    label: "Halal food",
    glyph: "H",
    color: "var(--red)",
    radiusM: 5000,
    limit: 8,
  },
];

export const CATEGORY_KEYS: readonly CategoryKey[] = CATEGORIES.map(
  (c) => c.key,
);

export const PLACE_CATEGORIES: readonly PlaceCategory[] = [
  ...CATEGORY_KEYS,
  "school",
];

/**
 * Bump when the category set, radii or the Overpass query change, so every location is
 * searched again with the new rules.
 */
export const CATEGORIES_VERSION = "v1";

export function categoryDef(key: CategoryKey): CategoryDef {
  const def = CATEGORIES.find((c) => c.key === key);
  if (!def) throw new Error(`Unknown category ${key}`);
  return def;
}

/** Display groups a stored category appears in. Unknown-level schools show in both school groups. */
export function groupsFor(category: PlaceCategory): CategoryKey[] {
  return category === "school" ? ["primary", "secondary"] : [category];
}

/** Search radius for a stored category (unknown-level schools use the wider school radius). */
export function radiusFor(category: PlaceCategory): number {
  return Math.max(...groupsFor(category).map((k) => categoryDef(k).radiusM));
}

export function isPlaceCategory(value: unknown): value is PlaceCategory {
  return (
    typeof value === "string" &&
    (PLACE_CATEGORIES as readonly string[]).includes(value)
  );
}

export function isCategoryKey(value: unknown): value is CategoryKey {
  return (
    typeof value === "string" &&
    (CATEGORY_KEYS as readonly string[]).includes(value)
  );
}
