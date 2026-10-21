import { describe, expect, it } from "vitest";
import { dedupePlaces, isDuplicate, namesSimilar, nameTokens } from "./dedupe";
import type { StoredPlace } from "./types";

let n = 0;
function place(over: Partial<StoredPlace>): StoredPlace {
  n += 1;
  return {
    id: over.id ?? `p${String(n).padStart(3, "0")}`,
    source: "osm",
    sourceId: `node/${n}`,
    category: "halal",
    name: "Al-Noor Grill",
    latitude: 52.67,
    longitude: -8.55,
    address: null,
    details: {},
    householdId: null,
    fetchedAt: "2026-10-01T00:00:00Z",
    refreshAfter: "2026-10-31T00:00:00Z",
    ...over,
  };
}

// ~0.0001° latitude ≈ 11 m.
const north = (m: number) => 52.67 + m / 111_195;

describe("names", () => {
  it("normalises names", () => {
    expect(nameTokens("St. Brigid's N.S.")).toEqual(["saint", "brigids", "ns"]);
    expect(nameTokens("The Al-Noor Grill & Kebab")).toEqual([
      "al",
      "noor",
      "grill",
      "kebab",
    ]);
  });

  it.each([
    ["Al-Noor Grill", "Al Noor Grill", true],
    ["Al-Noor Grill", "Al Noor Grill & Kebab House", true],
    ["Castletroy College", "Castletroy Community College", true],
    ["St Brigid's", "Saint Brigid's", true],
    ["Coláiste Iósaef", "Colaiste Iosaef", true],
    ["Al-Noor Grill", "Bosphorus Kebab", false],
    ["Scoil Mhuire", "Scoil Íde", false],
    ["Grill", "Al-Noor Grill", false],
  ])("%s ~ %s → %s", (a, b, similar) => {
    expect(namesSimilar(a, b)).toBe(similar);
  });
});

describe("isDuplicate", () => {
  it("needs the same kind, a similar name and ≤75 m", () => {
    const a = place({});
    expect(isDuplicate(a, place({ latitude: north(70) }))).toBe(true);
    expect(
      isDuplicate(
        a,
        place({ latitude: north(80), name: "Al Noor Grill & Kebab" }),
      ),
    ).toBe(false);
    expect(isDuplicate(a, place({ category: "mosque" }))).toBe(false);
    expect(isDuplicate(a, place({ name: "Bosphorus Kebab" }))).toBe(false);
  });

  it("merges parts of one campus with the identical name up to 1 km", () => {
    const a = place({ category: "higher", name: "University of Limerick" });
    const b = place({
      category: "higher",
      name: "University of Limerick",
      latitude: north(600),
    });
    expect(isDuplicate(a, b)).toBe(true);
  });

  it("keeps bus stops with different stop numbers apart", () => {
    const a = place({
      category: "bus",
      name: "Plassey Park Road",
      details: { ref: "1" },
    });
    const b = place({
      category: "bus",
      name: "Plassey Park Road",
      details: { ref: "2" },
      latitude: north(20),
    });
    expect(isDuplicate(a, b)).toBe(false);
  });

  it("matches an unknown-level school with an official primary school", () => {
    const osm = place({ category: "school", name: "Scoil Mhuire" });
    const official = place({
      source: "official",
      category: "primary",
      name: "Scoil Mhuire NS",
    });
    expect(isDuplicate(osm, official)).toBe(true);
  });
});

describe("dedupePlaces", () => {
  it("prefers user > official > google > osm", () => {
    const osm = place({ source: "osm" });
    const google = place({ source: "google", latitude: north(20) });
    const official = place({ source: "official", latitude: north(40) });
    const merged = dedupePlaces([osm, google, official], new Map());
    expect(merged).toHaveLength(1);
    expect(merged[0].id).toBe(official.id);
    expect(merged[0].sources).toEqual(["official", "google", "osm"]);
    expect(merged[0].mergedIds.sort()).toEqual(
      [osm.id, google.id, official.id].sort(),
    );
  });

  it("never loses a household mark from a merged duplicate", () => {
    const osm = place({ source: "osm" });
    const google = place({ source: "google" });
    const pinned = dedupePlaces(
      [osm, google],
      new Map([[osm.id, { mark: "pinned" as const, note: "Our favourite" }]]),
    );
    expect(pinned).toHaveLength(1);
    expect(pinned[0].id).toBe(google.id);
    expect(pinned[0].mark).toBe("pinned");
    expect(pinned[0].note).toBe("Our favourite");
  });

  it("lets a pin win over a hide", () => {
    const a = place({ source: "osm" });
    const b = place({ source: "google" });
    const merged = dedupePlaces(
      [a, b],
      new Map([
        [b.id, { mark: "hidden" as const, note: null }],
        [a.id, { mark: "pinned" as const, note: null }],
      ]),
    );
    expect(merged[0].mark).toBe("pinned");
  });

  it("keeps the user's own place and drops the source copy", () => {
    const user = place({ source: "user", sourceId: null, householdId: "h1" });
    const osm = place({ source: "osm", name: "Al Noor Grill" });
    const merged = dedupePlaces([osm, user], new Map());
    expect(merged.map((p) => p.id)).toEqual([user.id]);
  });

  it("keeps different places", () => {
    const merged = dedupePlaces(
      [
        place({}),
        place({ name: "Bosphorus Kebab" }),
        place({ category: "mosque" }),
      ],
      new Map(),
    );
    expect(merged).toHaveLength(3);
  });
});
