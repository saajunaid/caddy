// @vitest-environment node
import { describe, expect, it, vi } from "vitest";
import { geocode, geocodeQuery } from "./geocode";
import { politeFetcher, USER_AGENT, type Fetcher } from "./http";

describe("geocodeQuery", () => {
  it("builds an Irish address query", () => {
    expect(
      geocodeQuery({
        address_text: "Shankill, Co. Dublin",
        locality: null,
        county: null,
      }),
    ).toBe("Shankill, County Dublin, Ireland");
    expect(
      geocodeQuery({
        address_text: null,
        locality: "Castletroy",
        county: "Limerick",
      }),
    ).toBe("Castletroy, County Limerick, Ireland");
    expect(
      geocodeQuery({ address_text: null, locality: null, county: null }),
    ).toBeNull();
  });
});

describe("geocode", () => {
  it("asks Nominatim for Irish results and reads the first hit", async () => {
    const fetcher = vi.fn<Fetcher>(async () => ({
      status: 200,
      text: JSON.stringify([
        {
          lat: "52.6741234567",
          lon: "-8.5512345678",
          display_name: "Castletroy, Limerick",
        },
      ]),
    }));
    const result = await geocode(
      "Castletroy, County Limerick, Ireland",
      fetcher,
    );
    expect(result).toEqual({
      latitude: 52.674123,
      longitude: -8.551235,
      displayName: "Castletroy, Limerick",
    });
    const url = new URL(fetcher.mock.calls[0][0]);
    expect(url.origin + url.pathname).toBe(
      "https://nominatim.openstreetmap.org/search",
    );
    expect(url.searchParams.get("format")).toBe("jsonv2");
    expect(url.searchParams.get("countrycodes")).toBe("ie");
    expect(url.searchParams.get("q")).toBe(
      "Castletroy, County Limerick, Ireland",
    );
  });

  it("returns null when nothing is found", async () => {
    const fetcher: Fetcher = async () => ({ status: 200, text: "[]" });
    expect(await geocode("Nowhere", fetcher)).toBeNull();
  });

  it("throws when the service fails, so the job records a failed source", async () => {
    await expect(
      geocode("x", async () => ({ status: 503, text: "" })),
    ).rejects.toThrow(/HTTP 503/);
    await expect(
      geocode("x", async () => ({ status: 200, text: "<html>" })),
    ).rejects.toThrow(/isn't JSON/);
  });
});

describe("politeFetcher", () => {
  function fakeFetch(statuses: number[]) {
    const calls: { url: string; headers: Record<string, string> }[] = [];
    const impl = (async (url: string, init?: RequestInit) => {
      calls.push({ url, headers: init?.headers as Record<string, string> });
      const status = statuses.shift() ?? 200;
      return new Response("ok", { status });
    }) as unknown as typeof fetch;
    return { impl, calls };
  }

  it("identifies itself and waits at least a second between requests", async () => {
    let clock = 0;
    const waits: number[] = [];
    const { impl, calls } = fakeFetch([200, 200]);
    const fetcher = politeFetcher({
      fetchImpl: impl,
      clock: () => clock,
      sleep: async (ms) => {
        waits.push(ms);
        clock += ms;
      },
    });
    await fetcher("https://newstarterhomes.ie/rent/");
    clock += 200;
    await fetcher("https://newstarterhomes.ie/rent/?page=2");
    expect(calls[0].headers["user-agent"]).toBe(USER_AGENT);
    expect(USER_AGENT).toMatch(/caddy-beryl\.vercel\.app/);
    expect(waits).toEqual([900]);
  });

  it("retries once on a server error, then returns the response", async () => {
    const { impl, calls } = fakeFetch([503, 200]);
    const fetcher = politeFetcher({
      fetchImpl: impl,
      sleep: async () => {},
      clock: () => 0,
    });
    expect((await fetcher("https://newstarterhomes.ie/rent/")).status).toBe(
      200,
    );
    expect(calls).toHaveLength(2);

    const failing = fakeFetch([500, 500, 500]);
    const fetcher2 = politeFetcher({
      fetchImpl: failing.impl,
      sleep: async () => {},
      clock: () => 0,
    });
    expect((await fetcher2("https://newstarterhomes.ie/rent/")).status).toBe(
      500,
    );
    expect(failing.calls).toHaveLength(2);
  });

  it("reports network errors without leaking details beyond the host", async () => {
    const impl = (async () => {
      throw new Error("ECONNRESET");
    }) as unknown as typeof fetch;
    const fetcher = politeFetcher({
      fetchImpl: impl,
      sleep: async () => {},
      clock: () => 0,
    });
    await expect(fetcher("https://newstarterhomes.ie/rent/")).rejects.toThrow(
      "Request to newstarterhomes.ie failed: ECONNRESET",
    );
  });
});
