// Merge the same place reported by several sources. Pure; unit-tested.
import type { PlaceCategory } from "./categories.ts";
import { foldText } from "./classify.ts";
import { haversineM } from "./geo.ts";
import type { PlaceMark, PlaceSource, StoredPlace } from "./types.ts";

/** Two similarly named places of the same kind closer than this are one place. */
export const DUPLICATE_RADIUS_M = 75;
/** Identically named parts of one campus (several OSM objects) are merged up to this distance. */
export const SAME_NAME_RADIUS_M = 1000;

/** Which source's details win when the same place comes from several. The household's own entry wins. */
export const SOURCE_RANK: Record<PlaceSource, number> = {
  user: 0,
  official: 1,
  google: 2,
  osm: 3,
};

const STOP_WORDS = new Set(["the", "and", "of", "a", "an"]);

/** Name tokens for comparison: folded, "St" → "saint", punctuation and filler words removed. */
export function nameTokens(name: string): string[] {
  return foldText(name)
    .replace(/&/g, " and ")
    .replace(/['’`]/g, "")
    .split(/[^a-z0-9]+/)
    .filter(Boolean)
    .map((t) => (t === "st" ? "saint" : t))
    .filter((t) => !STOP_WORDS.has(t));
}

/** Same name after normalising, or one name's words all appear in the other, or ≥60% overlap. */
export function namesSimilar(a: string, b: string): boolean {
  const ta = new Set(nameTokens(a));
  const tb = new Set(nameTokens(b));
  if (ta.size === 0 || tb.size === 0) return false;
  const shared = [...ta].filter((t) => tb.has(t)).length;
  const smaller = Math.min(ta.size, tb.size);
  if (shared === smaller && (smaller >= 2 || ta.size === tb.size)) return true;
  return shared / (ta.size + tb.size - shared) >= 0.6;
}

function sameName(a: string, b: string): boolean {
  return nameTokens(a).join(" ") === nameTokens(b).join(" ");
}

function categoriesCompatible(a: PlaceCategory, b: PlaceCategory): boolean {
  if (a === b) return true;
  const schools = new Set<PlaceCategory>(["primary", "secondary", "school"]);
  return (a === "school" || b === "school") && schools.has(a) && schools.has(b);
}

export type Dedupable = Pick<
  StoredPlace,
  "id" | "source" | "category" | "name" | "latitude" | "longitude" | "details"
>;

export function isDuplicate(a: Dedupable, b: Dedupable): boolean {
  if (!categoriesCompatible(a.category, b.category)) return false;
  // Two bus stops with different stop numbers are different stops, however close.
  if (a.details.ref && b.details.ref && a.details.ref !== b.details.ref) {
    return false;
  }
  const distance = haversineM(a, b);
  if (distance <= DUPLICATE_RADIUS_M && namesSimilar(a.name, b.name)) {
    return true;
  }
  return (
    a.category !== "bus" &&
    distance <= SAME_NAME_RADIUS_M &&
    sameName(a.name, b.name)
  );
}

export type Merged<T> = T & {
  mark: PlaceMark | null;
  note: string | null;
  /** Every source that reported this place, best first. */
  sources: PlaceSource[];
  /** Ids of the rows merged into this one (including its own). */
  mergedIds: string[];
};

/**
 * Collapse duplicates, keeping the best source's row (user > official > google > osm).
 * Household marks are never lost: a pin on any duplicate pins the merged place;
 * otherwise a hide on any duplicate hides it.
 */
export function dedupePlaces<T extends Dedupable>(
  places: readonly T[],
  marks: ReadonlyMap<string, { mark: PlaceMark; note: string | null }>,
): Merged<T>[] {
  const ordered = [...places].sort(
    (a, b) =>
      SOURCE_RANK[a.source] - SOURCE_RANK[b.source] || a.id.localeCompare(b.id),
  );
  const kept: Merged<T>[] = [];
  for (const place of ordered) {
    const m = marks.get(place.id);
    const match = kept.find((k) => isDuplicate(k, place));
    if (!match) {
      kept.push({
        ...place,
        mark: m?.mark ?? null,
        note: m?.note ?? null,
        sources: [place.source],
        mergedIds: [place.id],
      });
      continue;
    }
    match.mergedIds.push(place.id);
    if (!match.sources.includes(place.source)) match.sources.push(place.source);
    if (m) {
      if (m.mark === "pinned" || match.mark === null) match.mark = m.mark;
      match.note = match.note ?? m.note;
    }
  }
  return kept;
}
