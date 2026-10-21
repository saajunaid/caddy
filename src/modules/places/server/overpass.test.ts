import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";
import { buildOverpassQuery, fetchOverpass, parseOverpass } from "./overpass";

// Real Overpass response for Castletroy, Limerick (52.6738, -8.5530), saved October 2026.
const castletroy = JSON.parse(
  readFileSync(
    path.resolve(
      process.cwd(),
      "tests/fixtures/overpass/castletroy-limerick.json",
    ),
    "utf8",
  ),
);
const center = { latitude: 52.6738, longitude: -8.553 };
const noSleep = () => Promise.resolve();

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });

describe("buildOverpassQuery", () => {
  it("covers every category with its radius plus a margin", () => {
    const q = buildOverpassQuery(center);
    expect(q).toContain("[out:json][timeout:25];");
    expect(q).toContain(
      'nwr["amenity"~"^(kindergarten|childcare)$"](around:2150,52.673800,-8.553000);',
    );
    expect(q).toContain('nwr["amenity"="school"](around:3150,');
    expect(q).toContain(
      'nwr["amenity"~"^(university|college)$"](around:10150,',
    );
    expect(q).toContain('node["highway"="bus_stop"](around:650,');
    expect(q).toContain('["religion"="muslim"](around:5150,');
    expect(q).toContain('nwr["diet:halal"~"^(yes|only)$"]');
    expect(q).toContain('nwr["cuisine"~"halal",i]');
    expect(q).toContain("out tags center;");
  });
});

describe("parseOverpass (real Castletroy fixture)", () => {
  const parsed = parseOverpass(castletroy);

  it("classifies every element", () => {
    expect(parsed.elements).toBe(castletroy.elements.length);
    expect(parsed.candidates).toHaveLength(castletroy.elements.length);
  });

  it("uses node coordinates or way/relation centres", () => {
    const ul = parsed.candidates.find(
      (c) => c.name === "University of Limerick",
    );
    expect(ul?.sourceId).toMatch(/^way\//);
    expect(ul?.category).toBe("higher");
    expect(ul?.latitude).toBeGreaterThan(52.6);
  });

  it("splits schools into primary, secondary and unknown level", () => {
    const level = (name: string) =>
      parsed.candidates.find((c) => c.name === name)?.category;
    expect(level("Lisnagry National School")).toBe("primary");
    expect(level("Milford National School")).toBe("primary");
    expect(level("Castletroy College")).toBe("secondary");
    expect(level("Limerick Educate Together Secondary School")).toBe(
      "secondary",
    );
    expect(level("Saint Vincent's School")).toBe("school");
  });

  it("keeps bus stop numbers and names unnamed stops honestly", () => {
    const stop = parsed.candidates.find((c) => c.name === "Plassey Park Road");
    expect(stop).toMatchObject({ category: "bus", details: { ref: "607651" } });
    expect(
      parsed.candidates.filter((c) => c.name === "Bus stop (name not stated)"),
    ).toHaveLength(2);
  });

  it("finds childcare", () => {
    expect(
      parsed.candidates
        .filter((c) => c.category === "childcare")
        .map((c) => c.name),
    ).toEqual(expect.arrayContaining(["Unikids Creche", "Karibu"]));
  });

  it("rejects things that aren't Overpass JSON", () => {
    expect(() => parseOverpass({ html: "<p>busy</p>" })).toThrow();
  });
});

describe("parseOverpass (synthetic mosque and halal fixture)", () => {
  // Hand-built: the mirrors reachable from the dev sandbox timed out on a city-centre query.
  const synthetic = JSON.parse(
    readFileSync(
      path.resolve(
        process.cwd(),
        "tests/fixtures/overpass/synthetic-mosque-halal.json",
      ),
      "utf8",
    ),
  );
  const { candidates } = parseOverpass(synthetic);
  const byName = (name: string) => candidates.find((c) => c.name === name);

  it("finds mosques and halal food, and ignores the rest", () => {
    expect(candidates.map((c) => [c.name, c.category])).toEqual([
      ["Example Islamic Centre", "mosque"],
      ["Example Mosque", "mosque"],
      ["Example Kebab House", "halal"],
      ["Example Burger Bar", "halal"],
      ["Example Halal Butchers", "halal"],
    ]);
  });

  it("records how we know a place is halal", () => {
    expect(byName("Example Kebab House")?.details).toMatchObject({
      halal: "yes",
      openingHours: "Mo-Su 12:00-23:00",
    });
    expect(byName("Example Kebab House")?.address).toBe(
      "Example Street, Limerick",
    );
    expect(byName("Example Burger Bar")?.details.halal).toBe("cuisine");
    expect(byName("Example Halal Butchers")?.details.halal).toBe("name");
    expect(byName("Example Islamic Centre")?.details.denomination).toBe(
      "sunni",
    );
  });
});

describe("parseOverpass (real timeout answer)", () => {
  // Real response from a busy mirror (Ballincollig, Cork): HTTP 200, no elements, error remark.
  const timeout = JSON.parse(
    readFileSync(
      path.resolve(
        process.cwd(),
        "tests/fixtures/overpass/ballincollig-timeout-remark.json",
      ),
      "utf8",
    ),
  );

  it("is reported as a busy failure, never as zero places", async () => {
    expect(parseOverpass(timeout).remark).toMatch(/runtime error/);
    const result = await fetchOverpass(center, {
      fetch: (async () => json(timeout)) as unknown as typeof fetch,
      mirrors: ["https://a.example"],
    });
    expect(result).toMatchObject({
      status: "failed",
      busy: true,
      itemsSeen: 0,
    });
    expect(result.error).toMatch(/timed out/);
  });
});

describe("fetchOverpass", () => {
  it("sends an identifying User-Agent and returns places", async () => {
    const fetch = vi.fn(async () => json(castletroy));
    const result = await fetchOverpass(center, {
      fetch: fetch as unknown as typeof globalThis.fetch,
      mirrors: ["https://a.example/api/interpreter"],
    });
    expect(result.status).toBe("ok");
    expect(result.itemsSeen).toBe(castletroy.elements.length);
    const init = fetch.mock.calls[0] as unknown as [string, RequestInit];
    expect((init[1].headers as Record<string, string>)["user-agent"]).toMatch(
      /^Caddy\//,
    );
    expect(String(init[1].body)).toContain("data=");
  });

  it("falls back to the next mirror when one is busy or broken", async () => {
    const fetch = vi
      .fn()
      .mockResolvedValueOnce(new Response("Too many requests", { status: 429 }))
      .mockRejectedValueOnce(new TypeError("fetch failed"))
      .mockResolvedValueOnce(json(castletroy));
    const sleep = vi.fn(noSleep);
    const result = await fetchOverpass(center, {
      fetch,
      sleep,
      mirrors: ["https://a.example", "https://b.example", "https://c.example"],
    });
    expect(result).toMatchObject({ status: "ok", url: "https://c.example" });
    expect(fetch).toHaveBeenCalledTimes(3);
    expect(sleep).toHaveBeenCalledWith(1000);
  });

  it("treats an empty answer as a failure, not zero results", async () => {
    const fetch = vi.fn(async () => json({ version: 0.6, elements: [] }));
    const result = await fetchOverpass(center, {
      fetch: fetch as unknown as typeof globalThis.fetch,
      mirrors: ["https://a.example"],
      sleep: noSleep,
    });
    expect(result.status).toBe("failed");
    expect(result.error).toMatch(/no places/);
  });

  it("treats a runtime-error remark as busy", async () => {
    const fetch = vi.fn(async () =>
      json({
        elements: [],
        remark:
          'runtime error: Query timed out in "query" at line 3 after 26 seconds.',
      }),
    );
    const result = await fetchOverpass(center, {
      fetch: fetch as unknown as typeof globalThis.fetch,
      mirrors: ["https://a.example"],
    });
    expect(result).toMatchObject({ status: "failed", busy: true });
  });

  it("reports the last failure when every mirror fails", async () => {
    const fetch = vi.fn(async () => new Response("down", { status: 504 }));
    const result = await fetchOverpass(center, {
      fetch: fetch as unknown as typeof globalThis.fetch,
      mirrors: ["https://a.example", "https://b.example"],
      sleep: noSleep,
    });
    expect(result).toMatchObject({
      status: "failed",
      httpStatus: 504,
      busy: true,
      url: "https://b.example",
    });
  });
});
