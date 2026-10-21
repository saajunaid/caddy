import { describe, expect, it, vi } from "vitest";
import { lookupAnchor } from "./lookup";
import type { Admin } from "./store";
import { argOf, fakeSupabase, has } from "./testing/fake-supabase";

const home = {
  key: "geo:52.674,-8.553",
  label: "Home",
  latitude: 52.6738,
  longitude: -8.553,
};
const now = new Date("2026-10-21T06:00:00Z");

const googleAnswer = () =>
  Response.json({
    places: [
      {
        id: "g1",
        displayName: { text: "Halal Grill" },
        location: { latitude: 52.674, longitude: -8.554 },
      },
    ],
  });

describe("lookupAnchor", () => {
  it("skips Google without a key", async () => {
    const { client } = fakeSupabase();
    const outcomes = await lookupAnchor(
      client as unknown as Admin,
      home,
      ["google"],
      {
        googleApiKey: null,
        now,
      },
    );
    expect(outcomes).toEqual([
      {
        source: "google",
        status: "skipped",
        error: "GOOGLE_PLACES_API_KEY not set",
      },
    ]);
  });

  it("stops calling Google when the run's budget is spent", async () => {
    const { client, queries } = fakeSupabase();
    const fetch = vi.fn(async () => googleAnswer());
    const budget = { remaining: 1 };
    const outcomes = await lookupAnchor(
      client as unknown as Admin,
      home,
      ["google"],
      {
        googleApiKey: "k",
        googleBudget: budget,
        fetch: fetch as unknown as typeof globalThis.fetch,
        now,
      },
    );
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(budget.remaining).toBe(0);
    expect(outcomes.map((o) => [o.source, o.status])).toEqual([
      ["google:childcare", "ok"],
      ["google:primary", "skipped"],
      ["google:secondary", "skipped"],
      ["google:higher", "skipped"],
      ["google:bus", "skipped"],
      ["google:mosque", "skipped"],
      ["google:halal", "skipped"],
    ]);
    // An incomplete Google search isn't logged as done, so it's retried later.
    expect(queries.some((q) => q.table === "place_searches")).toBe(false);
  });

  it("stores Google rows with a 30-day refresh date", async () => {
    const { client, queries } = fakeSupabase();
    await lookupAnchor(client as unknown as Admin, home, ["google"], {
      googleApiKey: "k",
      fetch: (async () => googleAnswer()) as unknown as typeof fetch,
      now,
    });
    const upsert = queries.find(
      (q) => q.table === "places" && has(q, "upsert"),
    )!;
    const [row] = argOf(upsert, "upsert") as Record<string, unknown>[];
    expect(row).toMatchObject({
      source: "google",
      source_id: "g1",
      household_id: null,
      refresh_after: "2026-11-20T06:00:00.000Z",
    });
    const search = queries.find((q) => q.table === "place_searches")!;
    expect(argOf(search, "upsert")).toMatchObject({
      source: "google",
      status: "ok",
      latitude: 52.674,
      longitude: -8.553,
      last_success_at: now.toISOString(),
    });
  });

  it("logs a failed Overpass search without touching the last success date", async () => {
    const { client, queries } = fakeSupabase();
    const outcomes = await lookupAnchor(
      client as unknown as Admin,
      home,
      ["osm"],
      {
        fetch: (async () =>
          new Response("busy", { status: 429 })) as unknown as typeof fetch,
        overpassMirrors: ["https://a.example"],
        now,
      },
    );
    expect(outcomes[0]).toMatchObject({
      source: "overpass",
      status: "failed",
      busy: true,
    });
    expect(queries.some((q) => q.table === "places")).toBe(false);
    const row = argOf(
      queries.find((q) => q.table === "place_searches")!,
      "upsert",
    ) as Record<string, unknown>;
    expect(row.status).toBe("failed");
    expect("last_success_at" in row).toBe(false);
  });
});
