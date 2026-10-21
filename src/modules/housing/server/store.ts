// Persistence for the daily housing job. The job talks to this interface so tests can run
// the whole pipeline in memory; production uses Supabase with the secret key.
//
// Deliberately, nothing here can read or write housing_applications: those rows belong to
// the household and the daily job never touches them.
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "../../../lib/supabase/database.types.ts";
import {
  allHouseholdIds,
  notify,
  type NewNotification,
} from "../../../server/notifications/notify.ts";
import type {
  ExistingListing,
  ListingRow,
  ObservationDraft,
} from "./upsert.ts";

export type ListingPatch = Partial<
  Pick<
    ListingRow,
    | "status"
    | "missed_runs"
    | "missing_note"
    | "last_seen_at"
    | "latitude"
    | "longitude"
    | "geocode_source"
    | "geocode_query"
    | "geocoded_at"
  >
>;

export type ObservationRow = Omit<ObservationDraft, "external_id"> & {
  listing_id: string;
  job_run_id: string | null;
};

export interface HousingStore {
  loadListings(): Promise<ExistingListing[]>;
  /** Insert or update by (source, external_id). Returns external_id → id. */
  upsertListings(rows: readonly ListingRow[]): Promise<Map<string, string>>;
  insertObservations(rows: readonly ObservationRow[]): Promise<void>;
  updateListing(id: string, patch: ListingPatch): Promise<void>;
  /** Seen on the index today without re-reading the page. */
  markSeen(ids: readonly string[], at: string): Promise<void>;
  householdIds(): Promise<string[]>;
  notify(items: readonly NewNotification[]): Promise<number>;
}

type Admin = SupabaseClient<Database>;

const EXISTING_COLUMNS =
  "id, external_id, status, matches, closing_date, content_hash, first_seen_at, last_checked_at, closed_at, missed_runs, latitude, longitude, geocode_source, geocode_query, geocoded_at, raw";

function chunks<T>(items: readonly T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size)
    out.push(items.slice(i, i + size));
  return out;
}

export function supabaseHousingStore(admin: Admin): HousingStore {
  return {
    async loadListings() {
      const all: ExistingListing[] = [];
      for (let from = 0; ; from += 1000) {
        const { data, error } = await admin
          .from("housing_listings")
          .select(EXISTING_COLUMNS)
          .eq("source", "newstarterhomes")
          .order("external_id")
          .range(from, from + 999);
        if (error) throw new Error(`Couldn't load listings: ${error.message}`);
        all.push(...data);
        if (data.length < 1000) break;
      }
      return all;
    },

    async upsertListings(rows) {
      const ids = new Map<string, string>();
      for (const batch of chunks(rows, 100)) {
        const { data, error } = await admin
          .from("housing_listings")
          .upsert(batch, { onConflict: "source,external_id" })
          .select("id, external_id");
        if (error) throw new Error(`Couldn't save listings: ${error.message}`);
        for (const row of data) ids.set(row.external_id, row.id);
      }
      return ids;
    },

    async insertObservations(rows) {
      for (const batch of chunks(rows, 100)) {
        const { error } = await admin
          .from("housing_observations")
          .insert(batch);
        if (error)
          throw new Error(`Couldn't save listing history: ${error.message}`);
      }
    },

    async updateListing(id, patch) {
      const { error } = await admin
        .from("housing_listings")
        .update(patch)
        .eq("id", id);
      if (error) throw new Error(`Couldn't update listing: ${error.message}`);
    },

    async markSeen(ids, at) {
      for (const batch of chunks(ids, 200)) {
        const { error } = await admin
          .from("housing_listings")
          .update({ last_seen_at: at, missed_runs: 0, missing_note: null })
          .in("id", batch);
        if (error)
          throw new Error(`Couldn't update listings: ${error.message}`);
      }
    },

    householdIds: () => allHouseholdIds(admin),
    notify: (items) => notify(admin, items),
  };
}
