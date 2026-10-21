// Writes to the global places cache and search log. Service-role client only.
// Runs in plain Node and in the app: relative .ts imports, no Next.js APIs.
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "../../../lib/supabase/database.types.ts";
import { CATEGORIES_VERSION } from "./categories.ts";
import { searchCell, type SearchState } from "./refresh.ts";
import type { Anchor } from "./geo.ts";
import type { ExternalSource, PlaceCandidate } from "./types.ts";

export type Admin = SupabaseClient<Database>;

const DAY_MS = 86_400_000;
const CHUNK = 500;

/** Insert or refresh cached places. Only ever touches source rows, never user places or marks. */
export async function upsertCandidates(
  admin: Admin,
  candidates: readonly PlaceCandidate[],
  now: Date,
  cacheDays = 30,
): Promise<number> {
  const byKey = new Map<string, PlaceCandidate>();
  for (const c of candidates) byKey.set(`${c.source}:${c.sourceId}`, c);
  const rows = [...byKey.values()].map((c) => ({
    household_id: null,
    source: c.source,
    source_id: c.sourceId,
    category: c.category,
    name: c.name,
    latitude: c.latitude,
    longitude: c.longitude,
    address: c.address,
    details: c.details,
    fetched_at: now.toISOString(),
    refresh_after: new Date(now.getTime() + cacheDays * DAY_MS).toISOString(),
  }));
  for (let i = 0; i < rows.length; i += CHUNK) {
    const { error } = await admin
      .from("places")
      .upsert(rows.slice(i, i + CHUNK), { onConflict: "source,source_id" });
    if (error) throw new Error(`Couldn't save places: ${error.message}`);
  }
  return rows.length;
}

/** Record a search attempt for the anchor's ~100 m cell. A failure keeps the last success date. */
export async function recordSearch(
  admin: Admin,
  anchor: Anchor,
  source: ExternalSource,
  outcome: { status: "ok" | "failed"; itemsSeen?: number; error?: string },
  now: Date,
): Promise<void> {
  const cell = searchCell(anchor);
  const row = {
    anchor_key: anchor.key.slice(0, 200),
    latitude: cell.latitude,
    longitude: cell.longitude,
    categories_version: CATEGORIES_VERSION,
    source,
    status: outcome.status,
    items_seen: outcome.itemsSeen ?? null,
    error: outcome.error ? outcome.error.slice(0, 500) : null,
    searched_at: now.toISOString(),
    ...(outcome.status === "ok" ? { last_success_at: now.toISOString() } : {}),
  };
  const { error } = await admin.from("place_searches").upsert(row, {
    onConflict: "source,latitude,longitude,categories_version",
  });
  if (error) throw new Error(`Couldn't record search: ${error.message}`);
}

/** Every search for the current category version, keyed "source:lat,lon". */
export async function loadSearches(
  client: SupabaseClient<Database>,
): Promise<Map<string, SearchState>> {
  const { data, error } = await client
    .from("place_searches")
    .select("source, latitude, longitude, status, searched_at, last_success_at")
    .eq("categories_version", CATEGORIES_VERSION)
    .limit(10_000);
  if (error) throw new Error(`Couldn't load searches: ${error.message}`);
  const map = new Map<string, SearchState>();
  for (const row of data) {
    const cell = searchCell({
      latitude: Number(row.latitude),
      longitude: Number(row.longitude),
    });
    map.set(`${row.source}:${cell.key}`, {
      status: row.status as SearchState["status"],
      searchedAt: row.searched_at,
      lastSuccessAt: row.last_success_at,
    });
  }
  return map;
}

/** Delete Google rows whose 30-day cache window has passed (Google's caching terms). */
export async function purgeExpiredGoogle(
  admin: Admin,
  now: Date,
): Promise<number> {
  const { data, error } = await admin
    .from("places")
    .delete()
    .eq("source", "google")
    .lt("refresh_after", now.toISOString())
    .select("id");
  if (error)
    throw new Error(`Couldn't purge expired Google places: ${error.message}`);
  return data.length;
}
