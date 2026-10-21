// Look up nearby places for one location with every enabled source, store them and log the search.
// Shared by the scheduled job and the on-demand button. Runs in plain Node and in the app.
import type { Anchor } from "./geo.ts";
import { GOOGLE_CACHE_DAYS, GOOGLE_QUERIES, searchGoogle } from "./google.ts";
import { fetchOverpass, type AdapterResult } from "./overpass.ts";
import { recordSearch, upsertCandidates, type Admin } from "./store.ts";
import type { ExternalSource } from "./types.ts";

export type SourceOutcome = {
  /** Ledger name, e.g. "overpass" or "google:halal". */
  source: string;
  status: "ok" | "failed" | "skipped";
  url?: string;
  httpStatus?: number;
  itemsSeen?: number;
  error?: string;
  busy?: boolean;
};

export type LookupDeps = {
  fetch?: typeof fetch;
  /** Google Places key; Google is skipped without one. */
  googleApiKey?: string | null;
  /** Shared across a run so the job never exceeds its Google call cap. */
  googleBudget?: { remaining: number };
  overpassTimeoutMs?: number;
  overpassMirrors?: readonly string[];
  sleep?: (ms: number) => Promise<void>;
  now?: Date;
};

function outcome(source: string, result: AdapterResult): SourceOutcome {
  return {
    source,
    status: result.status,
    url: result.url,
    httpStatus: result.httpStatus,
    itemsSeen: result.itemsSeen,
    error: result.error,
    busy: result.busy,
  };
}

/** Run the given sources for one anchor. Never throws for a source failure; returns outcomes. */
export async function lookupAnchor(
  admin: Admin,
  anchor: Anchor,
  sources: readonly ExternalSource[],
  deps: LookupDeps = {},
): Promise<SourceOutcome[]> {
  const now = deps.now ?? new Date();
  const outcomes: SourceOutcome[] = [];

  if (sources.includes("osm")) {
    const result = await fetchOverpass(anchor, {
      fetch: deps.fetch,
      mirrors: deps.overpassMirrors,
      timeoutMs: deps.overpassTimeoutMs,
      sleep: deps.sleep,
    });
    if (result.status === "ok") {
      await upsertCandidates(admin, result.candidates, now);
    }
    await recordSearch(admin, anchor, "osm", result, now);
    outcomes.push(outcome("overpass", result));
  }

  if (sources.includes("google")) {
    if (!deps.googleApiKey) {
      outcomes.push({
        source: "google",
        status: "skipped",
        error: "GOOGLE_PLACES_API_KEY not set",
      });
    } else {
      const results: AdapterResult[] = [];
      for (const query of GOOGLE_QUERIES) {
        if (deps.googleBudget && deps.googleBudget.remaining <= 0) {
          outcomes.push({
            source: `google:${query.category}`,
            status: "skipped",
            error: "Google call cap for this run reached",
          });
          continue;
        }
        if (deps.googleBudget) deps.googleBudget.remaining -= 1;
        const result = await searchGoogle(anchor, query, {
          apiKey: deps.googleApiKey,
          fetch: deps.fetch,
        });
        if (result.status === "ok") {
          await upsertCandidates(
            admin,
            result.candidates,
            now,
            GOOGLE_CACHE_DAYS,
          );
        }
        results.push(result);
        outcomes.push(outcome(`google:${query.category}`, result));
      }
      if (results.length === GOOGLE_QUERIES.length) {
        const failed = results.find((r) => r.status === "failed");
        await recordSearch(
          admin,
          anchor,
          "google",
          failed
            ? { status: "failed", error: failed.error }
            : {
                status: "ok",
                itemsSeen: results.reduce((n, r) => n + (r.itemsSeen ?? 0), 0),
              },
          now,
        );
      }
    }
  }
  return outcomes;
}
