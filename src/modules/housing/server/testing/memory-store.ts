// In-memory HousingStore for tests: lets the whole daily pipeline run without a database.
import { randomUUID } from "node:crypto";
import type { NewNotification } from "../../../../server/notifications/notify.ts";
import type { HousingStore, ListingPatch, ObservationRow } from "../store.ts";
import type { ExistingListing, ListingRow } from "../upsert.ts";

export type StoredListing = ListingRow & { id: string };

export type StoredApplication = {
  household_id: string;
  listing_id: string;
  status: string;
  outcome_text: string | null;
  notes: string | null;
};

export class MemoryHousingStore implements HousingStore {
  listings = new Map<string, StoredListing>();
  observations: ObservationRow[] = [];
  notifications: NewNotification[] = [];
  /** The household's own rows. The job has no way to reach these; tests prove they survive. */
  applications: StoredApplication[] = [];
  households = ["household-a"];

  async loadListings(): Promise<ExistingListing[]> {
    return [...this.listings.values()].map((l) => structuredClone(l));
  }

  async upsertListings(rows: readonly ListingRow[]) {
    const ids = new Map<string, string>();
    for (const row of rows) {
      const current = this.listings.get(row.external_id);
      const id = current?.id ?? randomUUID();
      this.listings.set(row.external_id, {
        ...current,
        ...structuredClone(row),
        id,
      });
      ids.set(row.external_id, id);
    }
    return ids;
  }

  async insertObservations(rows: readonly ObservationRow[]) {
    this.observations.push(...structuredClone(rows));
  }

  async updateListing(id: string, patch: ListingPatch) {
    for (const [key, listing] of this.listings) {
      if (listing.id === id) this.listings.set(key, { ...listing, ...patch });
    }
  }

  async markSeen(ids: readonly string[], at: string) {
    for (const id of ids) {
      await this.updateListing(id, {
        last_seen_at: at,
        missed_runs: 0,
        missing_note: null,
      });
    }
  }

  async householdIds() {
    return [...this.households];
  }

  async notify(items: readonly NewNotification[]) {
    let added = 0;
    for (const item of items) {
      const duplicate = this.notifications.some(
        (n) =>
          n.householdId === item.householdId && n.dedupeKey === item.dedupeKey,
      );
      if (!duplicate) {
        this.notifications.push(item);
        added += 1;
      }
    }
    return added;
  }

  byExternalId(externalId: string): StoredListing {
    const listing = this.listings.get(externalId);
    if (!listing) throw new Error(`No listing ${externalId}`);
    return listing;
  }
}
