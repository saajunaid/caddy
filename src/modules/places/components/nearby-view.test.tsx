import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";
import type { NearbyData, NearbyGroupData, NearbyRow } from "../queries";
import { CATEGORIES } from "../server/categories";
import { MAPLIBRE_VERSION } from "./nearby-map";
import { NearbyView } from "./nearby-view";

const setPlaceMarkAction = vi.fn(async () => ({}));
vi.mock("../actions", () => ({
  setPlaceMarkAction: (...args: unknown[]) =>
    setPlaceMarkAction(...(args as [])),
  deleteOwnPlaceAction: vi.fn(async () => ({})),
  addPlaceAction: vi.fn(async () => ({})),
  lookupNearbyAction: vi.fn(async () => ({ status: "done" })),
}));
// The map loads MapLibre from a CDN in the browser; tests cover the lists only.
vi.mock("next/dynamic", () => ({ default: () => () => null }));

const anchor = {
  key: "housing:1",
  label: "Riverside, Castletroy",
  latitude: 52.6738,
  longitude: -8.553,
};

function row(over: Partial<NearbyRow>): NearbyRow {
  return {
    id: over.id ?? "r1",
    ids: over.ids ?? [over.id ?? "r1"],
    name: "Plassey Park Road",
    detail: "Stop 607651",
    latitude: 52.67,
    longitude: -8.557,
    distanceM: 420,
    walkMin: 7,
    source: "osm",
    mark: null,
    note: null,
    own: false,
    website: null,
    ...over,
  };
}

function data(
  over: Partial<Record<string, Partial<NearbyGroupData>>> = {},
  extra: Partial<NearbyData> = {},
): NearbyData {
  return {
    groups: CATEGORIES.map((c) => ({
      key: c.key,
      items: [],
      hidden: [],
      withinRadius: 0,
      radiusM: c.radiusM,
      ...over[c.key],
    })),
    osm: {
      status: "ok",
      searchedAt: "2026-10-21T06:10:00Z",
      lastSuccessAt: "2026-10-21T06:10:00Z",
      error: null,
    },
    google: null,
    searched: true,
    canRefresh: false,
    ...extra,
  };
}

const now = "2026-10-21T09:00:00Z";

describe("NearbyView", () => {
  it("lists places with distance, walking estimate and provenance", () => {
    render(
      <NearbyView
        anchor={anchor}
        now={now}
        data={data({ bus: { items: [row({})], withinRadius: 1 } })}
      />,
    );
    const bus = screen.getByRole("region", { name: /Bus stops/ });
    expect(within(bus).getByText("Plassey Park Road")).toBeInTheDocument();
    expect(within(bus).getByText("0.4 km")).toBeInTheDocument();
    expect(within(bus).getByText("~7 min walk")).toBeInTheDocument();
    expect(within(bus).getByText("OSM")).toBeInTheDocument();
    expect(within(bus).getByText("1 within 0.5 km")).toBeInTheDocument();
    expect(
      screen.getByText(
        /Distances are straight-line estimates. Being near a school doesn't guarantee a place./,
      ),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/OpenStreetMap: checked today 07:10 · OK/),
    ).toBeInTheDocument();
  });

  it("toggles categories with the filter chips", () => {
    render(<NearbyView anchor={anchor} now={now} data={data()} />);
    expect(screen.getByRole("region", { name: /Mosques/ })).toBeInTheDocument();
    fireEvent.click(
      screen.getByRole("button", { name: /Mosques/, pressed: true }),
    );
    expect(
      screen.queryByRole("region", { name: /Mosques/ }),
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /Mosques/, pressed: false }),
    ).toBeInTheDocument();
  });

  it("collapses hidden places and says when nothing was found", () => {
    render(
      <NearbyView
        anchor={anchor}
        now={now}
        data={data({
          halal: {
            hidden: [row({ id: "h1", name: "Closed Grill", mark: "hidden" })],
          },
        })}
      />,
    );
    const halal = screen.getByRole("region", { name: /Halal food/ });
    expect(within(halal).getByText("Hidden (1)")).toBeInTheDocument();
    expect(
      within(halal).getByText(
        /None found within 5 km on the map. Maps often miss these/,
      ),
    ).toBeInTheDocument();
  });

  it("pins every merged copy of a place", async () => {
    render(
      <NearbyView
        anchor={anchor}
        now={now}
        data={data({
          bus: { items: [row({ id: "a", ids: ["a", "b"] })], withinRadius: 1 },
        })}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Pin" }));
    await waitFor(() =>
      expect(setPlaceMarkAction).toHaveBeenCalledWith(["a", "b"], "pinned"),
    );
  });

  it("offers a lookup when the area hasn't been searched", () => {
    render(
      <NearbyView
        anchor={anchor}
        now={now}
        data={data({}, { searched: false, osm: null, canRefresh: true })}
      />,
    );
    expect(
      screen.getByRole("button", { name: "Look up nearby places now" }),
    ).toBeInTheDocument();
    expect(screen.getAllByText("Not looked up yet.").length).toBe(
      CATEGORIES.length,
    );
  });

  it("opens the add-a-place form", () => {
    render(<NearbyView anchor={anchor} now={now} data={data()} />);
    fireEvent.click(
      screen.getByRole("button", { name: /Add a place you know/ }),
    );
    expect(
      screen.getByRole("form", { name: "Add a place you know" }),
    ).toBeInTheDocument();
    expect(
      screen.getByText("Tap the map to set where the new place is."),
    ).toBeInTheDocument();
  });
});

describe("MapLibre version", () => {
  it("matches the version pinned in package.json", () => {
    const pkg = JSON.parse(
      readFileSync(path.resolve(process.cwd(), "package.json"), "utf8"),
    );
    const pinned =
      pkg.dependencies?.["maplibre-gl"] ?? pkg.devDependencies?.["maplibre-gl"];
    expect(pinned).toBe(MAPLIBRE_VERSION);
  });
});
