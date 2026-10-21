import "server-only";
import { createClient } from "@/lib/supabase/server";
import type { ListingSummary } from "./display";
import type { MatchLevel, UnitType } from "./server/types";

const LIST_COLUMNS =
  "id, title, url, provider, address_text, locality, county, status, closing_date, unit_types, bedrooms_text, matches, min_matching_rent_cents, rent_from_cents, first_seen_at, last_checked_at, missing_note, raw->>openingDate";

type ListRow = {
  id: string;
  title: string;
  url: string;
  provider: string | null;
  address_text: string | null;
  locality: string | null;
  county: string | null;
  status: string;
  closing_date: string | null;
  unit_types: unknown;
  bedrooms_text: string | null;
  matches: string;
  min_matching_rent_cents: number | null;
  rent_from_cents: number | null;
  first_seen_at: string;
  last_checked_at: string;
  missing_note: string | null;
  openingDate: string | null;
};

function toSummary(
  row: ListRow,
  applicationStatus: string | null,
): ListingSummary {
  return {
    id: row.id,
    title: row.title,
    url: row.url,
    provider: row.provider,
    address_text: row.address_text,
    locality: row.locality,
    county: row.county,
    status: row.status,
    closing_date: row.closing_date,
    opening_date: row.openingDate,
    unit_types: Array.isArray(row.unit_types)
      ? (row.unit_types as UnitType[])
      : [],
    bedrooms_text: row.bedrooms_text,
    matches: row.matches as MatchLevel,
    min_matching_rent_cents: row.min_matching_rent_cents,
    rent_from_cents: row.rent_from_cents,
    first_seen_at: row.first_seen_at,
    last_checked_at: row.last_checked_at,
    missing_note: row.missing_note,
    application_status: applicationStatus,
  };
}

/** Every listing with this household's application status. RLS scopes applications. */
export async function loadListings(): Promise<ListingSummary[]> {
  const supabase = await createClient();
  const [listings, applications] = await Promise.all([
    supabase
      .from("housing_listings")
      .select(LIST_COLUMNS)
      .order("first_seen_at", { ascending: false })
      .limit(2000),
    supabase.from("housing_applications").select("listing_id, status"),
  ]);
  if (listings.error)
    throw new Error(`Couldn't load listings: ${listings.error.message}`);
  if (applications.error)
    throw new Error(
      `Couldn't load your applications: ${applications.error.message}`,
    );
  const byListing = new Map(
    applications.data.map((a) => [a.listing_id, a.status]),
  );
  return (listings.data as unknown as ListRow[]).map((row) =>
    toSummary(row, byListing.get(row.id) ?? null),
  );
}

export type ListingDetail = ListingSummary & {
  status_text: string | null;
  closing_text: string | null;
  total_homes: number | null;
  apply_url: string | null;
  listed_on: string | null;
  latitude: number | null;
  longitude: number | null;
  geocode_source: string | null;
  unit_types_from_summary: boolean;
};

export async function loadListing(id: string): Promise<ListingDetail | null> {
  if (!/^[0-9a-f-]{36}$/i.test(id)) return null;
  const supabase = await createClient();
  const [listing, application] = await Promise.all([
    supabase
      .from("housing_listings")
      .select(
        `${LIST_COLUMNS}, status_text, closing_text, total_homes, apply_url, listed_on, latitude, longitude, geocode_source, raw->>unitTypesFromSummary`,
      )
      .eq("id", id)
      .maybeSingle(),
    supabase
      .from("housing_applications")
      .select("status")
      .eq("listing_id", id)
      .maybeSingle(),
  ]);
  if (listing.error)
    throw new Error(`Couldn't load the listing: ${listing.error.message}`);
  if (application.error)
    throw new Error(
      `Couldn't load your application: ${application.error.message}`,
    );
  if (!listing.data) return null;
  const row = listing.data as unknown as ListRow & {
    status_text: string | null;
    closing_text: string | null;
    total_homes: number | null;
    apply_url: string | null;
    listed_on: string | null;
    latitude: number | null;
    longitude: number | null;
    geocode_source: string | null;
    unitTypesFromSummary: string | null;
  };
  return {
    ...toSummary(row, application.data?.status ?? null),
    status_text: row.status_text,
    closing_text: row.closing_text,
    total_homes: row.total_homes,
    apply_url: row.apply_url,
    listed_on: row.listed_on,
    latitude: row.latitude === null ? null : Number(row.latitude),
    longitude: row.longitude === null ? null : Number(row.longitude),
    geocode_source: row.geocode_source,
    unit_types_from_summary: row.unitTypesFromSummary === "true",
  };
}

export type Observation = {
  id: string;
  observed_at: string;
  change_summary: string[];
};

export async function loadObservations(
  listingId: string,
): Promise<Observation[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("housing_observations")
    .select("id, observed_at, change_summary")
    .eq("listing_id", listingId)
    .order("observed_at", { ascending: false })
    .limit(200);
  if (error)
    throw new Error(`Couldn't load the listing's history: ${error.message}`);
  return data;
}

export type Application = {
  status: string;
  applied_on: string | null;
  provider_reference: string | null;
  outcome_text: string | null;
  next_action: string | null;
  next_action_due: string | null;
  notes: string | null;
  updated_at: string;
  updated_by_name: string | null;
};

export async function loadApplication(
  listingId: string,
): Promise<Application | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("housing_applications")
    .select(
      "status, applied_on, provider_reference, outcome_text, next_action, next_action_due, notes, updated_at, updated_by",
    )
    .eq("listing_id", listingId)
    .maybeSingle();
  if (error)
    throw new Error(`Couldn't load your application: ${error.message}`);
  if (!data) return null;
  let updatedByName: string | null = null;
  if (data.updated_by) {
    const profile = await supabase
      .from("profiles")
      .select("display_name")
      .eq("user_id", data.updated_by)
      .maybeSingle();
    updatedByName = profile.data?.display_name ?? null;
  }
  const { updated_by: _ignored, ...rest } = data;
  void _ignored;
  return { ...rest, updated_by_name: updatedByName };
}

export type JobRunInfo = {
  status: string;
  summary: string | null;
  error: string | null;
  startedAt: Date;
  finishedAt: Date | null;
  stats: Record<string, unknown>;
};

/** Latest run of a job type, e.g. "housing-daily" or "housing-news". */
export async function latestRun(jobType: string): Promise<JobRunInfo | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("job_runs")
    .select("status, summary, error, started_at, finished_at, stats")
    .eq("job_type", jobType)
    .order("started_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error)
    throw new Error(`Couldn't load background checks: ${error.message}`);
  if (!data) return null;
  return {
    status: data.status,
    summary: data.summary,
    error: data.error,
    startedAt: new Date(data.started_at),
    finishedAt: data.finished_at ? new Date(data.finished_at) : null,
    stats: (data.stats ?? {}) as Record<string, unknown>,
  };
}

export type NewsItem = {
  id: string;
  title: string;
  url: string;
  source_name: string;
  source_type: string;
  published_on: string | null;
  retrieved_at: string;
  summary: string | null;
  locality: string | null;
  cost_rental_confirmed: string;
  verification: string;
};

/** Housing news published (or, if undated, retrieved) in the last 30 days, newest first. */
export async function loadNews(sinceDate: string): Promise<NewsItem[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("research_items")
    .select(
      "id, title, url, source_name, source_type, published_on, retrieved_at, summary, locality, cost_rental_confirmed, verification",
    )
    .or(
      `published_on.gte.${sinceDate},and(published_on.is.null,retrieved_at.gte.${sinceDate})`,
    )
    .order("published_on", { ascending: false, nullsFirst: false })
    .order("retrieved_at", { ascending: false })
    .limit(50);
  if (error) throw new Error(`Couldn't load housing news: ${error.message}`);
  return data;
}

export type Project = {
  id: string;
  name: string;
  locality: string | null;
  county: string | null;
  provider: string | null;
  stage: string | null;
  total_homes: number | null;
  cost_rental_homes: number | null;
  bedroom_mix: string | null;
  cost_rental_confirmed: string;
  expected_date_text: string | null;
  source_url: string | null;
  notes: string | null;
  verification: string;
  last_checked_on: string | null;
  updated_at: string;
};

export async function loadProjects(): Promise<Project[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("housing_projects")
    .select(
      "id, name, locality, county, provider, stage, total_homes, cost_rental_homes, bedroom_mix, cost_rental_confirmed, expected_date_text, source_url, notes, verification, last_checked_on, updated_at",
    )
    .order("name");
  if (error) throw new Error(`Couldn't load the pipeline: ${error.message}`);
  // Limerick first (the household's priority), then by county and name.
  return [...data].sort((a, b) => {
    const la = a.county === "Limerick" ? 0 : 1;
    const lb = b.county === "Limerick" ? 0 : 1;
    return (
      la - lb ||
      (a.county ?? "~").localeCompare(b.county ?? "~") ||
      a.name.localeCompare(b.name)
    );
  });
}
