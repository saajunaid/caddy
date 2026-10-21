import { describe, expect, it } from "vitest";
import { describePlace } from "./describe";

const base = { source: "osm" as const, address: null, details: {} };

describe("describePlace", () => {
  it("shows stop numbers and routes for bus stops", () => {
    expect(
      describePlace({
        ...base,
        category: "bus",
        details: { ref: "7104", routes: "304;304A" },
      }),
    ).toBe("Stop 7104 · Routes 304, 304A");
    expect(
      describePlace({ ...base, category: "bus", details: { routes: "323" } }),
    ).toBe("Route 323");
  });

  it("says when a school's level isn't stated", () => {
    expect(describePlace({ ...base, category: "school" })).toBe(
      "School (level not stated)",
    );
  });

  it("explains why a place is listed as halal", () => {
    expect(
      describePlace({
        ...base,
        category: "halal",
        details: { halal: "yes", cuisine: "turkish;kebab" },
      }),
    ).toBe("Tagged halal (diet:halal=yes) · turkish, kebab");
  });

  it("marks Google results as search matches and shows your own notes", () => {
    expect(
      describePlace({
        ...base,
        source: "google",
        category: "halal",
        details: { kind: "Google search match: “halal restaurant”" },
      }),
    ).toBe("Google search match: “halal restaurant”");
    expect(
      describePlace({
        ...base,
        source: "user",
        category: "halal",
        details: { note: "Certified halal" },
      }),
    ).toBe("Certified halal");
  });

  it("falls back to the address, or nothing", () => {
    expect(
      describePlace({ ...base, category: "mosque", address: "Dock Road" }),
    ).toBe("Dock Road");
    expect(describePlace({ ...base, category: "mosque" })).toBe("");
  });
});
