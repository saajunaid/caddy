import { describe, expect, it } from "vitest";
import { isDisplayable, selectNearby } from "./nearby";
import type { StoredPlace } from "./types";

const home = { latitude: 52.6738, longitude: -8.553 };
const now = new Date("2026-10-21T08:00:00Z");
const north = (m: number) => home.latitude + m / 111_195;

let n = 0;
function place(over: Partial<StoredPlace> & { metres?: number }): StoredPlace {
  n += 1;
  const { metres = 100, ...rest } = over;
  return {
    id: `p${String(n).padStart(3, "0")}`,
    source: "osm",
    sourceId: `node/${n}`,
    category: "bus",
    name: `Stop ${n}`,
    latitude: north(metres),
    longitude: home.longitude,
    address: null,
    details: { ref: String(n) },
    householdId: null,
    fetchedAt: "2026-10-01T00:00:00Z",
    refreshAfter: "2026-10-31T00:00:00Z",
    ...rest,
  };
}

const group = (groups: ReturnType<typeof selectNearby>, key: string) =>
  groups.find((g) => g.key === key)!;

describe("selectNearby", () => {
  it("returns every category in display order", () => {
    expect(selectNearby(home, [], new Map(), now).map((g) => g.key)).toEqual([
      "childcare",
      "primary",
      "secondary",
      "higher",
      "bus",
      "mosque",
      "halal",
    ]);
  });

  it("keeps the nearest 5 bus stops within 500 m, sorted by distance", () => {
    const stops = [450, 50, 300, 600, 120, 200, 400].map((metres) =>
      place({ metres }),
    );
    const bus = group(selectNearby(home, stops, new Map(), now), "bus");
    expect(bus.items.map((p) => Math.round(p.distanceM))).toEqual([
      50, 120, 200, 300, 400,
    ]);
    expect(bus.withinRadius).toBe(6);
    expect(bus.items[0].walkMin).toBe(1);
  });

  it("shows unknown-level schools under both Primary and Secondary", () => {
    const school = place({
      category: "school",
      name: "Saint Vincent's School",
      details: {},
      metres: 1000,
    });
    const groups = selectNearby(home, [school], new Map(), now);
    expect(group(groups, "primary").items).toHaveLength(1);
    expect(group(groups, "secondary").items).toHaveLength(1);
  });

  it("uses each category's radius", () => {
    const groups = selectNearby(
      home,
      [
        place({
          category: "primary",
          name: "Scoil A",
          details: {},
          metres: 2500,
        }),
        place({
          category: "secondary",
          name: "College B",
          details: {},
          metres: 2500,
        }),
        place({ category: "higher", name: "Uni C", details: {}, metres: 9000 }),
      ],
      new Map(),
      now,
    );
    expect(group(groups, "primary").items).toHaveLength(0);
    expect(group(groups, "secondary").items).toHaveLength(1);
    expect(group(groups, "higher").items).toHaveLength(1);
  });

  it("moves hidden places to the hidden list and always shows pinned ones", () => {
    const stops = [10, 20, 30, 40, 50, 60].map((metres) => place({ metres }));
    const far = place({ metres: 3000 });
    const marks = new Map([
      [stops[0].id, { mark: "hidden" as const, note: null }],
      [far.id, { mark: "pinned" as const, note: "Express bus" }],
    ]);
    const bus = group(selectNearby(home, [...stops, far], marks, now), "bus");
    expect(bus.hidden.map((p) => p.id)).toEqual([stops[0].id]);
    expect(bus.items.map((p) => p.id)).toEqual([
      ...stops.slice(1).map((p) => p.id),
      far.id,
    ]);
    expect(bus.items.at(-1)?.note).toBe("Express bus");
  });

  it("shows the household's own places beyond the radius, up to 10 km", () => {
    const own = place({
      source: "user",
      sourceId: null,
      householdId: "h",
      category: "halal",
      name: "Our butcher",
      metres: 7000,
      details: {},
    });
    const tooFar = {
      ...own,
      id: "far",
      name: "Other",
      latitude: north(12_000),
    };
    const halal = group(
      selectNearby(home, [own, tooFar], new Map(), now),
      "halal",
    );
    expect(halal.items.map((p) => p.name)).toEqual(["Our butcher"]);
    expect(halal.withinRadius).toBe(0);
  });

  it("drops expired Google rows and long-stale OSM rows", () => {
    const groups = selectNearby(
      home,
      [
        place({ source: "google", refreshAfter: "2026-10-20T00:00:00Z" }),
        place({ refreshAfter: "2026-09-01T00:00:00Z" }),
        place({ refreshAfter: "2026-10-01T00:00:00Z" }),
      ],
      new Map(),
      now,
    );
    expect(group(groups, "bus").items).toHaveLength(1);
  });
});

describe("isDisplayable", () => {
  it("follows each source's rule", () => {
    expect(isDisplayable({ source: "user", refreshAfter: null }, now)).toBe(
      true,
    );
    expect(
      isDisplayable(
        { source: "google", refreshAfter: "2026-10-22T00:00:00Z" },
        now,
      ),
    ).toBe(true);
    expect(
      isDisplayable(
        { source: "google", refreshAfter: "2026-10-21T07:59:00Z" },
        now,
      ),
    ).toBe(false);
    expect(
      isDisplayable(
        { source: "osm", refreshAfter: "2026-09-22T00:00:00Z" },
        now,
      ),
    ).toBe(true);
    expect(
      isDisplayable(
        { source: "osm", refreshAfter: "2026-09-20T00:00:00Z" },
        now,
      ),
    ).toBe(false);
  });
});
