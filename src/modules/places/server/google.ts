// Google Places (New) Text Search adapter: the main source for every nearby category.
// Enabled when GOOGLE_PLACES_API_KEY is set (otherwise lookups fall back to OpenStreetMap). Runs in plain Node and in the app.
import { z } from "zod";
import { categoryDef, type CategoryKey } from "./categories.ts";
import { haversineM, type LatLon } from "./geo.ts";
import type { AdapterResult } from "./overpass.ts";
import type { PlaceCandidate } from "./types.ts";

export const GOOGLE_SEARCH_URL =
  "https://places.googleapis.com/v1/places:searchText";

/**
 * Only Pro-tier fields. Asking for rating, reviews or userRatingCount would bill every call at
 * the Enterprise rate (1,000 free calls a month instead of 5,000), so never add them.
 */
export const GOOGLE_FIELD_MASK =
  "places.id,places.displayName,places.location,places.formattedAddress,places.googleMapsUri";

export type GoogleQuery = {
  category: CategoryKey;
  textQuery: string;
  /** Places (New) type; with strict filtering only places of this type come back. */
  includedType?: string;
  strict?: boolean;
};

/** One Text Search per category (7 calls per location). Public OpenStreetMap mirrors timed out
 * from GitHub Actions in Oct 2026, so Google is the default source (PLAN D27). */
export const GOOGLE_QUERIES: readonly GoogleQuery[] = [
  { category: "childcare", textQuery: "creche preschool childcare" },
  {
    category: "primary",
    textQuery: "primary school",
    includedType: "primary_school",
    strict: true,
  },
  {
    category: "secondary",
    textQuery: "secondary school",
    includedType: "secondary_school",
    strict: true,
  },
  {
    category: "higher",
    textQuery: "university college",
    includedType: "university",
  },
  {
    category: "bus",
    textQuery: "bus stop",
    includedType: "bus_stop",
    strict: true,
  },
  {
    category: "mosque",
    textQuery: "mosque",
    includedType: "mosque",
    strict: true,
  },
  { category: "halal", textQuery: "halal restaurant" },
];

/** Hard cap on Google calls per scheduled run (keeps the monthly free allowance safe). */
export const GOOGLE_MAX_CALLS_PER_RUN = 70;

/** Google's terms: place ids may be kept; other fields must be refreshed within 30 days. */
export const GOOGLE_CACHE_DAYS = 30;

export function googleApiKeyFromEnv(
  env: Record<string, string | undefined> = process.env,
): string | null {
  const key = env.GOOGLE_PLACES_API_KEY?.trim();
  return key ? key : null;
}

const placeSchema = z.object({
  id: z.string().min(1).max(200),
  displayName: z.object({ text: z.string().min(1) }).optional(),
  location: z.object({ latitude: z.number(), longitude: z.number() }),
  formattedAddress: z.string().optional(),
  googleMapsUri: z.string().optional(),
});
const responseSchema = z.object({ places: z.array(z.unknown()).optional() });

/** Parse a searchText response, keeping places within the category radius (plus margin). */
export function parseGoogle(
  json: unknown,
  center: LatLon,
  category: CategoryKey,
  textQuery: string,
): { candidates: PlaceCandidate[]; parsed: number } {
  const { places = [] } = responseSchema.parse(json);
  const maxM = categoryDef(category).radiusM + 500;
  let parsed = 0;
  const candidates: PlaceCandidate[] = [];
  for (const raw of places) {
    const result = placeSchema.safeParse(raw);
    if (!result.success || !result.data.displayName) continue;
    parsed += 1;
    const p = result.data;
    const point = {
      latitude: p.location.latitude,
      longitude: p.location.longitude,
    };
    if (haversineM(center, point) > maxM) continue;
    candidates.push({
      source: "google",
      sourceId: p.id,
      category,
      name: p.displayName!.text.slice(0, 200),
      ...point,
      address: p.formattedAddress?.slice(0, 300) ?? null,
      details: {
        kind: `Google search match: “${textQuery}”`,
        ...(p.googleMapsUri?.startsWith("https://")
          ? { mapsUrl: p.googleMapsUri.slice(0, 300) }
          : {}),
      },
    });
  }
  return { candidates, parsed };
}

export type GoogleOptions = {
  apiKey: string;
  fetch?: typeof fetch;
  timeoutMs?: number;
};

/** One Text Search call biased to a circle around the location. */
export async function searchGoogle(
  center: LatLon,
  query: GoogleQuery,
  options: GoogleOptions,
): Promise<AdapterResult> {
  const doFetch = options.fetch ?? fetch;
  try {
    const response = await doFetch(GOOGLE_SEARCH_URL, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-goog-api-key": options.apiKey,
        "x-goog-fieldmask": GOOGLE_FIELD_MASK,
      },
      body: JSON.stringify({
        textQuery: query.textQuery,
        ...(query.includedType
          ? {
              includedType: query.includedType,
              strictTypeFiltering: Boolean(query.strict),
            }
          : {}),
        pageSize: 20,
        regionCode: "IE",
        locationBias: {
          circle: {
            center: { latitude: center.latitude, longitude: center.longitude },
            radius: categoryDef(query.category).radiusM,
          },
        },
      }),
      signal: AbortSignal.timeout(options.timeoutMs ?? 15_000),
    });
    if (!response.ok) {
      return {
        status: "failed",
        url: GOOGLE_SEARCH_URL,
        httpStatus: response.status,
        candidates: [],
        // Google error bodies can echo request details; keep only the status.
        error: `HTTP ${response.status}`,
        busy: response.status === 429,
      };
    }
    const { candidates, parsed } = parseGoogle(
      await response.json(),
      center,
      query.category,
      query.textQuery,
    );
    if (parsed === 0) {
      // A biased text search always returns something somewhere in Ireland; none means trouble.
      return {
        status: "failed",
        url: GOOGLE_SEARCH_URL,
        httpStatus: response.status,
        candidates: [],
        itemsSeen: 0,
        error: "Google answered but returned no places",
      };
    }
    return {
      status: "ok",
      url: GOOGLE_SEARCH_URL,
      httpStatus: response.status,
      candidates,
      itemsSeen: candidates.length,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      status: "failed",
      url: GOOGLE_SEARCH_URL,
      candidates: [],
      error: message.replaceAll(options.apiKey, "[key]").slice(0, 300),
    };
  }
}
