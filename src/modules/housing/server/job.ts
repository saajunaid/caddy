// The "housing-daily" job: crawl newstarterhomes.ie, record every listing and change,
// geocode new listings and alert the household about matches. PLAN §7.1.
// Runs in GitHub Actions under plain Node: relative .ts imports, no Next.js APIs.
import type { Json } from "../../../lib/supabase/database.types.ts";
import { dublinDate } from "../../../server/domain/dates.ts";
import type { JobDefinition } from "../../../server/jobs/registry.ts";
import type { JobContext } from "../../../server/jobs/runner.ts";
import type { NewNotification } from "../../../server/notifications/notify.ts";
import { alertsFor, failureAlert, type HousingAlert } from "./alerts.ts";
import { geocode, geocodeQuery } from "./geocode.ts";
import { politeFetcher, type Fetcher } from "./http.ts";
import {
  CALENDAR_URL,
  INDEX_URL,
  listingUrl,
  parseCalendarPage,
  parseIndexPage,
  parseListingPage,
} from "./parser.ts";
import { buildSnapshot } from "./snapshot.ts";
import { supabaseHousingStore, type HousingStore } from "./store.ts";
import type {
  CalendarDates,
  IndexCard,
  MatchLevel,
  UnitType,
} from "./types.ts";
import {
  buildListingChange,
  missingUpdate,
  needsDetailFetch,
  type ExistingListing,
  type ListingChange,
} from "./upsert.ts";

export const HOUSING_JOB_TYPE = "housing-daily";
const MAX_INDEX_PAGES = 60;
const BATCH_SIZE = 25;
const MAX_GEOCODES_PER_RUN = 25;

export type HousingJobContext = Pick<
  JobContext,
  "runId" | "now" | "recordSource" | "setSummary" | "setStats"
>;

export type HousingJobDeps = {
  store: HousingStore;
  /** Fetches newstarterhomes.ie pages. */
  fetcher: Fetcher;
  /** Fetches Nominatim. Separate so each service gets its own polite rate. */
  geocodeFetcher: Fetcher;
  maxGeocodes?: number;
};

export type HousingRunResult = {
  listings: number;
  fetched: number;
  newListings: number;
  changed: number;
  activeMatches: number;
  alerts: number;
  discoveryComplete: boolean;
};

class SanityError extends Error {}

type Discovery = {
  cards: Map<string, IndexCard>;
  slugs: Set<string>;
  calendar: CalendarDates;
  complete: boolean;
  pages: number;
  reportedTotal: number | null;
};

async function discover(
  ctx: HousingJobContext,
  fetcher: Fetcher,
): Promise<Discovery> {
  const cards = new Map<string, IndexCard>();
  let url: string | null = INDEX_URL;
  let pages = 0;
  let complete = true;
  let reportedTotal: number | null = null;
  const visited = new Set<string>();

  while (url && pages < MAX_INDEX_PAGES && !visited.has(url)) {
    visited.add(url);
    pages += 1;
    const source = "newstarterhomes.ie list";
    let status: number | undefined;
    let html: string;
    try {
      const response = await fetcher(url);
      status = response.status;
      html = response.text;
    } catch (error) {
      await ctx.recordSource({
        source,
        url,
        status: "failed",
        error: (error as Error).message,
      });
      if (pages === 1)
        throw new SanityError(
          `newstarterhomes.ie is unreachable: ${(error as Error).message}`,
        );
      complete = false;
      break;
    }
    if (status !== 200) {
      await ctx.recordSource({
        source,
        url,
        status: "failed",
        httpStatus: status,
        error: `HTTP ${status}`,
      });
      if (pages === 1)
        throw new SanityError(`newstarterhomes.ie returned HTTP ${status}`);
      complete = false;
      break;
    }
    const page = parseIndexPage(html, url);
    if (
      page.cards.length === 0 &&
      pages > 1 &&
      reportedTotal !== null &&
      cards.size >= reportedTotal
    ) {
      // The site shows a "Next" link to an empty page when the total is an exact multiple of
      // its page size (204 = 17 × 12). Every listing it reported is already in hand, so this is
      // the end of the list, not a broken page.
      await ctx.recordSource({
        source,
        url,
        status: "ok",
        httpStatus: status,
        itemsSeen: 0,
      });
      url = null;
      break;
    }
    if (page.cards.length === 0) {
      // Sanity guard: a page that loads but yields no listings is a parser failure,
      // never "zero results".
      const error =
        "Page loaded but no listings could be read (layout may have changed)";
      await ctx.recordSource({
        source,
        url,
        status: "failed",
        httpStatus: status,
        itemsSeen: 0,
        error,
      });
      if (pages === 1)
        throw new SanityError(`Parser found no listings on ${url}`);
      complete = false;
      break;
    }
    await ctx.recordSource({
      source,
      url,
      status: "ok",
      httpStatus: status,
      itemsSeen: page.cards.length,
    });
    for (const card of page.cards) {
      if (!cards.has(card.externalId)) cards.set(card.externalId, card);
    }
    reportedTotal = page.total ?? reportedTotal;
    url = page.nextUrl;
  }
  if (url && complete) complete = false; // stopped early (page limit or a loop)
  if (reportedTotal !== null && cards.size < reportedTotal) complete = false;

  // The calendar view links every listing too: a cross-check if pagination ever breaks.
  const slugs = new Set(cards.keys());
  let calendar: CalendarDates = new Map();
  try {
    const response = await fetcher(CALENDAR_URL);
    if (response.status !== 200) {
      await ctx.recordSource({
        source: "newstarterhomes.ie calendar",
        url: CALENDAR_URL,
        status: "failed",
        httpStatus: response.status,
        error: `HTTP ${response.status}`,
      });
    } else {
      const parsed = parseCalendarPage(response.text);
      if (parsed.slugs.length === 0) {
        await ctx.recordSource({
          source: "newstarterhomes.ie calendar",
          url: CALENDAR_URL,
          status: "failed",
          httpStatus: 200,
          itemsSeen: 0,
          error: "Page loaded but no listings could be read",
        });
      } else {
        await ctx.recordSource({
          source: "newstarterhomes.ie calendar",
          url: CALENDAR_URL,
          status: "ok",
          httpStatus: 200,
          itemsSeen: parsed.slugs.length,
        });
        calendar = parsed.dates;
        for (const slug of parsed.slugs) slugs.add(slug);
      }
    }
  } catch (error) {
    await ctx.recordSource({
      source: "newstarterhomes.ie calendar",
      url: CALENDAR_URL,
      status: "failed",
      error: (error as Error).message,
    });
  }

  return { cards, slugs, calendar, complete, pages, reportedTotal };
}

type Fetched = {
  changes: ListingChange[];
  skippedIds: string[];
  fetched: number;
  gone: string[];
};

async function readListings(
  ctx: HousingJobContext,
  fetcher: Fetcher,
  discovery: Discovery,
  existing: Map<string, ExistingListing>,
  today: string,
): Promise<Fetched> {
  const changes: ListingChange[] = [];
  const skippedIds: string[] = [];
  const gone: string[] = [];
  const toFetch: string[] = [];
  for (const slug of [...discovery.slugs].sort()) {
    const card = discovery.cards.get(slug) ?? null;
    const known = existing.get(slug) ?? null;
    if (needsDetailFetch(card?.sourceStatus ?? "unknown", known, ctx.now)) {
      toFetch.push(slug);
    } else if (known) {
      skippedIds.push(known.id);
    }
  }

  for (let start = 0; start < toFetch.length; start += BATCH_SIZE) {
    const batch = toFetch.slice(start, start + BATCH_SIZE);
    const failures: string[] = [];
    let parsed = 0;
    for (const slug of batch) {
      const card = discovery.cards.get(slug) ?? null;
      const url = listingUrl(slug);
      try {
        const response = await fetcher(url);
        if (response.status === 404 && !card) {
          gone.push(slug); // only on the calendar, and the page no longer exists
          continue;
        }
        if (response.status !== 200) {
          failures.push(`${slug} (HTTP ${response.status})`);
          continue;
        }
        const page = parseListingPage(response.text);
        if (!page.title && page.unitTypes.length === 0 && !page.bedroomsText) {
          failures.push(`${slug} (nothing readable on the page)`);
          continue;
        }
        const snapshot = buildSnapshot({
          externalId: slug,
          card,
          page,
          calendar: discovery.calendar.get(slug) ?? null,
        });
        changes.push(
          buildListingChange(
            snapshot,
            existing.get(slug) ?? null,
            ctx.now,
            today,
          ),
        );
        parsed += 1;
      } catch (error) {
        failures.push(`${slug} (${(error as Error).message})`);
      }
    }
    await ctx.recordSource({
      source: `newstarterhomes.ie listings ${start + 1}–${start + batch.length}`,
      url: INDEX_URL,
      status: failures.length > 0 ? "failed" : "ok",
      itemsSeen: parsed,
      error:
        failures.length > 0
          ? `Couldn't read ${failures.length} of ${batch.length}: ${failures.join(", ")}`
          : undefined,
    });
  }
  return { changes, skippedIds, fetched: toFetch.length, gone };
}

type CurrentListing = {
  id: string;
  external_id: string;
  address_text: string | null;
  locality: string | null;
  county: string | null;
  latitude: number | null;
  geocode_query: string | null;
};

async function geocodeMissing(
  ctx: HousingJobContext,
  deps: HousingJobDeps,
  listings: CurrentListing[],
): Promise<number> {
  const limit = deps.maxGeocodes ?? MAX_GEOCODES_PER_RUN;
  const candidates = listings
    .map((l) => ({ listing: l, query: geocodeQuery(l) }))
    .filter(
      (c): c is { listing: CurrentListing; query: string } =>
        c.listing.latitude === null &&
        c.query !== null &&
        c.query !== c.listing.geocode_query,
    )
    .slice(0, limit);
  if (candidates.length === 0) {
    await ctx.recordSource({
      source: "Nominatim geocoding",
      status: "skipped",
      itemsSeen: 0,
    });
    return 0;
  }
  let found = 0;
  const errors: string[] = [];
  for (const { listing, query } of candidates) {
    try {
      const result = await geocode(query, deps.geocodeFetcher);
      const at = ctx.now.toISOString();
      await deps.store.updateListing(
        listing.id,
        result
          ? {
              latitude: result.latitude,
              longitude: result.longitude,
              geocode_source: "osm",
              geocode_query: query,
              geocoded_at: at,
            }
          : { geocode_query: query, geocoded_at: at }, // not found: don't ask again until the address changes
      );
      if (result) found += 1;
    } catch (error) {
      errors.push((error as Error).message);
    }
  }
  await ctx.recordSource({
    source: "Nominatim geocoding",
    url: "https://nominatim.openstreetmap.org/",
    status: errors.length === candidates.length ? "failed" : "ok",
    itemsSeen: found,
    error:
      errors.length > 0
        ? `${errors.length} of ${candidates.length} lookups failed: ${errors[0]}`
        : undefined,
  });
  return found;
}

function toNotifications(
  alerts: HousingAlert[],
  households: string[],
  runId: string,
): NewNotification[] {
  return households.flatMap((householdId) =>
    alerts.map((alert) => ({ householdId, ...alert, jobRunId: runId })),
  );
}

/** The whole daily pipeline, with I/O injected. */
export async function runHousingDaily(
  ctx: HousingJobContext,
  deps: HousingJobDeps,
): Promise<HousingRunResult> {
  const today = dublinDate(ctx.now);
  const nowIso = ctx.now.toISOString();

  let discovery: Discovery;
  try {
    discovery = await discover(ctx, deps.fetcher);
  } catch (error) {
    if (error instanceof SanityError) {
      ctx.setSummary(`Failed: ${error.message}`);
      const households = await deps.store.householdIds();
      await deps.store.notify(
        toNotifications(
          [failureAlert(today, error.message)],
          households,
          ctx.runId,
        ),
      );
    }
    throw error;
  }

  const existingRows = await deps.store.loadListings();
  const existing = new Map(existingRows.map((row) => [row.external_id, row]));
  const read = await readListings(
    ctx,
    deps.fetcher,
    discovery,
    existing,
    today,
  );

  // Save listings and history. Applications are never part of this.
  const ids = await deps.store.upsertListings(read.changes.map((c) => c.row));
  const observations = read.changes
    .filter((c) => c.observation)
    .map((c) => {
      const { external_id, ...rest } = c.observation!;
      const listingId = ids.get(external_id);
      if (!listingId) throw new Error(`Saved listing ${external_id} has no id`);
      return { ...rest, listing_id: listingId, job_run_id: ctx.runId };
    });
  await deps.store.insertObservations(observations);
  await deps.store.markSeen(read.skippedIds, nowIso);

  // Listings missing from a complete crawl: count the miss; never delete.
  let missing = 0;
  if (discovery.complete) {
    for (const row of existingRows) {
      if (
        discovery.slugs.has(row.external_id) &&
        !read.gone.includes(row.external_id)
      )
        continue;
      await deps.store.updateListing(row.id, missingUpdate(row, today));
      missing += 1;
    }
  }

  // Geocode listings without a map pin (new ones, or whose address changed).
  const current = new Map<string, CurrentListing>();
  for (const row of existingRows) {
    current.set(row.external_id, {
      id: row.id,
      external_id: row.external_id,
      address_text:
        (row.raw as { addressText?: string | null } | null)?.addressText ??
        null,
      locality:
        (row.raw as { locality?: string | null } | null)?.locality ?? null,
      county: (row.raw as { county?: string | null } | null)?.county ?? null,
      latitude: row.latitude,
      geocode_query: row.geocode_query,
    });
  }
  for (const change of read.changes) {
    current.set(change.row.external_id, {
      id: ids.get(change.row.external_id)!,
      external_id: change.row.external_id,
      address_text: change.row.address_text,
      locality: change.row.locality,
      county: change.row.county,
      latitude: change.row.latitude,
      geocode_query: change.row.geocode_query,
    });
  }
  const geocoded = await geocodeMissing(
    ctx,
    deps,
    [...current.values()].filter((l) => discovery.slugs.has(l.external_id)),
  );

  // Alerts for every household (the household chose all of Ireland).
  const alerts = read.changes.flatMap((change) =>
    alertsFor(
      {
        id: ids.get(change.row.external_id)!,
        external_id: change.row.external_id,
        title: change.row.title,
        locality: change.row.locality,
        county: change.row.county,
        status: change.row.status,
        matches: change.row.matches,
        closing_date: change.row.closing_date,
        min_matching_rent_cents: change.row.min_matching_rent_cents,
        unit_types: change.row.unit_types as unknown as UnitType[],
        bedrooms_text: change.row.bedrooms_text,
      },
      {
        isNew: change.isNew,
        previousStatus: change.previousStatus,
        previousMatches: change.previousMatches,
      },
      today,
    ),
  );
  const households = alerts.length > 0 ? await deps.store.householdIds() : [];
  const sent = await deps.store.notify(
    toNotifications(alerts, households, ctx.runId),
  );

  // Summary over every listing on the site today.
  const statusBySlug = new Map<
    string,
    { status: string; matches: MatchLevel | string }
  >();
  for (const row of existingRows)
    statusBySlug.set(row.external_id, {
      status: row.status,
      matches: row.matches,
    });
  for (const change of read.changes)
    statusBySlug.set(change.row.external_id, {
      status: change.row.status,
      matches: change.row.matches,
    });
  const active = [...discovery.slugs]
    .map((slug) => statusBySlug.get(slug))
    .filter(
      (l) => l && ["open", "closing_soon", "coming_soon"].includes(l.status),
    );
  const activeMatches = active.filter((l) => l!.matches !== "none").length;
  const newListings = read.changes.filter((c) => c.isNew).length;
  const changed = read.changes.filter((c) => c.observation && !c.isNew).length;
  const listings = discovery.slugs.size - read.gone.length;

  const parts = [
    `${listings} listings checked`,
    `${activeMatches} match`,
    `${newListings} new`,
  ];
  if (!discovery.complete) parts.push("list incomplete");
  ctx.setSummary(parts.join(" · "));
  const stats: Record<string, Json> = {
    listings,
    open: active.length,
    matches: activeMatches,
    new: newListings,
    changed,
    fetched: read.fetched,
    skipped_closed: read.skippedIds.length,
    index_pages: discovery.pages,
    reported_total: discovery.reportedTotal,
    discovery_complete: discovery.complete,
    missing,
    geocoded,
    alerts: sent,
  };
  ctx.setStats(stats);

  return {
    listings,
    fetched: read.fetched,
    newListings,
    changed,
    activeMatches,
    alerts: sent,
    discoveryComplete: discovery.complete,
  };
}

/** Registry entry: wires the pipeline to Supabase and the real network. */
export const housingDailyJob: JobDefinition = {
  type: HOUSING_JOB_TYPE,
  group: "daily",
  description:
    "Checks newstarterhomes.ie for Cost Rental homes, records changes and alerts on matches",
  idempotencyKey: (now) => `${HOUSING_JOB_TYPE}:${dublinDate(now)}`,
  async run(ctx, admin) {
    await runHousingDaily(ctx, {
      store: supabaseHousingStore(admin),
      fetcher: politeFetcher({ minIntervalMs: 1100 }),
      geocodeFetcher: politeFetcher({ minIntervalMs: 1100 }),
    });
  },
};
