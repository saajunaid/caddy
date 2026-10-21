// Which external sources a lookup uses. Runs in plain Node and in the app.
import type { ExternalSource } from "./types.ts";

/**
 * Google Places when a key is set (PLAN D27: public Overpass mirrors timed out from GitHub
 * Actions and this sandbox). OpenStreetMap only as the no-key fallback, or alongside Google when
 * PLACES_USE_OSM=1.
 */
export function activeSources(
  googleApiKey: string | null,
  env: Record<string, string | undefined> = process.env,
): ExternalSource[] {
  if (!googleApiKey) return ["osm"];
  return env.PLACES_USE_OSM === "1" ? ["osm", "google"] : ["google"];
}
