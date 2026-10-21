// OpenStreetMap via the Overpass API: one combined query per location, with mirror fallback.
// Runs in plain Node (GitHub Actions) and in the app: relative .ts imports, no Next.js APIs.
import { z } from "zod";
import { categoryDef, type CategoryKey } from "./categories.ts";
import { classifyOsm, osmAddress, osmDetails, osmName } from "./classify.ts";
import type { LatLon } from "./geo.ts";
import type { PlaceCandidate } from "./types.ts";

export const OVERPASS_MIRRORS = [
  "https://overpass-api.de/api/interpreter",
  "https://overpass.kumi.systems/api/interpreter",
  "https://overpass.private.coffee/api/interpreter",
] as const;

export const USER_AGENT =
  "Caddy/1.0 (private household app; +https://caddy-beryl.vercel.app)";

/** Per-request timeout, matching the query's own [timeout:25]. */
export const OVERPASS_TIMEOUT_MS = 25_000;

/**
 * Searches reach a little past each category's radius, because results are shared by every
 * home in the same ~100 m cell.
 */
export const SEARCH_MARGIN_M = 150;

const coord = (n: number) => n.toFixed(6);

/** The Overpass QL query covering every category around one point. */
export function buildOverpassQuery(center: LatLon): string {
  const around = (key: CategoryKey) =>
    `(around:${categoryDef(key).radiusM + SEARCH_MARGIN_M},${coord(center.latitude)},${coord(center.longitude)})`;
  // Unknown-level schools show under both Primary and Secondary, so use the wider radius.
  const school = `(around:${Math.max(categoryDef("primary").radiusM, categoryDef("secondary").radiusM) + SEARCH_MARGIN_M},${coord(center.latitude)},${coord(center.longitude)})`;
  return [
    "[out:json][timeout:25];",
    "(",
    `  nwr["amenity"~"^(kindergarten|childcare)$"]${around("childcare")};`,
    `  nwr["amenity"="school"]${school};`,
    `  nwr["amenity"~"^(university|college)$"]${around("higher")};`,
    `  node["highway"="bus_stop"]${around("bus")};`,
    `  node["public_transport"="platform"]["bus"="yes"]${around("bus")};`,
    `  nwr["amenity"="place_of_worship"]["religion"="muslim"]${around("mosque")};`,
    `  nwr["diet:halal"~"^(yes|only)$"]${around("halal")};`,
    `  nwr["cuisine"~"halal",i]${around("halal")};`,
    `  nwr["amenity"~"^(restaurant|fast_food|cafe|food_court)$"]["name"~"halal",i]${around("halal")};`,
    `  nwr["shop"]["name"~"halal",i]${around("halal")};`,
    ");",
    "out tags center;",
  ].join("\n");
}

const elementSchema = z.object({
  type: z.enum(["node", "way", "relation"]),
  id: z.number().int(),
  lat: z.number().optional(),
  lon: z.number().optional(),
  center: z.object({ lat: z.number(), lon: z.number() }).optional(),
  tags: z.record(z.string(), z.string()).optional(),
});

const responseSchema = z.object({
  elements: z.array(z.unknown()),
  remark: z.string().optional(),
});

export type ParsedOverpass = {
  candidates: PlaceCandidate[];
  /** Elements in the response, before classification. */
  elements: number;
  /** Overpass's own error message (it can answer 200 with a "runtime error" remark). */
  remark?: string;
};

/** Turn an Overpass JSON response into place candidates. Throws if it isn't Overpass JSON. */
export function parseOverpass(json: unknown): ParsedOverpass {
  const response = responseSchema.parse(json);
  const candidates: PlaceCandidate[] = [];
  const seen = new Set<string>();
  for (const raw of response.elements) {
    const element = elementSchema.safeParse(raw);
    if (!element.success) continue;
    const { type, id, tags = {} } = element.data;
    const latitude = element.data.lat ?? element.data.center?.lat;
    const longitude = element.data.lon ?? element.data.center?.lon;
    if (latitude === undefined || longitude === undefined) continue;
    const category = classifyOsm(tags);
    if (!category) continue;
    const sourceId = `${type}/${id}`;
    if (seen.has(sourceId)) continue;
    seen.add(sourceId);
    candidates.push({
      source: "osm",
      sourceId,
      category,
      name: osmName(tags, category),
      latitude,
      longitude,
      address: osmAddress(tags),
      details: osmDetails(tags, category),
    });
  }
  return {
    candidates,
    elements: response.elements.length,
    remark: response.remark,
  };
}

export type AdapterResult = {
  status: "ok" | "failed";
  url?: string;
  httpStatus?: number;
  candidates: PlaceCandidate[];
  itemsSeen?: number;
  error?: string;
  /** The service was overloaded or rate-limited rather than broken. */
  busy?: boolean;
};

export type OverpassOptions = {
  fetch?: typeof fetch;
  mirrors?: readonly string[];
  timeoutMs?: number;
  /** Pause between mirror attempts (politeness); defaults to 1 s. */
  sleep?: (ms: number) => Promise<void>;
};

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

function isBusyRemark(remark: string): boolean {
  return /timed? ?out|too many|rate_limited|load|dispatcher/i.test(remark);
}

/** Query each mirror in turn until one answers with usable data. */
export async function fetchOverpass(
  center: LatLon,
  options: OverpassOptions = {},
): Promise<AdapterResult> {
  const doFetch = options.fetch ?? fetch;
  const mirrors = options.mirrors ?? OVERPASS_MIRRORS;
  const sleep = options.sleep ?? wait;
  const body = new URLSearchParams({ data: buildOverpassQuery(center) });
  let last: AdapterResult = {
    status: "failed",
    candidates: [],
    error: "No Overpass mirror configured",
  };
  for (const [index, url] of mirrors.entries()) {
    if (index > 0) await sleep(1000);
    try {
      const response = await doFetch(url, {
        method: "POST",
        headers: {
          "content-type": "application/x-www-form-urlencoded",
          accept: "application/json",
          "user-agent": USER_AGENT,
        },
        body: body.toString(),
        signal: AbortSignal.timeout(options.timeoutMs ?? OVERPASS_TIMEOUT_MS),
      });
      if (!response.ok) {
        last = {
          status: "failed",
          url,
          httpStatus: response.status,
          candidates: [],
          error: `HTTP ${response.status}`,
          busy: response.status === 429 || response.status >= 500,
        };
        continue;
      }
      const parsed = parseOverpass(await response.json());
      if (parsed.remark && /error/i.test(parsed.remark)) {
        last = {
          status: "failed",
          url,
          httpStatus: response.status,
          candidates: [],
          itemsSeen: parsed.elements,
          error: parsed.remark.slice(0, 300),
          busy: isBusyRemark(parsed.remark),
        };
        continue;
      }
      if (parsed.candidates.length === 0) {
        // Every Irish location has some bus stop, school or college within 10 km, so an empty
        // answer means the mirror is broken or stale; never report it as "nothing nearby".
        last = {
          status: "failed",
          url,
          httpStatus: response.status,
          candidates: [],
          itemsSeen: parsed.elements,
          error: `Overpass answered but returned no places (${parsed.elements} elements)`,
        };
        continue;
      }
      return {
        status: "ok",
        url,
        httpStatus: response.status,
        candidates: parsed.candidates,
        itemsSeen: parsed.candidates.length,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const timedOut =
        error instanceof Error && /abort|timeout/i.test(error.name + message);
      last = {
        status: "failed",
        url,
        candidates: [],
        error: timedOut ? "Timed out" : message.slice(0, 300),
        busy: timedOut,
      };
    }
  }
  return last;
}
