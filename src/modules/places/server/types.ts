// Shared shapes for nearby places. Types only.
import type { PlaceCategory } from "./categories.ts";

export type PlaceSource = "osm" | "google" | "official" | "user";
export type ExternalSource = Exclude<PlaceSource, "user">;
export type PlaceMark = "pinned" | "hidden";

/** Normalised, source-independent facts. Every field is optional: unknown stays absent. */
export type PlaceDetails = {
  /** What the source calls it, e.g. "Kindergarten", "University". */
  kind?: string;
  openingHours?: string;
  website?: string;
  operator?: string;
  /** Bus stop number. */
  ref?: string;
  /** Bus routes serving the stop, as tagged ("304;304A"). */
  routes?: string;
  cuisine?: string;
  /** OSM diet:halal value ("yes" | "only"), or "name" when only the name says halal. */
  halal?: string;
  /** School level as stated by the source (OSM isced:level / school:level). */
  level?: string;
  denomination?: string;
  /** Google Maps link (Google places only). */
  mapsUrl?: string;
  /** Free-text note an adult added (user places only). */
  note?: string;
};

/** A place found by an adapter, before it's stored. */
export type PlaceCandidate = {
  source: ExternalSource;
  sourceId: string;
  category: PlaceCategory;
  name: string;
  latitude: number;
  longitude: number;
  address: string | null;
  details: PlaceDetails;
};

/** A stored place as the app reads it. */
export type StoredPlace = {
  id: string;
  source: PlaceSource;
  sourceId: string | null;
  category: PlaceCategory;
  name: string;
  latitude: number;
  longitude: number;
  address: string | null;
  details: PlaceDetails;
  householdId: string | null;
  fetchedAt: string;
  refreshAfter: string | null;
};
