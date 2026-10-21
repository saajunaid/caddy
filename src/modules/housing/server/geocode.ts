// Geocoding fallback for listings whose page has no map pin: OpenStreetMap Nominatim.
// Usage policy: identifying User-Agent, ≤ 1 request/second, cache results (we store them on
// the listing and only look up again when the address changes).
import type { Fetcher } from "./http.ts";

export const NOMINATIM_SEARCH = "https://nominatim.openstreetmap.org/search";

/** The address we'd look up, or null when there's nothing specific enough. */
export function geocodeQuery(listing: {
  address_text: string | null;
  locality: string | null;
  county: string | null;
}): string | null {
  const base =
    listing.address_text ??
    [listing.locality, listing.county ? `Co. ${listing.county}` : null]
      .filter(Boolean)
      .join(", ");
  if (!base) return null;
  const expanded = base.replace(/\bCo\.\s*/g, "County ");
  return /\bireland\b/i.test(expanded) ? expanded : `${expanded}, Ireland`;
}

export type GeocodeResult = {
  latitude: number;
  longitude: number;
  displayName: string | null;
};

/**
 * Look up one address. Returns null when Nominatim has no result; throws when the service
 * fails (so the job records a failed source rather than "not found").
 */
export async function geocode(
  query: string,
  fetcher: Fetcher,
): Promise<GeocodeResult | null> {
  const url = new URL(NOMINATIM_SEARCH);
  url.searchParams.set("format", "jsonv2");
  url.searchParams.set("countrycodes", "ie");
  url.searchParams.set("limit", "1");
  url.searchParams.set("q", query);
  const response = await fetcher(url.toString(), {
    headers: { accept: "application/json" },
  });
  if (response.status !== 200) {
    throw new Error(`Nominatim returned HTTP ${response.status}`);
  }
  let results: unknown;
  try {
    results = JSON.parse(response.text);
  } catch {
    throw new Error("Nominatim returned something that isn't JSON");
  }
  if (!Array.isArray(results)) throw new Error("Unexpected Nominatim response");
  const first = results[0] as
    { lat?: string; lon?: string; display_name?: string } | undefined;
  if (!first) return null;
  const latitude = Number(first.lat);
  const longitude = Number(first.lon);
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return null;
  return {
    latitude: Math.round(latitude * 1e6) / 1e6,
    longitude: Math.round(longitude * 1e6) / 1e6,
    displayName: first.display_name ?? null,
  };
}
