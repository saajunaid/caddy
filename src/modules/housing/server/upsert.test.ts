// @vitest-environment node
import { describe, expect, it } from "vitest";
import { parseListingPage } from "./parser";
import { buildSnapshot } from "./snapshot";
import { fixture } from "./testing/fixtures";
import type { ListingSnapshot } from "./types";
import {
  buildListingChange,
  deriveStatus,
  LISTING_COLUMNS,
  missingUpdate,
  needsDetailFetch,
  type ExistingListing,
} from "./upsert";

const NOW = new Date("2026-10-18T06:15:00Z");
const TODAY = "2026-10-18";

function woodbrook(): ListingSnapshot {
  return buildSnapshot({
    externalId: "woodbrook1",
    card: null,
    page: parseListingPage(fixture("listing-woodbrook1.html")),
  });
}

function existingFrom(
  change: ReturnType<typeof buildListingChange>,
  overrides: Partial<ExistingListing> = {},
): ExistingListing {
  const { row } = change;
  return {
    id: "listing-1",
    external_id: row.external_id,
    status: row.status,
    matches: row.matches,
    closing_date: row.closing_date,
    content_hash: row.content_hash,
    first_seen_at: row.first_seen_at,
    last_checked_at: row.last_checked_at,
    closed_at: row.closed_at,
    missed_runs: row.missed_runs,
    latitude: row.latitude,
    longitude: row.longitude,
    geocode_source: row.geocode_source,
    geocode_query: row.geocode_query,
    geocoded_at: row.geocoded_at,
    raw: row.raw,
    ...overrides,
  };
}

describe("deriveStatus", () => {
  it("marks open listings closing within 7 days as closing soon", () => {
    expect(deriveStatus("open", "2026-10-28", "2026-10-21")).toBe(
      "closing_soon",
    );
    expect(deriveStatus("open", "2026-10-21", "2026-10-21")).toBe(
      "closing_soon",
    );
    expect(deriveStatus("open", "2026-10-29", "2026-10-21")).toBe("open");
    expect(deriveStatus("open", null, "2026-10-21")).toBe("open");
  });

  it("keeps the source's status otherwise", () => {
    expect(deriveStatus("closed", "2026-10-22", "2026-10-21")).toBe("closed");
    expect(deriveStatus("coming_soon", "2026-10-22", "2026-10-21")).toBe(
      "coming_soon",
    );
    // Past deadline but the site still says open: we show what the site says.
    expect(deriveStatus("open", "2026-10-01", "2026-10-21")).toBe("open");
  });
});

describe("buildListingChange", () => {
  it("creates a row and a first observation for a new listing", () => {
    const change = buildListingChange(woodbrook(), null, NOW, TODAY);
    expect(change.isNew).toBe(true);
    expect(change.row).toMatchObject({
      source: "newstarterhomes",
      external_id: "woodbrook1",
      title: "Woodbrook",
      status: "open",
      closing_date: "2026-10-27",
      matches: "none",
      min_matching_rent_cents: null,
      geocode_source: "provider",
      first_seen_at: NOW.toISOString(),
      closed_at: null,
      missed_runs: 0,
    });
    expect(change.observation).toMatchObject({
      external_id: "woodbrook1",
      change_summary: [],
    });
  });

  it("only writes listing columns — never application fields", () => {
    const { row } = buildListingChange(woodbrook(), null, NOW, TODAY);
    expect(Object.keys(row).sort()).toEqual([...LISTING_COLUMNS].sort());
    for (const userOwned of [
      "household_id",
      "applied_on",
      "outcome_text",
      "notes",
      "next_action",
      "provider_reference",
      "updated_by",
    ]) {
      expect(row).not.toHaveProperty(userOwned);
    }
  });

  it("writes no observation when nothing changed", () => {
    const first = buildListingChange(woodbrook(), null, NOW, TODAY);
    const later = new Date("2026-10-22T06:15:00Z");
    const second = buildListingChange(
      woodbrook(),
      existingFrom(first),
      later,
      "2026-10-22",
    );
    expect(second.observation).toBeNull();
    expect(second.row.first_seen_at).toBe(NOW.toISOString());
    expect(second.row.last_checked_at).toBe(later.toISOString());
    // A day later the closing date is within 7 days, so the status moves on without a change.
    expect(second.row.status).toBe("closing_soon");
  });

  it("records a change summary when the content changes", () => {
    const first = buildListingChange(woodbrook(), null, NOW, TODAY);
    const changed = woodbrook();
    changed.unitTypes = changed.unitTypes.map((u) =>
      u.label === "2-bed" ? { ...u, rent_cents: 160000 } : u,
    );
    const second = buildListingChange(changed, existingFrom(first), NOW, TODAY);
    expect(second.observation?.change_summary).toEqual([
      "Rent for 2-bed changed €1,665 → €1,600",
    ]);
  });

  it("stamps closed_at once and clears it when a listing reopens", () => {
    const closed = { ...woodbrook(), sourceStatus: "closed" as const };
    const first = buildListingChange(closed, null, NOW, TODAY);
    expect(first.row.closed_at).toBe(NOW.toISOString());
    const later = new Date("2026-10-25T06:15:00Z");
    const still = buildListingChange(
      closed,
      existingFrom(first),
      later,
      "2026-10-25",
    );
    expect(still.row.closed_at).toBe(NOW.toISOString());
    const reopened = buildListingChange(
      woodbrook(),
      existingFrom(first),
      later,
      "2026-10-25",
    );
    expect(reopened.row.closed_at).toBeNull();
    expect(reopened.previousStatus).toBe("closed");
  });

  it("keeps an earlier OSM geocode when the page has no map pin", () => {
    const noPin = { ...woodbrook(), latitude: null, longitude: null };
    const first = buildListingChange(noPin, null, NOW, TODAY);
    expect(first.row.latitude).toBeNull();
    const existing = existingFrom(first, {
      latitude: 53.2,
      longitude: -6.1,
      geocode_source: "osm",
      geocode_query: "Shankill, County Dublin, Ireland",
      geocoded_at: NOW.toISOString(),
    });
    const second = buildListingChange(noPin, existing, NOW, TODAY);
    expect(second.row).toMatchObject({
      latitude: 53.2,
      longitude: -6.1,
      geocode_source: "osm",
      geocode_query: "Shankill, County Dublin, Ireland",
    });
  });
});

describe("missingUpdate", () => {
  it("counts misses and marks the listing unknown after 3 complete runs", () => {
    expect(missingUpdate({ status: "open", missed_runs: 0 }, TODAY)).toEqual({
      missed_runs: 1,
    });
    expect(missingUpdate({ status: "open", missed_runs: 1 }, TODAY)).toEqual({
      missed_runs: 2,
    });
    const third = missingUpdate({ status: "open", missed_runs: 2 }, TODAY);
    expect(third.status).toBe("unknown");
    expect(third.missing_note).toMatch(/No longer listed/);
  });

  it("keeps a closed listing closed, with a note", () => {
    const third = missingUpdate({ status: "closed", missed_runs: 2 }, TODAY);
    expect(third.status).toBeUndefined();
    expect(third.missing_note).toMatch(/No longer listed/);
  });
});

describe("needsDetailFetch", () => {
  const recent = { status: "closed", last_checked_at: "2026-10-19T06:00:00Z" };
  it("fetches new, open and changed listings every day", () => {
    expect(
      needsDetailFetch("closed", null, new Date("2026-10-21T06:15:00Z")),
    ).toBe(true);
    expect(
      needsDetailFetch("open", recent, new Date("2026-10-21T06:15:00Z")),
    ).toBe(true);
    expect(
      needsDetailFetch("coming_soon", recent, new Date("2026-10-21T06:15:00Z")),
    ).toBe(true);
    expect(
      needsDetailFetch(
        "closed",
        { ...recent, status: "open" },
        new Date("2026-10-21T06:15:00Z"),
      ),
    ).toBe(true);
  });

  it("re-reads closed listings weekly", () => {
    expect(
      needsDetailFetch("closed", recent, new Date("2026-10-21T06:15:00Z")),
    ).toBe(false);
    expect(
      needsDetailFetch(
        "closed",
        { ...recent, last_checked_at: "2026-10-14T06:00:00Z" },
        new Date("2026-10-21T06:15:00Z"),
      ),
    ).toBe(true);
  });
});
