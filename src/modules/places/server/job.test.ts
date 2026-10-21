import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";
import type { JobContext, SourceCheck } from "../../../server/jobs/runner";
import type { Anchor } from "./geo";
import { GOOGLE_MAX_CALLS_PER_RUN } from "./google";
import { createPlacesRefreshJob, MAX_ANCHORS_PER_RUN } from "./job";
import { searchCell } from "./refresh";
import {
  argOf,
  fakeSupabase,
  has,
  type FakeQuery,
} from "./testing/fake-supabase";

const castletroy = readFileSync(
  path.resolve(
    process.cwd(),
    "tests/fixtures/overpass/castletroy-limerick.json",
  ),
  "utf8",
);
const now = new Date("2026-10-21T06:00:00Z");

function anchors(count: number): Anchor[] {
  return Array.from({ length: count }, (_, i) => ({
    key: `housing:${i}`,
    label: `Home ${i}`,
    latitude: 52.6 + i * 0.01,
    longitude: -8.55,
  }));
}

function setup(options: {
  anchors: Anchor[];
  searches?: Record<string, unknown>[];
  googleKey?: string | null;
}) {
  const { client, queries } = fakeSupabase((q: FakeQuery) => {
    if (q.table === "place_searches" && has(q, "select") && !has(q, "upsert")) {
      return { data: options.searches ?? [] };
    }
    if (q.table === "places" && has(q, "delete")) return { data: [] };
    return { data: null };
  });
  const fetch = vi.fn<(url: string, init?: RequestInit) => Promise<Response>>(
    async (url) =>
      url.includes("googleapis")
        ? Response.json({
            places: [
              {
                id: "g1",
                displayName: { text: "Halal Grill" },
                location: { latitude: 52.6, longitude: -8.55 },
              },
            ],
          })
        : new Response(castletroy, {
            headers: { "content-type": "application/json" },
          }),
  );
  const sleep = vi.fn(() => Promise.resolve());
  const job = createPlacesRefreshJob({
    anchors: async () => options.anchors,
    fetch: fetch as unknown as typeof globalThis.fetch,
    googleApiKey: () => options.googleKey ?? null,
    sleep,
    overpassMirrors: ["https://overpass.example/api/interpreter"],
  });
  const checks: SourceCheck[] = [];
  let summary = "";
  const ctx = {
    runId: "run",
    admin: client,
    now,
    recordSource: async (c: SourceCheck) => {
      checks.push(c);
    },
    setSummary: (s: string) => {
      summary = s;
    },
    setStats: () => {},
  } as unknown as JobContext;
  return {
    run: () => job.run(ctx, client as never),
    job,
    queries,
    fetch,
    sleep,
    checks,
    summary: () => summary,
  };
}

describe("places-refresh job", () => {
  it("is a daily job keyed by the Dublin date", () => {
    const { job } = setup({ anchors: [] });
    expect(job.group).toBe("daily");
    expect(job.idempotencyKey(new Date("2026-10-21T23:30:00Z"))).toBe(
      "places-refresh:2026-10-22",
    );
  });

  it("looks up due homes, stores places and logs each search and source", async () => {
    const t = setup({ anchors: anchors(2) });
    await t.run();
    const upserts = t.queries.filter(
      (q) => q.table === "places" && has(q, "upsert"),
    );
    expect(upserts).toHaveLength(2);
    const rows = argOf(upserts[0], "upsert") as Record<string, unknown>[];
    expect(rows.length).toBeGreaterThan(20);
    const searches = t.queries.filter(
      (q) => q.table === "place_searches" && has(q, "upsert"),
    );
    expect(
      searches.map((q) => (argOf(q, "upsert") as { status: string }).status),
    ).toEqual(["ok", "ok"]);
    expect(t.checks.map((c) => c.status)).toEqual(["ok", "ok"]);
    expect(t.checks[0].source).toBe("overpass · housing:0");
    expect(t.sleep).toHaveBeenCalledWith(1000);
    expect(t.summary()).toBe("Looked up 2 of 2 homes");
  });

  it("never writes household data: only global source rows, never marks or user places", async () => {
    const t = setup({ anchors: anchors(1), googleKey: "key" });
    await t.run();
    expect(t.queries.some((q) => q.table === "household_place_marks")).toBe(
      false,
    );
    for (const q of t.queries.filter(
      (q) => q.table === "places" && has(q, "upsert"),
    )) {
      for (const row of argOf(q, "upsert") as Record<string, unknown>[]) {
        expect(row.household_id).toBeNull();
        expect(row.source).not.toBe("user");
      }
    }
    // The only delete is the Google cache purge, restricted to Google rows.
    const deletes = t.queries.filter(
      (q) => q.table === "places" && has(q, "delete"),
    );
    expect(deletes).toHaveLength(1);
    expect(deletes[0].calls).toContainEqual({
      method: "eq",
      args: ["source", "google"],
    });
  });

  it("skips homes searched recently and records the skip", async () => {
    const [home] = anchors(1);
    const cell = searchCell(home);
    const t = setup({
      anchors: [home],
      searches: [
        {
          source: "osm",
          latitude: cell.latitude,
          longitude: cell.longitude,
          status: "ok",
          searched_at: "2026-10-10T00:00:00Z",
          last_success_at: "2026-10-10T00:00:00Z",
        },
      ],
    });
    await t.run();
    expect(t.fetch).not.toHaveBeenCalled();
    expect(t.checks).toEqual([
      {
        source: "overpass",
        status: "skipped",
        error: "No home is due a lookup",
      },
    ]);
    expect(t.summary()).toBe("All 1 homes up to date");
  });

  it(`looks up at most ${MAX_ANCHORS_PER_RUN} homes per run`, async () => {
    const t = setup({ anchors: anchors(20) });
    await t.run();
    expect(t.fetch).toHaveBeenCalledTimes(MAX_ANCHORS_PER_RUN);
  });

  it("uses Google for every category instead of OpenStreetMap, capped at 70 calls per run", async () => {
    const t = setup({ anchors: anchors(15), googleKey: "key" });
    await t.run();
    const calls = t.fetch.mock.calls.map(([url]) => String(url));
    expect(calls.every((url) => url.includes("googleapis"))).toBe(true);
    expect(calls).toHaveLength(70);
    const queries = t.fetch.mock.calls.map(
      ([, init]) => JSON.parse(String(init?.body)).textQuery,
    );
    expect(new Set(queries).size).toBe(7);
    expect(GOOGLE_MAX_CALLS_PER_RUN).toBe(70);
  });

  it("fails the run loudly when the anchor source is unavailable", async () => {
    const { client } = fakeSupabase();
    const job = createPlacesRefreshJob({
      anchors: async () => {
        throw new Error(
          "Couldn't read housing listings: relation does not exist",
        );
      },
    });
    await expect(
      job.run({ now } as unknown as JobContext, client as never),
    ).rejects.toThrow(/housing listings/);
  });
});
