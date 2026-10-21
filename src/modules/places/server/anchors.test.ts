import type { SupabaseClient } from "@supabase/supabase-js";
import { describe, expect, it } from "vitest";
import {
  anchorsFromHousing,
  anchorsFromRows,
  listingAnchorKey,
} from "./anchors";
import { fakeSupabase } from "./testing/fake-supabase";

describe("anchorsFromRows", () => {
  it("keeps listings with valid coordinates and skips the rest", () => {
    expect(
      anchorsFromRows([
        {
          id: "l1",
          title: "Riverside, Castletroy",
          latitude: 52.67,
          longitude: -8.55,
        },
        { id: 2, title: null, latitude: "53.1", longitude: "-6.2" },
        { id: "l3", title: "Not geocoded", latitude: null, longitude: null },
        { id: "l4", title: "Bad", latitude: 200, longitude: 0 },
        { title: "No id", latitude: 52, longitude: -8 },
        "garbage",
      ]),
    ).toEqual([
      {
        key: "housing:l1",
        label: "Riverside, Castletroy",
        latitude: 52.67,
        longitude: -8.55,
      },
      {
        key: "housing:2",
        label: "Housing listing",
        latitude: 53.1,
        longitude: -6.2,
      },
    ]);
    expect(listingAnchorKey("abc")).toBe("housing:abc");
  });
});

describe("anchorsFromHousing", () => {
  it("reads housing_listings with coordinates", async () => {
    const { client, queries } = fakeSupabase(() => ({
      data: [{ id: "l1", title: "Home", latitude: 52.67, longitude: -8.55 }],
    }));
    const anchors = await anchorsFromHousing(
      client as unknown as SupabaseClient,
    );
    expect(anchors).toHaveLength(1);
    expect(queries[0].table).toBe("housing_listings");
    expect(queries[0].calls[0]).toEqual({
      method: "select",
      args: ["id, title, latitude, longitude"],
    });
  });

  it("fails loudly when the table can't be read", async () => {
    const { client } = fakeSupabase(() => ({
      error: { message: 'relation "public.housing_listings" does not exist' },
    }));
    await expect(
      anchorsFromHousing(client as unknown as SupabaseClient),
    ).rejects.toThrow(/Couldn't read housing listings/);
  });
});
