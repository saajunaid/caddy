// @vitest-environment node
// Runs the whole housing-daily pipeline against saved newstarterhomes.ie pages: no network,
// no database. mini-index-*.html and mini-calendar.html are the real pages cut down to the
// ten listings saved as fixtures (cards and calendar entries copied verbatim).
import { describe, expect, it, vi } from "vitest";
import type { SourceCheck } from "../../../server/jobs/runner";
import type { Fetcher, HttpResponse } from "./http";
import { runHousingDaily, type HousingJobContext } from "./job";
import { CALENDAR_URL, INDEX_URL, listingUrl } from "./parser";
import { fixture, fixtureFetcher } from "./testing/fixtures";
import { MemoryHousingStore } from "./testing/memory-store";

const SLUGS = [
  "woodbrook1",
  "harmen",
  "sidings",
  "griffin",
  "long",
  "baileadaim1",
  "clai-mor",
  "crossingsadams",
  "newton-heights",
  "allmans-view",
];

/** "long" (a 4-bed development) reopened and closing on 24 Oct, so there's a live match. */
function openLongview(rent = "&euro;1,594") {
  return fixture("listing-long.html")
    .replace(
      '<p class="soon dib fwb tttu">Applications Closed</p>',
      '<p class="close fsi">Applications Close:<br>24 October 2026 at 12:00</p>',
    )
    .replace("&euro;1,594", rent);
}

function site(
  overrides: Record<string, string | HttpResponse | (() => HttpResponse)> = {},
) {
  const routes: Record<string, string | HttpResponse | (() => HttpResponse)> = {
    [INDEX_URL]: "mini-index-page-1.html",
    [`${INDEX_URL}?page=2`]: "mini-index-page-2.html",
    [CALENDAR_URL]: "mini-calendar.html",
  };
  for (const slug of SLUGS) routes[listingUrl(slug)] = `listing-${slug}.html`;
  routes[listingUrl("long")] = { status: 200, text: openLongview() };
  return fixtureFetcher({ ...routes, ...overrides });
}

function context(now: string) {
  const sources: SourceCheck[] = [];
  let summary = "";
  let stats: Record<string, unknown> = {};
  const ctx: HousingJobContext = {
    runId: `run-${now}`,
    now: new Date(now),
    async recordSource(check) {
      sources.push(check);
    },
    setSummary(value) {
      summary = value;
    },
    setStats(value) {
      stats = value;
    },
  };
  return {
    ctx,
    sources,
    get summary() {
      return summary;
    },
    get stats() {
      return stats;
    },
  };
}

const noGeocode: Fetcher = async () => {
  throw new Error("geocoder should not be called");
};

const DAY1 = "2026-10-21T06:15:00Z";
const DAY2 = "2026-10-22T06:15:00Z";
const DAY3 = "2026-10-23T06:15:00Z";
const DAY4 = "2026-10-24T06:15:00Z";

describe("housing-daily", () => {
  it("records every listing, its first observation and alerts for the live match", async () => {
    const store = new MemoryHousingStore();
    const run = context(DAY1);
    const result = await runHousingDaily(run.ctx, {
      store,
      fetcher: site(),
      geocodeFetcher: noGeocode,
    });

    expect(result).toMatchObject({
      listings: 10,
      fetched: 10,
      newListings: 10,
      activeMatches: 1,
      discoveryComplete: true,
    });
    expect(run.summary).toBe("10 listings checked · 1 match · 10 new");
    expect(store.listings.size).toBe(10);
    expect(store.observations).toHaveLength(10);
    expect(
      store.observations.every((o) => o.job_run_id === run.ctx.runId),
    ).toBe(true);

    expect(store.byExternalId("long")).toMatchObject({
      status: "closing_soon",
      matches: "match",
      closing_date: "2026-10-24",
      min_matching_rent_cents: 159400,
    });
    expect(store.byExternalId("woodbrook1")).toMatchObject({
      status: "closing_soon",
      matches: "none",
    });
    expect(store.byExternalId("sidings")).toMatchObject({
      status: "coming_soon",
      closing_date: "2026-11-02",
    });
    expect(store.byExternalId("clai-mor")).toMatchObject({
      status: "closed",
      matches: "possible",
    });
    expect(store.byExternalId("baileadaim1")).toMatchObject({
      status: "closed",
      matches: "match",
    });

    expect(run.sources.map((s) => [s.source, s.status, s.itemsSeen])).toEqual([
      ["newstarterhomes.ie list", "ok", 6],
      ["newstarterhomes.ie list", "ok", 4],
      ["newstarterhomes.ie calendar", "ok", 10],
      ["newstarterhomes.ie listings 1–10", "ok", 10],
      ["Nominatim geocoding", "skipped", 0],
    ]);

    // Closed matches (baileadaim1) never alert; the live 4-bed match alerts twice.
    expect(store.notifications.map((n) => n.dedupeKey).sort()).toEqual([
      "housing:long:closing:2026-10-24",
      "housing:long:match",
    ]);
    const match = store.notifications.find((n) => n.kind === "housing.match")!;
    expect(match.title).toBe(
      "New 4-bed match: Longview, Whites Cross, Cork City, Longview",
    );
    expect(match.householdId).toBe("household-a");
    expect(match.actionUrl).toBe(`/housing/${store.byExternalId("long").id}`);
  });

  it("never touches the household's applications", async () => {
    const store = new MemoryHousingStore();
    await runHousingDaily(context(DAY1).ctx, {
      store,
      fetcher: site(),
      geocodeFetcher: noGeocode,
    });
    const application = {
      household_id: "household-a",
      listing_id: store.byExternalId("long").id,
      status: "applied",
      outcome_text: "Thank you for your application.",
      notes: "Payslips sent",
    };
    store.applications.push(structuredClone(application));
    await runHousingDaily(context(DAY2).ctx, {
      store,
      fetcher: site({
        [listingUrl("long")]: {
          status: 200,
          text: openLongview("&euro;1,550"),
        },
      }),
      geocodeFetcher: noGeocode,
    });
    expect(store.applications).toEqual([application]);
    // The job's store has no way to reach applications at all.
    expect(Object.keys(store)).not.toContain("upsertApplications");
  });

  it("re-reads open listings daily, skips unchanged closed ones and never alerts twice", async () => {
    const store = new MemoryHousingStore();
    await runHousingDaily(context(DAY1).ctx, {
      store,
      fetcher: site(),
      geocodeFetcher: noGeocode,
    });
    const fetcher = site();
    const run = context(DAY2);
    const result = await runHousingDaily(run.ctx, {
      store,
      fetcher,
      geocodeFetcher: noGeocode,
    });

    expect(result.newListings).toBe(0);
    expect(result.changed).toBe(0);
    expect(store.observations).toHaveLength(10);
    const fetchedListings = fetcher.calls.filter(
      (u) => u !== CALENDAR_URL && /\/rent\/[a-z0-9-]+\/$/.test(u),
    );
    expect(fetchedListings.sort()).toEqual(
      ["harmen", "long", "sidings", "woodbrook1"].map(listingUrl).sort(),
    );
    expect(store.byExternalId("griffin").last_seen_at).toBe(
      new Date(DAY2).toISOString(),
    );
    expect(store.notifications).toHaveLength(2);
    expect(run.summary).toBe("10 listings checked · 1 match · 0 new");
  });

  it("writes an observation with a change summary when a listing changes", async () => {
    const store = new MemoryHousingStore();
    await runHousingDaily(context(DAY1).ctx, {
      store,
      fetcher: site(),
      geocodeFetcher: noGeocode,
    });
    await runHousingDaily(context(DAY2).ctx, {
      store,
      fetcher: site({
        [listingUrl("long")]: {
          status: 200,
          text: openLongview("&euro;1,550"),
        },
      }),
      geocodeFetcher: noGeocode,
    });
    const history = store.observations.filter(
      (o) => o.listing_id === store.byExternalId("long").id,
    );
    expect(history).toHaveLength(2);
    expect(history[1].change_summary).toEqual([
      "Rent for four bedroom home changed €1,594 → €1,550",
    ]);
    expect(store.byExternalId("long").min_matching_rent_cents).toBe(155000);
  });

  it("marks a listing unknown after 3 complete runs without it, and never deletes it", async () => {
    const store = new MemoryHousingStore();
    await runHousingDaily(context(DAY1).ctx, {
      store,
      fetcher: site(),
      geocodeFetcher: noGeocode,
    });
    const withoutHarmen = {
      [INDEX_URL]: {
        status: 200,
        text: fixture("mini-index-page-1.html")
          .replace(
            /<article class="property[^"]*"><h3>Harman.*?<\/article>/s,
            "",
          )
          .replace("of 10 properties", "of 9 properties"),
      },
      [`${INDEX_URL}?page=2`]: {
        status: 200,
        text: fixture("mini-index-page-2.html").replace(
          "of 10 properties",
          "of 9 properties",
        ),
      },
      [CALENDAR_URL]: {
        status: 200,
        text: fixture("mini-calendar.html").replace(
          /<li><a href="\/rent\/harmen\/">.*?<\/li>/g,
          "",
        ),
      },
    };
    for (const [day, missed] of [
      [DAY2, 1],
      [DAY3, 2],
    ] as const) {
      await runHousingDaily(context(day).ctx, {
        store,
        fetcher: site(withoutHarmen),
        geocodeFetcher: noGeocode,
      });
      expect(store.byExternalId("harmen")).toMatchObject({
        missed_runs: missed,
        status: "open",
      });
    }
    await runHousingDaily(context(DAY4).ctx, {
      store,
      fetcher: site(withoutHarmen),
      geocodeFetcher: noGeocode,
    });
    expect(store.byExternalId("harmen")).toMatchObject({
      missed_runs: 3,
      status: "unknown",
    });
    expect(store.byExternalId("harmen").missing_note).toMatch(
      /No longer listed/,
    );
    expect(store.listings.size).toBe(10);
  });

  it("doesn't count misses when the list couldn't be read completely", async () => {
    const store = new MemoryHousingStore();
    await runHousingDaily(context(DAY1).ctx, {
      store,
      fetcher: site(),
      geocodeFetcher: noGeocode,
    });
    const run = context(DAY2);
    const result = await runHousingDaily(run.ctx, {
      store,
      fetcher: site({
        [`${INDEX_URL}?page=2`]: { status: 500, text: "" },
        [CALENDAR_URL]: { status: 500, text: "" },
      }),
      geocodeFetcher: noGeocode,
    });
    expect(result.discoveryComplete).toBe(false);
    expect(run.summary).toContain("list incomplete");
    expect(
      run.sources.filter((s) => s.status === "failed").map((s) => s.source),
    ).toEqual(["newstarterhomes.ie list", "newstarterhomes.ie calendar"]);
    expect(store.byExternalId("allmans-view").missed_runs).toBe(0);
  });

  it("fails loudly when the list page loads but no listings can be read", async () => {
    const store = new MemoryHousingStore();
    const run = context(DAY1);
    await expect(
      runHousingDaily(run.ctx, {
        store,
        fetcher: site({ [INDEX_URL]: "index-page-18-empty.html" }),
        geocodeFetcher: noGeocode,
      }),
    ).rejects.toThrow(/no listings/);
    expect(run.sources).toEqual([
      expect.objectContaining({
        status: "failed",
        itemsSeen: 0,
        httpStatus: 200,
      }),
    ]);
    expect(store.listings.size).toBe(0);
    expect(store.notifications).toEqual([
      expect.objectContaining({
        kind: "housing.check_failed",
        severity: "critical",
      }),
    ]);
  });

  it("fails loudly when the site is down", async () => {
    const store = new MemoryHousingStore();
    const run = context(DAY1);
    await expect(
      runHousingDaily(run.ctx, {
        store,
        fetcher: site({ [INDEX_URL]: { status: 503, text: "" } }),
        geocodeFetcher: noGeocode,
      }),
    ).rejects.toThrow(/HTTP 503/);
    expect(store.notifications).toHaveLength(1);
  });

  it("records listing pages that fail without losing the rest", async () => {
    const store = new MemoryHousingStore();
    const run = context(DAY1);
    await runHousingDaily(run.ctx, {
      store,
      fetcher: site({ [listingUrl("harmen")]: { status: 500, text: "" } }),
      geocodeFetcher: noGeocode,
    });
    expect(store.listings.size).toBe(9);
    const batch = run.sources.find((s) =>
      s.source.startsWith("newstarterhomes.ie listings"),
    )!;
    expect(batch).toMatchObject({ status: "failed", itemsSeen: 9 });
    expect(batch.error).toContain("harmen (HTTP 500)");
  });

  it("geocodes listings without a map pin once, politely", async () => {
    const store = new MemoryHousingStore();
    const geocodeFetcher = vi.fn<Fetcher>(async () => ({
      status: 200,
      text: JSON.stringify([{ lat: "53.2205", lon: "-6.1147" }]),
    }));
    const noPin = {
      [listingUrl("woodbrook1")]: {
        status: 200,
        text: fixture("listing-woodbrook1.html").replace(
          /data-center="[^"]*"/,
          "",
        ),
      },
    };
    const run = context(DAY1);
    await runHousingDaily(run.ctx, {
      store,
      fetcher: site(noPin),
      geocodeFetcher,
    });
    expect(geocodeFetcher).toHaveBeenCalledTimes(1);
    expect(new URL(geocodeFetcher.mock.calls[0][0]).searchParams.get("q")).toBe(
      "Shankill, County Dublin, Ireland",
    );
    expect(store.byExternalId("woodbrook1")).toMatchObject({
      latitude: 53.2205,
      longitude: -6.1147,
      geocode_source: "osm",
      geocode_query: "Shankill, County Dublin, Ireland",
    });
    expect(run.sources.at(-1)).toMatchObject({
      source: "Nominatim geocoding",
      status: "ok",
      itemsSeen: 1,
    });

    await runHousingDaily(context(DAY2).ctx, {
      store,
      fetcher: site(noPin),
      geocodeFetcher,
    });
    expect(geocodeFetcher).toHaveBeenCalledTimes(1);
    expect(store.byExternalId("woodbrook1").geocode_source).toBe("osm");
  });
});
