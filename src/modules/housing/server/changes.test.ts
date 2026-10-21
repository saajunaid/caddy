// @vitest-environment node
import { describe, expect, it } from "vitest";
import { describeChanges, shortDate } from "./changes";
import {
  buildSnapshot,
  canonicalJson,
  snapshotHash,
  unitsFromSummary,
} from "./snapshot";
import type { ListingSnapshot } from "./types";

function snapshot(overrides: Partial<ListingSnapshot> = {}): ListingSnapshot {
  return {
    source: "newstarterhomes",
    externalId: "riverside",
    url: "https://newstarterhomes.ie/rent/riverside/",
    title: "Riverside Quarter",
    provider: null,
    addressText: "Castletroy, Co. Limerick",
    locality: "Castletroy",
    county: "Limerick",
    sourceStatus: "open",
    statusText: "Applications Open",
    openingDate: null,
    closingDate: null,
    closingText: null,
    rentFromCents: 124000,
    bedroomsText: "2, 3 & 4 Bed",
    totalHomes: 34,
    unitTypes: [
      {
        label: "2 bed apartment",
        bedrooms: 2,
        property_type: "apartment",
        rent_cents: 124000,
        homes: 18,
      },
      {
        label: "4 bed house",
        bedrooms: 4,
        property_type: "house",
        rent_cents: 178000,
        homes: 3,
      },
    ],
    unitTypesFromSummary: false,
    applyUrl: "https://example.ie/apply",
    latitude: 52.67,
    longitude: -8.55,
    listedOn: "2026-10-12",
    ...overrides,
  };
}

describe("snapshotHash", () => {
  it("is stable regardless of key order", () => {
    const a = snapshot();
    const reordered = Object.fromEntries(
      Object.entries(a).reverse(),
    ) as ListingSnapshot;
    expect(snapshotHash(reordered)).toBe(snapshotHash(a));
    expect(canonicalJson({ b: 1, a: [2, { d: 3, c: null }] })).toBe(
      '{"a":[2,{"c":null,"d":3}],"b":1}',
    );
  });

  it("ignores volatile fields (URL, map pin)", () => {
    expect(snapshotHash(snapshot({ latitude: 52.7, url: "https://x/" }))).toBe(
      snapshotHash(snapshot()),
    );
  });

  it("changes when a published fact changes", () => {
    expect(snapshotHash(snapshot({ closingDate: "2026-11-06" }))).not.toBe(
      snapshotHash(snapshot()),
    );
  });
});

describe("describeChanges", () => {
  it("says nothing for a first sighting", () => {
    expect(describeChanges(null, snapshot())).toEqual([]);
  });

  it("describes rent changes per unit type", () => {
    const after = snapshot({
      unitTypes: [
        snapshot().unitTypes[0],
        { ...snapshot().unitTypes[1], rent_cents: 172000 },
      ],
    });
    expect(describeChanges(snapshot(), after)).toEqual([
      "Rent for 4 bed house changed €1,780 → €1,720",
    ]);
  });

  it("describes closing dates and status changes", () => {
    expect(
      describeChanges(snapshot(), snapshot({ closingDate: "2026-11-06" })),
    ).toEqual(["Closing date set to 6 Nov"]);
    expect(
      describeChanges(
        snapshot({ closingDate: "2026-11-02" }),
        snapshot({ closingDate: "2026-11-06" }),
      ),
    ).toEqual(["Closing date changed 2 Nov → 6 Nov"]);
    expect(
      describeChanges(
        snapshot(),
        snapshot({ sourceStatus: "closed", applyUrl: null }),
      ),
    ).toEqual(["Status changed to closed", "Application link removed"]);
    expect(
      describeChanges(snapshot({ sourceStatus: "closed" }), snapshot()),
    ).toEqual(["Applications reopened"]);
    expect(
      describeChanges(snapshot({ sourceStatus: "coming_soon" }), snapshot()),
    ).toEqual(["Applications opened"]);
  });

  it("describes added and removed unit types and home counts", () => {
    const base = snapshot();
    const after = snapshot({
      unitTypes: [
        { ...base.unitTypes[0], homes: 20 },
        {
          label: "3 bed house",
          bedrooms: 3,
          property_type: "house",
          rent_cents: 149500,
          homes: 12,
        },
      ],
    });
    expect(describeChanges(base, after)).toEqual([
      "Homes for 2 bed apartment changed 18 → 20",
      "Added 3 bed house at €1,495",
      "Removed 4 bed house",
    ]);
  });

  it("keeps repeated labels apart", () => {
    const twin = {
      label: "2 Bed Apartment",
      bedrooms: 2,
      property_type: "apartment" as const,
      homes: 1,
    };
    const before = snapshot({
      unitTypes: [
        { ...twin, rent_cents: 145500 },
        { ...twin, rent_cents: 150000 },
      ],
    });
    const after = snapshot({
      unitTypes: [
        { ...twin, rent_cents: 145500 },
        { ...twin, rent_cents: 152000 },
      ],
    });
    expect(describeChanges(before, after)).toEqual([
      "Rent for 2 Bed Apartment changed €1,500 → €1,520",
    ]);
  });

  it("falls back to a generic line for other edits", () => {
    expect(
      describeChanges(
        snapshot(),
        snapshot({ statusText: "Applications open now" }),
      ),
    ).toEqual(["Listing details updated"]);
  });

  it("formats short dates", () => {
    expect(shortDate("2026-11-06")).toBe("6 Nov");
  });
});

describe("buildSnapshot", () => {
  it("uses the bedroom summary when a page has no unit table", () => {
    expect(unitsFromSummary("3 & 4 Bed")).toEqual([
      {
        label: "3 Bed",
        bedrooms: 3,
        property_type: "unknown",
        rent_cents: null,
        homes: null,
      },
      {
        label: "4 Bed",
        bedrooms: 4,
        property_type: "unknown",
        rent_cents: null,
        homes: null,
      },
    ]);
    const snap = buildSnapshot({
      externalId: "x",
      card: null,
      page: {
        title: "X",
        headerCounty: "Galway",
        sourceStatus: "closed",
        statusText: "Applications Closed",
        openingDate: null,
        closingDate: null,
        closingText: null,
        rentFromCents: 160000,
        locationText: "Ballybrit, Co. Galway",
        bedroomsText: "3 Bed",
        totalHomes: 3,
        unitTypes: [],
        tableUnreadable: false,
        provider: null,
        applyUrl: null,
        latitude: null,
        longitude: null,
      },
      calendar: { openingDate: "2025-03-31", closingDate: "2025-04-14" },
    });
    expect(snap.unitTypesFromSummary).toBe(true);
    expect(snap.unitTypes).toHaveLength(1);
    expect(snap.closingDate).toBe("2025-04-14");
    expect(snap.locality).toBe("Ballybrit");
    expect(snap.county).toBe("Galway");
    expect(snap.provider).toBeNull();
  });
});
