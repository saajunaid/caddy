import "server-only";
import { z } from "zod";
import { isInIreland } from "./server/geo";
import { USER_AGENT } from "./server/overpass";

/**
 * Address / Eircode search with OpenStreetMap's Nominatim. Usage policy: one request per user
 * action (no autocomplete), an identifying User-Agent, and cached results.
 */
export const NOMINATIM_URL = "https://nominatim.openstreetmap.org/search";

export type GeocodeResult = {
  latitude: number;
  longitude: number;
  label: string;
  /** True when Nominatim only matched an area (e.g. an Eircode routing key), not an address. */
  approximate: boolean;
};

export class GeocodeError extends Error {}

/** Irish Eircode, e.g. "V94 T9PX" or "D6W XY12". */
export const EIRCODE =
  /^(?:[ac-fhknprtv-y]\d{2}|d6w)\s?[0-9ac-fhknprtv-y]{4}$/i;

const resultSchema = z.array(
  z.object({
    lat: z.string(),
    lon: z.string(),
    display_name: z.string(),
    addresstype: z.string().optional(),
    type: z.string().optional(),
  }),
);

const AREA_TYPES = new Set([
  "postcode",
  "county",
  "state",
  "city",
  "town",
  "municipality",
  "region",
  "country",
]);

/** Find a place on the island of Ireland. Null when nothing matches; throws when Nominatim fails. */
export async function geocode(query: string): Promise<GeocodeResult | null> {
  const q = query.trim().replace(/\s+/g, " ").slice(0, 200);
  if (q.length < 3) return null;
  const url = new URL(NOMINATIM_URL);
  url.searchParams.set("q", q);
  url.searchParams.set("format", "jsonv2");
  url.searchParams.set("limit", "1");
  url.searchParams.set("countrycodes", "ie,gb");
  let response: Response;
  try {
    response = await fetch(url, {
      headers: { "user-agent": USER_AGENT, "accept-language": "en-IE,en" },
      // Same query, same answer: cache for a week (Nominatim asks clients to cache).
      cache: "force-cache",
      next: { revalidate: 7 * 24 * 3600 },
      signal: AbortSignal.timeout(10_000),
    });
  } catch {
    throw new GeocodeError(
      "The address search (OpenStreetMap) didn't answer. Try again in a minute.",
    );
  }
  if (!response.ok) {
    throw new GeocodeError(
      response.status === 429
        ? "The address search is busy. Try again in a minute."
        : `The address search failed (HTTP ${response.status}).`,
    );
  }
  const parsed = resultSchema.safeParse(await response.json());
  if (!parsed.success) {
    throw new GeocodeError("The address search answered in an unexpected way.");
  }
  const first = parsed.data[0];
  if (!first) return null;
  const point = { latitude: Number(first.lat), longitude: Number(first.lon) };
  if (!isInIreland(point)) return null;
  return {
    ...point,
    label: first.display_name.slice(0, 200),
    approximate: AREA_TYPES.has(first.addresstype ?? first.type ?? ""),
  };
}
