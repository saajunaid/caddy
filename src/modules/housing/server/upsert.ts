// Builds housing_listings rows and observations from snapshots. Pure, no I/O.
//
// Only listing columns are ever produced here. Applications (status, outcome, notes…) are
// user-owned and live in housing_applications, which the daily job never reads or writes.
import type { Json } from "../../../lib/supabase/database.types.ts";
import { daysBetween, dublinDate } from "../../../server/domain/dates.ts";
import { describeChanges } from "./changes.ts";
import { listingMatch } from "./matching.ts";
import { snapshotHash } from "./snapshot.ts";
import type {
  ListingSnapshot,
  ListingStatus,
  MatchLevel,
  SourceStatus,
} from "./types.ts";
import { parseBedroomsSummary } from "./values.ts";

/** Days before the closing date when an open listing counts as "closing soon". */
export const CLOSING_SOON_DAYS = 7;
/** Complete runs a listing may be missing from the source before it's marked unknown. */
export const MISSING_RUNS_LIMIT = 3;

/** What the job needs to know about a listing it already has. */
export type ExistingListing = {
  id: string;
  external_id: string;
  status: string;
  matches: string;
  closing_date: string | null;
  content_hash: string;
  first_seen_at: string;
  last_checked_at: string;
  closed_at: string | null;
  missed_runs: number;
  latitude: number | null;
  longitude: number | null;
  geocode_source: string | null;
  geocode_query: string | null;
  geocoded_at: string | null;
  raw: NonNullable<Json>;
};

/** Exactly the housing_listings columns the job writes. Nothing else. */
export const LISTING_COLUMNS = [
  "source",
  "external_id",
  "url",
  "title",
  "provider",
  "address_text",
  "locality",
  "county",
  "status",
  "status_text",
  "closing_date",
  "closing_text",
  "rent_from_cents",
  "total_homes",
  "bedrooms_text",
  "apply_url",
  "listed_on",
  "unit_types",
  "matches",
  "min_matching_rent_cents",
  "latitude",
  "longitude",
  "geocode_source",
  "geocode_query",
  "geocoded_at",
  "content_hash",
  "first_seen_at",
  "last_seen_at",
  "last_checked_at",
  "closed_at",
  "missed_runs",
  "missing_note",
  "raw",
] as const;

export type ListingRow = {
  source: string;
  external_id: string;
  url: string;
  title: string;
  provider: string | null;
  address_text: string | null;
  locality: string | null;
  county: string | null;
  status: ListingStatus;
  status_text: string | null;
  closing_date: string | null;
  closing_text: string | null;
  rent_from_cents: number | null;
  total_homes: number | null;
  bedrooms_text: string | null;
  apply_url: string | null;
  listed_on: string | null;
  unit_types: NonNullable<Json>;
  matches: MatchLevel;
  min_matching_rent_cents: number | null;
  latitude: number | null;
  longitude: number | null;
  geocode_source: "provider" | "osm" | null;
  geocode_query: string | null;
  geocoded_at: string | null;
  content_hash: string;
  first_seen_at: string;
  last_seen_at: string;
  last_checked_at: string;
  closed_at: string | null;
  missed_runs: number;
  missing_note: string | null;
  raw: NonNullable<Json>;
};

export type ObservationDraft = {
  external_id: string;
  observed_at: string;
  content_hash: string;
  snapshot: NonNullable<Json>;
  change_summary: string[];
};

/** Stored status: the source's, plus "closing_soon" for open listings closing within 7 days. */
export function deriveStatus(
  sourceStatus: SourceStatus,
  closingDate: string | null,
  today: string,
): ListingStatus {
  if (sourceStatus === "open" && closingDate) {
    const days = daysBetween(today, closingDate);
    if (days >= 0 && days <= CLOSING_SOON_DAYS) return "closing_soon";
  }
  return sourceStatus;
}

/** The previous snapshot stored in `raw`, if it has the expected shape. */
export function previousSnapshot(
  existing: ExistingListing | null,
): ListingSnapshot | null {
  const raw = existing?.raw as Partial<ListingSnapshot> | null | undefined;
  if (!raw || typeof raw !== "object" || !Array.isArray(raw.unitTypes)) {
    return null;
  }
  return raw as ListingSnapshot;
}

export type ListingChange = {
  row: ListingRow;
  /** Present for a first sighting and whenever the content hash changes. */
  observation: ObservationDraft | null;
  isNew: boolean;
  previousStatus: string | null;
  previousMatches: string | null;
};

/** Row + observation for one freshly checked listing. */
export function buildListingChange(
  snapshot: ListingSnapshot,
  existing: ExistingListing | null,
  now: Date,
  today: string,
): ListingChange {
  const nowIso = now.toISOString();
  const hash = snapshotHash(snapshot);
  const match = listingMatch(
    snapshot.unitTypes,
    parseBedroomsSummary(snapshot.bedroomsText),
  );
  const status = deriveStatus(
    snapshot.sourceStatus,
    snapshot.closingDate,
    today,
  );

  // Coordinates: the provider's map pin wins; otherwise keep an earlier OSM lookup.
  const hasPin = snapshot.latitude !== null && snapshot.longitude !== null;
  const keepOsm = !hasPin && existing?.geocode_source === "osm";
  const pinMoved =
    hasPin &&
    (existing?.geocode_source !== "provider" ||
      Number(existing.latitude) !== snapshot.latitude ||
      Number(existing.longitude) !== snapshot.longitude);

  const row: ListingRow = {
    source: snapshot.source,
    external_id: snapshot.externalId,
    url: snapshot.url,
    title: snapshot.title,
    provider: snapshot.provider,
    address_text: snapshot.addressText,
    locality: snapshot.locality,
    county: snapshot.county,
    status,
    status_text: snapshot.statusText,
    closing_date: snapshot.closingDate,
    closing_text: snapshot.closingText,
    rent_from_cents: snapshot.rentFromCents,
    total_homes: snapshot.totalHomes,
    bedrooms_text: snapshot.bedroomsText,
    apply_url: snapshot.applyUrl,
    listed_on: snapshot.listedOn,
    unit_types: snapshot.unitTypes as unknown as NonNullable<Json>,
    matches: match.matches,
    min_matching_rent_cents: match.minMatchingRentCents,
    ...(hasPin
      ? {
          latitude: snapshot.latitude,
          longitude: snapshot.longitude,
          geocode_source: "provider" as const,
          geocode_query: null,
          geocoded_at: pinMoved ? nowIso : (existing?.geocoded_at ?? nowIso),
        }
      : {
          latitude: keepOsm ? Number(existing?.latitude) : null,
          longitude: keepOsm ? Number(existing?.longitude) : null,
          geocode_source: keepOsm ? ("osm" as const) : null,
          // Kept so the geocoder knows whether this address was already looked up.
          geocode_query: existing?.geocode_query ?? null,
          geocoded_at: existing?.geocoded_at ?? null,
        }),
    content_hash: hash,
    first_seen_at: existing?.first_seen_at ?? nowIso,
    last_seen_at: nowIso,
    last_checked_at: nowIso,
    closed_at:
      snapshot.sourceStatus === "closed"
        ? (existing?.closed_at ?? nowIso)
        : null,
    missed_runs: 0,
    missing_note: null,
    raw: snapshot as unknown as NonNullable<Json>,
  };

  const changed = !existing || existing.content_hash !== hash;
  const observation: ObservationDraft | null = changed
    ? {
        external_id: snapshot.externalId,
        observed_at: nowIso,
        content_hash: hash,
        snapshot: snapshot as unknown as NonNullable<Json>,
        change_summary: existing
          ? describeChanges(previousSnapshot(existing), snapshot)
          : [],
      }
    : null;

  return {
    row,
    observation,
    isNew: !existing,
    previousStatus: existing?.status ?? null,
    previousMatches: existing?.matches ?? null,
  };
}

/** Update for a listing missing from a complete run of the source. */
export function missingUpdate(
  existing: Pick<ExistingListing, "status" | "missed_runs">,
  today: string,
): { missed_runs: number; status?: ListingStatus; missing_note?: string } {
  const missed = existing.missed_runs + 1;
  if (missed < MISSING_RUNS_LIMIT) return { missed_runs: missed };
  const note = `No longer listed on newstarterhomes.ie (missing from ${missed} daily checks up to ${today}).`;
  // A closed listing that drops off the site is still closed; anything else is now unknown.
  return existing.status === "closed"
    ? { missed_runs: missed, missing_note: note }
    : { missed_runs: missed, status: "unknown", missing_note: note };
}

/**
 * Whether to fetch the listing page today. Every listing that isn't closed is fetched daily,
 * as are new ones and any whose status changed. Listings that are closed on both the index
 * and in Caddy are re-read weekly, which keeps the crawl polite as closed listings pile up.
 */
export function needsDetailFetch(
  indexStatus: SourceStatus,
  existing: Pick<
    ExistingListing,
    "external_id" | "status" | "last_checked_at"
  > | null,
  now: Date,
): boolean {
  if (!existing) return true;
  if (indexStatus !== "closed" || existing.status !== "closed") return true;
  const today = dublinDate(now);
  const age = daysBetween(
    dublinDate(new Date(existing.last_checked_at)),
    today,
  );
  if (age >= 8) return true;
  // Spread the weekly re-reads over the week instead of re-reading every closed listing
  // on the same day: each listing has a fixed weekday slot.
  return age >= 1 && weeklySlot(existing.external_id) === dayNumber(today) % 7;
}

/** A stable 0–6 slot for a listing. */
export function weeklySlot(externalId: string): number {
  let sum = 0;
  for (const char of externalId) sum = (sum * 31 + char.charCodeAt(0)) % 7919;
  return sum % 7;
}

function dayNumber(isoDate: string): number {
  return daysBetween("1970-01-01", isoDate);
}
