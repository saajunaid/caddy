import { describe, expect, it } from "vitest";
import { activeSources } from "./sources";

describe("activeSources", () => {
  it("uses Google when a key is set, OpenStreetMap only as a fallback or opt-in", () => {
    expect(activeSources("k", {})).toEqual(["google"]);
    expect(activeSources(null, {})).toEqual(["osm"]);
    expect(activeSources("k", { PLACES_USE_OSM: "1" })).toEqual([
      "osm",
      "google",
    ]);
  });
});
