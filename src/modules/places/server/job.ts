// Scheduled job "places-refresh": look up nearby places for homes not searched in 30 days.
// Imported by the job registry: relative .ts imports, no Next.js APIs.
import type { SupabaseClient } from "@supabase/supabase-js";
import { dublinDate } from "../../../server/domain/dates.ts";
import type { JobDefinition } from "../../../server/jobs/registry.ts";
import { anchorsFromHousing, type AnchorSource } from "./anchors.ts";
import { GOOGLE_MAX_CALLS_PER_RUN, googleApiKeyFromEnv } from "./google.ts";
import { activeSources } from "./sources.ts";
import { lookupAnchor } from "./lookup.ts";
import { selectDueAnchors } from "./refresh.ts";
import { loadSearches, purgeExpiredGoogle } from "./store.ts";
import type { ExternalSource } from "./types.ts";

/** At most this many homes per run, so one run stays polite and short. */
export const MAX_ANCHORS_PER_RUN = 15;

export type PlacesJobDeps = {
  anchors?: AnchorSource;
  fetch?: typeof fetch;
  /** Defaults to GOOGLE_PLACES_API_KEY from the environment at run time. */
  googleApiKey?: () => string | null;
  sleep?: (ms: number) => Promise<void>;
  overpassMirrors?: readonly string[];
};

const wait = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

export function createPlacesRefreshJob(
  deps: PlacesJobDeps = {},
): JobDefinition {
  const anchorSource = deps.anchors ?? anchorsFromHousing;
  const sleep = deps.sleep ?? wait;
  return {
    type: "places-refresh",
    group: "daily",
    description:
      "Looks up childcare, schools, colleges, bus stops, mosques and halal food near each home",
    idempotencyKey: (now) => `places-refresh:${dublinDate(now)}`,
    async run(ctx, admin) {
      const anchors = await anchorSource(admin as unknown as SupabaseClient);
      const googleApiKey = (deps.googleApiKey ?? googleApiKeyFromEnv)();
      const sources: ExternalSource[] = activeSources(googleApiKey);
      const searches = await loadSearches(admin);
      const due = selectDueAnchors(
        anchors,
        searches,
        sources,
        ctx.now,
        MAX_ANCHORS_PER_RUN,
      );

      const googleBudget = { remaining: GOOGLE_MAX_CALLS_PER_RUN };
      let looked = 0;
      let failed = 0;
      for (const [index, { anchor, due: dueSources }] of due.entries()) {
        // Overpass etiquette: at least a second between calls.
        if (index > 0) await sleep(1000);
        const outcomes = await lookupAnchor(admin, anchor, dueSources, {
          fetch: deps.fetch,
          googleApiKey,
          googleBudget,
          sleep,
          overpassMirrors: deps.overpassMirrors,
          now: ctx.now,
        });
        looked += 1;
        for (const o of outcomes) {
          if (o.status === "failed") failed += 1;
          await ctx.recordSource({
            source: `${o.source} · ${anchor.key}`,
            url: o.url,
            status: o.status,
            httpStatus: o.httpStatus,
            itemsSeen: o.itemsSeen,
            error: o.error,
          });
        }
      }

      if (due.length === 0) {
        await ctx.recordSource({
          source: "overpass",
          status: "skipped",
          error: "No home is due a lookup",
        });
      }

      const purged = await purgeExpiredGoogle(admin, ctx.now);
      ctx.setStats({
        anchors: anchors.length,
        due: due.length,
        lookedUp: looked,
        failedSources: failed,
        googleCallsLeft: googleBudget.remaining,
        googleEnabled: Boolean(googleApiKey),
        purgedGoogle: purged,
      });
      ctx.setSummary(
        due.length === 0
          ? `All ${anchors.length} homes up to date`
          : `Looked up ${looked} of ${anchors.length} homes${failed ? ` · ${failed} source checks failed` : ""}`,
      );
    },
  };
}

export const placesRefreshJob = createPlacesRefreshJob();
