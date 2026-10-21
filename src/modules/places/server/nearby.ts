// Choose what the Nearby panel shows: nearest N per category within its radius. Pure; unit-tested.
import { CATEGORIES, groupsFor, type CategoryKey } from "./categories.ts";
import { dedupePlaces, type Merged } from "./dedupe.ts";
import { haversineM, walkMinutes, type LatLon } from "./geo.ts";
import type { PlaceMark, StoredPlace } from "./types.ts";

const DAY_MS = 86_400_000;
/** Cached OSM/official rows not seen again for this long after their refresh date are treated as gone. */
export const STALE_GRACE_MS = 30 * DAY_MS;
/** Places you added or pinned still show up to this far away, beyond the category radius. */
export const OWN_PLACES_RADIUS_M = 10_000;

/**
 * Whether a stored row may be shown. Google's terms only allow caching its fields for 30 days,
 * so expired Google rows are never shown; cached OSM rows that haven't been confirmed for a
 * month past their refresh date are probably gone from the map.
 */
export function isDisplayable(
  place: Pick<StoredPlace, "source" | "refreshAfter">,
  now: Date,
): boolean {
  if (place.source === "user" || !place.refreshAfter) return true;
  const refreshAt = new Date(place.refreshAfter).getTime();
  if (place.source === "google") return refreshAt > now.getTime();
  return refreshAt + STALE_GRACE_MS > now.getTime();
}

export type NearbyItem = Merged<StoredPlace> & {
  distanceM: number;
  walkMin: number;
};

export type NearbyGroup = {
  key: CategoryKey;
  /** Shown in the list: pinned and own places plus the nearest N, by distance. */
  items: NearbyItem[];
  /** Places hidden by the household (collapsed under "Hidden (n)"). */
  hidden: NearbyItem[];
  /** How many places (not hidden) are within the radius in total. */
  withinRadius: number;
  radiusM: number;
};

export type MarkMap = ReadonlyMap<
  string,
  { mark: PlaceMark; note: string | null }
>;

export function selectNearby(
  anchor: LatLon,
  places: readonly StoredPlace[],
  marks: MarkMap,
  now: Date,
): NearbyGroup[] {
  const merged = dedupePlaces(
    places.filter((p) => isDisplayable(p, now)),
    marks,
  ).map((p): NearbyItem => {
    const distanceM = haversineM(anchor, p);
    return { ...p, distanceM, walkMin: walkMinutes(distanceM) };
  });

  return CATEGORIES.map(({ key, radiusM, limit }) => {
    const inGroup = merged
      .filter((p) => groupsFor(p.category).includes(key))
      .sort(
        (a, b) => a.distanceM - b.distanceM || a.name.localeCompare(b.name),
      );
    const own = (p: NearbyItem) => p.mark === "pinned" || p.source === "user";
    const hidden = inGroup.filter(
      (p) =>
        p.mark === "hidden" &&
        p.distanceM <= Math.max(radiusM, OWN_PLACES_RADIUS_M),
    );
    const visible = inGroup.filter((p) => p.mark !== "hidden");
    const within = visible.filter((p) => p.distanceM <= radiusM);
    const nearest = new Set(within.filter((p) => !own(p)).slice(0, limit));
    const items = visible.filter(
      (p) =>
        nearest.has(p) ||
        (own(p) && p.distanceM <= Math.max(radiusM, OWN_PLACES_RADIUS_M)),
    );
    return {
      key,
      items,
      hidden,
      withinRadius: within.length,
      radiusM,
    };
  });
}
