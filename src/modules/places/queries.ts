import "server-only";
import { createClient } from "@/lib/supabase/server";
import { CATEGORIES_VERSION, isPlaceCategory } from "./server/categories";
import { describePlace } from "./server/describe";
import { boundingBox, type Anchor } from "./server/geo";
import {
  OWN_PLACES_RADIUS_M,
  selectNearby,
  type NearbyItem,
} from "./server/nearby";
import { isSearchDue, searchCell, type SearchState } from "./server/refresh";
import type {
  PlaceDetails,
  PlaceMark,
  PlaceSource,
  StoredPlace,
} from "./server/types";
import type { CategoryKey } from "./server/categories";

/** One row in the Nearby lists, ready for the client. */
export type NearbyRow = {
  id: string;
  /** Every stored row merged into this one; marks are applied to all of them. */
  ids: string[];
  name: string;
  detail: string;
  latitude: number;
  longitude: number;
  distanceM: number;
  walkMin: number;
  source: PlaceSource;
  mark: PlaceMark | null;
  note: string | null;
  /** The household added it, so it can be deleted. */
  own: boolean;
  website: string | null;
};

export type NearbyGroupData = {
  key: CategoryKey;
  items: NearbyRow[];
  hidden: NearbyRow[];
  withinRadius: number;
  radiusM: number;
};

export type SourceState = {
  status: SearchState["status"];
  searchedAt: string;
  lastSuccessAt: string | null;
  error: string | null;
};

export type NearbyData = {
  groups: NearbyGroupData[];
  osm: SourceState | null;
  google: SourceState | null;
  /** Some source has a successful search for this location. */
  searched: boolean;
  /** A new lookup is allowed now (never done, failed, or older than the refresh window). */
  canRefresh: boolean;
};

const SELECT =
  "id, source, source_id, category, name, latitude, longitude, address, details, household_id, fetched_at, refresh_after";

type PlaceRow = {
  id: string;
  source: string;
  source_id: string | null;
  category: string;
  name: string;
  latitude: number;
  longitude: number;
  address: string | null;
  details: unknown;
  household_id: string | null;
  fetched_at: string;
  refresh_after: string | null;
};

function toStored(row: PlaceRow): StoredPlace | null {
  if (!isPlaceCategory(row.category)) return null;
  const details =
    row.details &&
    typeof row.details === "object" &&
    !Array.isArray(row.details)
      ? (row.details as PlaceDetails)
      : {};
  return {
    id: row.id,
    source: row.source as PlaceSource,
    sourceId: row.source_id,
    category: row.category,
    name: row.name,
    latitude: row.latitude,
    longitude: row.longitude,
    address: row.address,
    details,
    householdId: row.household_id,
    fetchedAt: row.fetched_at,
    refreshAfter: row.refresh_after,
  };
}

function toRow(item: NearbyItem): NearbyRow {
  const website = item.details.website ?? item.details.mapsUrl ?? null;
  return {
    id: item.id,
    ids: item.mergedIds,
    name: item.name,
    detail: describePlace(item),
    latitude: item.latitude,
    longitude: item.longitude,
    distanceM: Math.round(item.distanceM),
    walkMin: item.walkMin,
    source: item.source,
    mark: item.mark,
    note: item.note,
    own: item.source === "user",
    website: website && /^https?:\/\//.test(website) ? website : null,
  };
}

/** Cached places, the household's own places and marks around an anchor. Runs as the user (RLS). */
export async function loadNearby(
  anchor: Pick<Anchor, "latitude" | "longitude">,
  now: Date,
): Promise<NearbyData> {
  const supabase = await createClient();
  const wide = boundingBox(anchor, OWN_PLACES_RADIUS_M);
  const near = boundingBox(anchor, 5_200);
  const cell = searchCell(anchor);
  const [farRows, nearRows, marks, searches] = await Promise.all([
    // Colleges (10 km) and the household's own places can be far away.
    supabase
      .from("places")
      .select(SELECT)
      .or("category.eq.higher,source.eq.user")
      .gte("latitude", wide.minLat)
      .lte("latitude", wide.maxLat)
      .gte("longitude", wide.minLon)
      .lte("longitude", wide.maxLon)
      .limit(2000),
    supabase
      .from("places")
      .select(SELECT)
      .neq("category", "higher")
      .neq("source", "user")
      .gte("latitude", near.minLat)
      .lte("latitude", near.maxLat)
      .gte("longitude", near.minLon)
      .lte("longitude", near.maxLon)
      .limit(4000),
    supabase
      .from("household_place_marks")
      .select("place_id, mark, note")
      .limit(5000),
    supabase
      .from("place_searches")
      .select("source, status, searched_at, last_success_at, error")
      .eq("categories_version", CATEGORIES_VERSION)
      .eq("latitude", cell.latitude)
      .eq("longitude", cell.longitude),
  ]);
  for (const result of [farRows, nearRows, marks, searches]) {
    if (result.error)
      throw new Error(`Couldn't load nearby places: ${result.error.message}`);
  }

  const places = [...(farRows.data ?? []), ...(nearRows.data ?? [])]
    .map((row) => toStored(row as PlaceRow))
    .filter((p): p is StoredPlace => p !== null);
  const markMap = new Map(
    (marks.data ?? []).map((m) => [
      m.place_id,
      { mark: m.mark as PlaceMark, note: m.note },
    ]),
  );
  const state = (source: "osm" | "google"): SourceState | null => {
    const row = searches.data?.find((s) => s.source === source);
    return row
      ? {
          status: row.status as SearchState["status"],
          searchedAt: row.searched_at,
          lastSuccessAt: row.last_success_at,
          error: row.error,
        }
      : null;
  };
  const osm = state("osm");
  const google = state("google");
  const groups = selectNearby(anchor, places, markMap, now).map((g) => ({
    key: g.key,
    items: g.items.map(toRow),
    hidden: g.hidden.map(toRow),
    withinRadius: g.withinRadius,
    radiusM: g.radiusM,
  }));
  const searched = Boolean(osm?.lastSuccessAt || google?.lastSuccessAt);
  // On demand, a failure can be retried straight away (the job backs off; a person asked).
  // The main source is Google when it has been used here, otherwise OpenStreetMap.
  const [mainKey, main] = google
    ? (["google", google] as const)
    : (["osm", osm] as const);
  const canRefresh =
    !main || main.status === "failed" || isSearchDue(main, mainKey, now);
  return { groups, osm, google, searched, canRefresh };
}
