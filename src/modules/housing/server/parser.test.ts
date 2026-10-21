// @vitest-environment node
// Real pages saved from newstarterhomes.ie on 21 Oct 2026 (tests/fixtures/newstarterhomes).
import { describe, expect, it } from "vitest";
import {
  listingSlug,
  parseCalendarPage,
  parseIndexPage,
  parseListingPage,
} from "./parser";
import { fixture } from "./testing/fixtures";

describe("listingSlug", () => {
  it("accepts listing links only", () => {
    expect(listingSlug("woodbrook1/")).toBe("woodbrook1");
    expect(listingSlug("/rent/harmen/")).toBe("harmen");
    expect(listingSlug("https://newstarterhomes.ie/rent/sidings/")).toBe(
      "sidings",
    );
    expect(listingSlug("/rent/map/")).toBeNull();
    expect(listingSlug("/rent/calendar/")).toBeNull();
    expect(listingSlug("/buy/woodbrook1/")).toBeNull();
    expect(listingSlug("https://example.com/rent/x/")).toBeNull();
    expect(listingSlug("?page=2")).toBeNull();
  });
});

describe("parseIndexPage", () => {
  it("reads every card, the total and the next page", () => {
    const page = parseIndexPage(
      fixture("index-page-1.html"),
      "https://newstarterhomes.ie/rent/",
    );
    expect(page.cards).toHaveLength(12);
    expect(page.total).toBe(203);
    expect(page.nextUrl).toBe("https://newstarterhomes.ie/rent/?page=2");
    expect(page.cards[0]).toEqual({
      externalId: "woodbrook1",
      url: "https://newstarterhomes.ie/rent/woodbrook1/",
      title: "Woodbrook",
      sourceStatus: "open",
      statusText: "Applications Open",
      locationText: "Shankill, Co. Dublin",
      rentFromCents: 149500,
      listedOn: "2026-10-20",
    });
    const byId = new Map(page.cards.map((c) => [c.externalId, c]));
    expect(byId.get("whitehave")?.sourceStatus).toBe("coming_soon");
    expect(byId.get("sidings")?.sourceStatus).toBe("coming_soon");
    expect(byId.get("griffin")?.sourceStatus).toBe("closed");
    expect(page.cards.filter((c) => c.sourceStatus === "open")).toHaveLength(5);
  });

  it("stops on the last page", () => {
    const page = parseIndexPage(
      fixture("index-page-17.html"),
      "https://newstarterhomes.ie/rent/?page=17",
    );
    expect(page.cards).toHaveLength(11);
    expect(page.nextUrl).toBeNull();
  });

  it("returns no cards for a page past the end (the job treats this as a failure)", () => {
    const page = parseIndexPage(
      fixture("index-page-18-empty.html"),
      "https://newstarterhomes.ie/rent/?page=18",
    );
    expect(page.cards).toEqual([]);
    expect(page.total).toBeNull();
  });
});

describe("parseCalendarPage", () => {
  const calendar = parseCalendarPage(fixture("calendar.html"));

  it("links every listing", () => {
    expect(calendar.slugs).toHaveLength(203);
    expect(calendar.slugs).not.toContain("map");
  });

  it("gives opening and closing dates", () => {
    expect(calendar.dates.get("sidings")).toEqual({
      openingDate: "2026-10-21",
      closingDate: "2026-11-02",
    });
    expect(calendar.dates.get("woodbrook1")).toEqual({
      openingDate: "2026-10-20",
      closingDate: "2026-10-27",
    });
    expect(calendar.dates.get("griffin")?.closingDate).toBe("2026-10-19");
  });
});

describe("parseListingPage", () => {
  it("reads an open listing with several unit types", () => {
    const page = parseListingPage(fixture("listing-woodbrook1.html"));
    expect(page).toMatchObject({
      title: "Woodbrook",
      headerCounty: "Dublin",
      sourceStatus: "open",
      closingDate: "2026-10-27",
      closingText: "27 October 2026 at 12:00",
      rentFromCents: 149500,
      locationText: "Shankill, Co. Dublin",
      bedroomsText: "1 & 2 Bed",
      totalHomes: 327,
      provider: "The Land Development Agency",
      applyUrl: "https://lda.ie/homes/lda-cost-rental",
      tableUnreadable: false,
    });
    expect(page.latitude).toBeCloseTo(53.220509, 5);
    expect(page.longitude).toBeCloseTo(-6.114735, 5);
    expect(page.unitTypes).toEqual([
      {
        label: "1-bed",
        bedrooms: 1,
        property_type: "unknown",
        rent_cents: 149500,
        homes: 102,
      },
      {
        label: "2-bed",
        bedrooms: 2,
        property_type: "unknown",
        rent_cents: 166500,
        homes: 220,
      },
      {
        label: "2-bed duplex",
        bedrooms: 2,
        property_type: "duplex",
        rent_cents: 175000,
        homes: 6,
      },
    ]);
  });

  it("reads a listing that isn't open yet", () => {
    const page = parseListingPage(fixture("listing-sidings.html"));
    expect(page.sourceStatus).toBe("coming_soon");
    expect(page.openingDate).toBe("2026-10-21");
    expect(page.closingDate).toBeNull();
    expect(page.applyUrl).toBeNull();
    expect(page.unitTypes).toEqual([
      {
        label: "1 Bed Apartment",
        bedrooms: 1,
        property_type: "apartment",
        rent_cents: 152500,
        homes: 2,
      },
    ]);
  });

  it("reads a closed listing, keeping the site's own figures as published", () => {
    const page = parseListingPage(fixture("listing-griffin.html"));
    expect(page.sourceStatus).toBe("closed");
    expect(page.statusText).toBe("Applications Closed");
    expect(page.closingDate).toBeNull();
    // The site shows "€146,250" as the starting rent (a typo for €1,462.50); kept as published.
    expect(page.rentFromCents).toBe(14_625_000);
    expect(page.unitTypes.map((u) => [u.label, u.rent_cents, u.homes])).toEqual(
      [
        ["1 BED APARTMENT", 146250, 41],
        ["2 BED APARTMENT - 3 PERSON", 152950, 5],
        ["2 BED APARTMENT - 4 PERSON", 162925, 44],
      ],
    );
  });

  it("reads 'three/four bedroom home' rows with the type unknown", () => {
    const page = parseListingPage(fixture("listing-long.html"));
    expect(page.unitTypes).toEqual([
      {
        label: "three bedroom home",
        bedrooms: 3,
        property_type: "unknown",
        rent_cents: 145500,
        homes: 39,
      },
      {
        label: "four bedroom home",
        bedrooms: 4,
        property_type: "unknown",
        rent_cents: 159400,
        homes: 13,
      },
    ]);
  });

  it("reads houses, semi-detached homes and bungalows", () => {
    expect(
      parseListingPage(fixture("listing-baileadaim1.html")).unitTypes.map(
        (u) => [u.label, u.bedrooms, u.property_type, u.rent_cents],
      ),
    ).toEqual([
      ["1 Bed ground floor apartment", 1, "apartment", 71000],
      ["2 bed duplex", 2, "duplex", 92500],
      ["3 Bed Semi Detached", 3, "house", 131500],
    ]);
    expect(
      parseListingPage(fixture("listing-newton-heights.html")).unitTypes,
    ).toEqual([
      {
        label: "Three-bedroom houses",
        bedrooms: 3,
        property_type: "house",
        rent_cents: 140700,
        homes: 39,
      },
      {
        label: "Two-bedroom bungalows",
        bedrooms: 2,
        property_type: "house",
        rent_cents: 120600,
        homes: 12,
      },
    ]);
  });

  it("maps differently named columns ('Type', 'Units')", () => {
    const page = parseListingPage(fixture("listing-allmans-view.html"));
    expect(page.unitTypes).toEqual([
      {
        label: "2 bed",
        bedrooms: 2,
        property_type: "unknown",
        rent_cents: 108000,
        homes: 10,
      },
      {
        label: "3 bed",
        bedrooms: 3,
        property_type: "unknown",
        rent_cents: 126500,
        homes: 10,
      },
    ]);
  });

  it("leaves rent unknown when the rent column is mislabelled", () => {
    // This page's rent column is headed "Maximum Sale Price"; we don't guess.
    const page = parseListingPage(fixture("listing-crossingsadams.html"));
    expect(page.unitTypes).toHaveLength(5);
    expect(page.unitTypes.every((u) => u.rent_cents === null)).toBe(true);
    expect(page.unitTypes[4]).toMatchObject({
      label: "3-bed apartments",
      bedrooms: 3,
      property_type: "apartment",
      homes: 3,
    });
  });

  it("handles a page with no unit table", () => {
    const page = parseListingPage(fixture("listing-clai-mor.html"));
    expect(page.unitTypes).toEqual([]);
    expect(page.tableUnreadable).toBe(false);
    expect(page.bedroomsText).toBe("3 Bed");
    expect(page.totalHomes).toBe(3);
    expect(page.provider).toBeNull();
  });

  it("reads an open listing whose only 3-bed homes are apartments", () => {
    const page = parseListingPage(fixture("listing-harmen.html"));
    expect(page.sourceStatus).toBe("open");
    expect(page.closingDate).toBe("2026-11-02");
    expect(page.unitTypes.map((u) => u.property_type)).toEqual([
      "apartment",
      "apartment",
      "apartment",
    ]);
  });

  it("returns empty facts for an unrelated page instead of inventing them", () => {
    const page = parseListingPage("<html><body><p>Hello</p></body></html>");
    expect(page).toMatchObject({
      title: null,
      sourceStatus: null,
      unitTypes: [],
      latitude: null,
      provider: null,
    });
  });
});
