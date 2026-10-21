// @vitest-environment node
import { describe, expect, it } from "vitest";
import { alertsFor, failureAlert, type AlertListing } from "./alerts";

const TODAY = "2026-10-21";

function listing(overrides: Partial<AlertListing> = {}): AlertListing {
  return {
    id: "id-1",
    external_id: "riverside",
    title: "Riverside Quarter",
    locality: "Castletroy",
    county: "Limerick",
    status: "open",
    matches: "match",
    closing_date: "2026-11-06",
    min_matching_rent_cents: 172000,
    unit_types: [
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
        rent_cents: 172000,
        homes: 4,
      },
    ],
    bedrooms_text: "2 & 4 Bed",
    ...overrides,
  };
}

const NEW = { isNew: true, previousStatus: null, previousMatches: null };
const SAME = { isNew: false, previousStatus: "open", previousMatches: "match" };

describe("alertsFor", () => {
  it("announces a new match with a stable key", () => {
    const [alert] = alertsFor(listing(), NEW, TODAY);
    expect(alert).toMatchObject({
      kind: "housing.match",
      title: "New 4-bed match: Riverside Quarter, Castletroy",
      body: "4 bed house · from €1,720/month · closes 6 Nov",
      actionUrl: "/housing/id-1",
      dedupeKey: "housing:riverside:match",
    });
  });

  it("names 3-bed house matches", () => {
    const [alert] = alertsFor(
      listing({
        unit_types: [
          {
            label: "3 bed house",
            bedrooms: 3,
            property_type: "house",
            rent_cents: 149500,
            homes: 2,
          },
        ],
        min_matching_rent_cents: 149500,
      }),
      NEW,
      TODAY,
    );
    expect(alert.title).toBe(
      "New 3-bed house match: Riverside Quarter, Castletroy",
    );
  });

  it("announces possible matches separately", () => {
    const [alert] = alertsFor(
      listing({
        matches: "possible",
        unit_types: [
          {
            label: "Three-bedroom home",
            bedrooms: 3,
            property_type: "unknown",
            rent_cents: 171400,
            homes: 9,
          },
        ],
      }),
      NEW,
      TODAY,
    );
    expect(alert.kind).toBe("housing.possible");
    expect(alert.title).toBe(
      "Possible match, check details: Riverside Quarter, Castletroy",
    );
    expect(alert.body).toContain("3 bed, type not stated");
  });

  it("alerts when a possible match becomes a definite one", () => {
    const alerts = alertsFor(
      listing(),
      { isNew: false, previousStatus: "open", previousMatches: "possible" },
      TODAY,
    );
    expect(alerts.map((a) => a.kind)).toEqual(["housing.match"]);
  });

  it("stays quiet for listings already announced, non-matches and closed listings", () => {
    expect(alertsFor(listing(), SAME, TODAY)).toEqual([]);
    expect(alertsFor(listing({ matches: "none" }), NEW, TODAY)).toEqual([]);
    expect(alertsFor(listing({ status: "closed" }), NEW, TODAY)).toEqual([]);
  });

  it("warns once per closing date when a match closes within 7 days", () => {
    const soon = listing({
      status: "closing_soon",
      closing_date: "2026-10-24",
    });
    const alerts = alertsFor(soon, SAME, TODAY);
    expect(alerts).toHaveLength(1);
    expect(alerts[0]).toMatchObject({
      kind: "housing.closing",
      title: "Closes in 3 days: Riverside Quarter, Castletroy",
      dedupeKey: "housing:riverside:closing:2026-10-24",
    });
    expect(
      alertsFor(listing({ closing_date: "2026-10-21" }), SAME, TODAY)[0].title,
    ).toBe("Closes today: Riverside Quarter, Castletroy");
    expect(
      alertsFor(listing({ closing_date: "2026-10-29" }), SAME, TODAY),
    ).toEqual([]);
    expect(
      alertsFor(listing({ closing_date: "2026-10-20" }), SAME, TODAY),
    ).toEqual([]);
  });

  it("announces a match that reopens", () => {
    const alerts = alertsFor(
      listing({ closing_date: null }),
      { isNew: false, previousStatus: "closed", previousMatches: "match" },
      TODAY,
    );
    expect(alerts).toEqual([
      expect.objectContaining({
        kind: "housing.reopened",
        title: "Reopened: Riverside Quarter, Castletroy",
        dedupeKey: "housing:riverside:reopened:2026-10-21",
        body: "4 bed house · from €1,720/month · closing date not stated",
      }),
    ]);
  });

  it("falls back to the county when the locality is unknown", () => {
    const [alert] = alertsFor(listing({ locality: null }), NEW, TODAY);
    expect(alert.title).toBe(
      "New 4-bed match: Riverside Quarter, Co. Limerick",
    );
  });
});

describe("failureAlert", () => {
  it("is critical and once per day", () => {
    expect(failureAlert(TODAY, "HTTP 503")).toMatchObject({
      severity: "critical",
      dedupeKey: "housing:check-failed:2026-10-21",
    });
  });
});
