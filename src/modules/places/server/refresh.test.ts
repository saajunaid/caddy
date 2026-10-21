import { describe, expect, it } from "vitest";
import {
  isSearchDue,
  searchCell,
  selectDueAnchors,
  type SearchState,
} from "./refresh";

const now = new Date("2026-10-21T06:00:00Z");
const daysAgo = (d: number) =>
  new Date(now.getTime() - d * 86_400_000).toISOString();
const ok = (d: number): SearchState => ({
  status: "ok",
  searchedAt: daysAgo(d),
  lastSuccessAt: daysAgo(d),
});

describe("isSearchDue", () => {
  it("is due when never searched", () => {
    expect(isSearchDue(null, "osm", now)).toBe(true);
  });

  it("refreshes OSM after 30 days and Google after 25", () => {
    expect(isSearchDue(ok(29), "osm", now)).toBe(false);
    expect(isSearchDue(ok(30), "osm", now)).toBe(true);
    expect(isSearchDue(ok(24), "google", now)).toBe(false);
    expect(isSearchDue(ok(25), "google", now)).toBe(true);
  });

  it("backs off after a recent failure, then retries", () => {
    const failedRecently: SearchState = {
      status: "failed",
      searchedAt: new Date(now.getTime() - 3_600_000).toISOString(),
      lastSuccessAt: null,
    };
    expect(isSearchDue(failedRecently, "osm", now)).toBe(false);
    expect(
      isSearchDue({ ...failedRecently, searchedAt: daysAgo(1) }, "osm", now),
    ).toBe(true);
  });

  it("keeps a good result after a later failure until it's old", () => {
    const failedAfterOk: SearchState = {
      status: "failed",
      searchedAt: daysAgo(2),
      lastSuccessAt: daysAgo(10),
    };
    expect(isSearchDue(failedAfterOk, "osm", now)).toBe(false);
  });
});

describe("selectDueAnchors", () => {
  const anchor = (key: string, latitude: number) => ({
    key,
    label: key,
    latitude,
    longitude: -8.55,
  });

  it("skips fresh anchors, shares ~100 m cells and puts never-searched first", () => {
    const a = anchor("a", 52.1);
    const aTwin = anchor("a-twin", 52.10004); // same cell
    const b = anchor("b", 52.2);
    const c = anchor("c", 52.3);
    const d = anchor("d", 52.4);
    const searches = new Map<string, SearchState>([
      [`osm:${searchCell(b).key}`, ok(40)],
      [`osm:${searchCell(c).key}`, ok(5)],
      [`osm:${searchCell(d).key}`, ok(60)],
    ]);
    const due = selectDueAnchors(
      [a, aTwin, b, c, d],
      searches,
      ["osm"],
      now,
      15,
    );
    expect(due.map((x) => x.anchor.key)).toEqual(["a", "d", "b"]);
    expect(due[0].due).toEqual(["osm"]);
  });

  it("only asks for the sources that are due", () => {
    const a = anchor("a", 52.1);
    const searches = new Map<string, SearchState>([
      [`osm:${searchCell(a).key}`, ok(3)],
    ]);
    expect(
      selectDueAnchors([a], searches, ["osm", "google"], now, 15)[0].due,
    ).toEqual(["google"]);
  });

  it("caps the number of anchors per run", () => {
    const anchors = Array.from({ length: 20 }, (_, i) =>
      anchor(`a${i}`, 52 + i / 100),
    );
    expect(selectDueAnchors(anchors, new Map(), ["osm"], now, 15)).toHaveLength(
      15,
    );
  });
});
