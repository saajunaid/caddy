import { describe, expect, it, vi } from "vitest";
import {
  GOOGLE_FIELD_MASK,
  GOOGLE_QUERIES,
  googleApiKeyFromEnv,
  parseGoogle,
  searchGoogle,
} from "./google";

const center = { latitude: 52.6738, longitude: -8.553 };
const halal = GOOGLE_QUERIES.find((q) => q.category === "halal")!;

// Synthetic response in the documented Places API (New) searchText shape.
const response = {
  places: [
    {
      id: "ChIJ-near",
      displayName: { text: "Spice Route Kitchen", languageCode: "en" },
      location: { latitude: 52.67, longitude: -8.56 },
      formattedAddress: "Main St, Castletroy, Co. Limerick",
      googleMapsUri: "https://maps.google.com/?cid=1",
    },
    {
      id: "ChIJ-far",
      displayName: { text: "Dublin Kebab" },
      location: { latitude: 53.35, longitude: -6.26 },
    },
    { id: "ChIJ-noname", location: { latitude: 52.67, longitude: -8.56 } },
  ],
};

describe("field mask", () => {
  it("only asks for Pro-tier fields (no rating or reviews)", () => {
    expect(GOOGLE_FIELD_MASK.split(",")).toEqual([
      "places.id",
      "places.displayName",
      "places.location",
      "places.formattedAddress",
      "places.googleMapsUri",
    ]);
    expect(GOOGLE_FIELD_MASK).not.toMatch(/rating|review/i);
  });

  it("searches every category once", () => {
    expect(GOOGLE_QUERIES.map((q) => q.category).sort()).toEqual([
      "bus",
      "childcare",
      "halal",
      "higher",
      "mosque",
      "primary",
      "secondary",
    ]);
  });
});

describe("googleApiKeyFromEnv", () => {
  it("is off unless a key is set", () => {
    expect(googleApiKeyFromEnv({})).toBeNull();
    expect(googleApiKeyFromEnv({ GOOGLE_PLACES_API_KEY: "  " })).toBeNull();
    expect(googleApiKeyFromEnv({ GOOGLE_PLACES_API_KEY: "k" })).toBe("k");
  });
});

describe("parseGoogle", () => {
  it("keeps named places near the location, marked as a search match", () => {
    const { candidates, parsed } = parseGoogle(
      response,
      center,
      "halal",
      halal.textQuery,
    );
    expect(parsed).toBe(2);
    expect(candidates).toEqual([
      {
        source: "google",
        sourceId: "ChIJ-near",
        category: "halal",
        name: "Spice Route Kitchen",
        latitude: 52.67,
        longitude: -8.56,
        address: "Main St, Castletroy, Co. Limerick",
        details: {
          kind: "Google search match: “halal restaurant”",
          mapsUrl: "https://maps.google.com/?cid=1",
        },
      },
    ]);
  });
});

describe("searchGoogle", () => {
  it("sends the key, field mask and a circle bias", async () => {
    const fetch = vi.fn(async () => Response.json(response));
    const result = await searchGoogle(center, halal, {
      apiKey: "secret-key",
      fetch: fetch as unknown as typeof globalThis.fetch,
    });
    expect(result).toMatchObject({ status: "ok", itemsSeen: 1 });
    const [, init] = fetch.mock.calls[0] as unknown as [string, RequestInit];
    const headers = init.headers as Record<string, string>;
    expect(headers["x-goog-api-key"]).toBe("secret-key");
    expect(headers["x-goog-fieldmask"]).toBe(GOOGLE_FIELD_MASK);
    const body = JSON.parse(String(init.body));
    expect(body.textQuery).toBe("halal restaurant");
    expect(body.locationBias.circle.radius).toBe(5000);
  });

  it("fails on an empty answer and on HTTP errors without leaking the key", async () => {
    const empty = await searchGoogle(center, halal, {
      apiKey: "k",
      fetch: (async () => Response.json({})) as unknown as typeof fetch,
    });
    expect(empty.status).toBe("failed");
    const denied = await searchGoogle(center, halal, {
      apiKey: "k",
      fetch: (async () =>
        new Response("API key k is invalid", {
          status: 403,
        })) as unknown as typeof fetch,
    });
    expect(denied).toMatchObject({
      status: "failed",
      httpStatus: 403,
      error: "HTTP 403",
    });
    const thrown = await searchGoogle(center, halal, {
      apiKey: "sekrit",
      fetch: (async () => {
        throw new Error("network down for sekrit");
      }) as unknown as typeof fetch,
    });
    expect(thrown.error).toBe("network down for [key]");
  });
});
