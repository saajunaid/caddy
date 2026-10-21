// When to look a location up again. Pure; unit-tested.
import { roundCoord, type Anchor } from "./geo.ts";
import type { ExternalSource } from "./types.ts";

const DAY_MS = 86_400_000;

/**
 * How often each source is searched again. Google's terms allow caching its place fields for
 * 30 days, so Google is refreshed a little sooner so nothing pinned expires first.
 */
export const REFRESH_DAYS: Record<ExternalSource, number> = {
  osm: 30,
  google: 25,
  official: 30,
};

/** After a failed attempt, the scheduled job waits this long before trying the same place again. */
export const FAILURE_BACKOFF_MS = 20 * 60 * 60 * 1000;

export type SearchState = {
  status: "ok" | "failed" | "skipped";
  searchedAt: string;
  lastSuccessAt: string | null;
};

/** Whether this source should be searched again for a location. */
export function isSearchDue(
  search: SearchState | null,
  source: ExternalSource,
  now: Date,
): boolean {
  if (!search) return true;
  const sinceAttempt = now.getTime() - new Date(search.searchedAt).getTime();
  if (search.status === "failed" && sinceAttempt < FAILURE_BACKOFF_MS) {
    return false;
  }
  if (!search.lastSuccessAt) return true;
  const sinceSuccess = now.getTime() - new Date(search.lastSuccessAt).getTime();
  return sinceSuccess >= REFRESH_DAYS[source] * DAY_MS;
}

/** Rounded location (~100 m) used to share searches between nearby anchors. */
export function searchCell(anchor: Pick<Anchor, "latitude" | "longitude">): {
  latitude: number;
  longitude: number;
  key: string;
} {
  const latitude = roundCoord(anchor.latitude);
  const longitude = roundCoord(anchor.longitude);
  return {
    latitude,
    longitude,
    key: `${latitude.toFixed(3)},${longitude.toFixed(3)}`,
  };
}

/**
 * Anchors the scheduled job should look up now: those with a due source, one per ~100 m cell,
 * never-searched first, then the longest since a successful search; at most `cap`.
 */
export function selectDueAnchors(
  anchors: readonly Anchor[],
  searches: ReadonlyMap<string, SearchState>,
  sources: readonly ExternalSource[],
  now: Date,
  cap: number,
): { anchor: Anchor; due: ExternalSource[] }[] {
  const seen = new Set<string>();
  const due: { anchor: Anchor; due: ExternalSource[]; lastOk: number }[] = [];
  for (const anchor of anchors) {
    const cell = searchCell(anchor).key;
    if (seen.has(cell)) continue;
    seen.add(cell);
    const dueSources = sources.filter((source) =>
      isSearchDue(searches.get(`${source}:${cell}`) ?? null, source, now),
    );
    if (dueSources.length === 0) continue;
    const lastOk = Math.min(
      ...sources.map((source) => {
        const s = searches.get(`${source}:${cell}`)?.lastSuccessAt;
        return s ? new Date(s).getTime() : 0;
      }),
    );
    due.push({ anchor, due: dueSources, lastOk });
  }
  return due
    .sort((a, b) => a.lastOk - b.lastOk)
    .slice(0, Math.max(0, cap))
    .map(({ anchor, due: d }) => ({ anchor, due: d }));
}
