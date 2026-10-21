// Saved newstarterhomes.ie pages (tests/fixtures/newstarterhomes) and a fake fetcher over them.
import { readFileSync } from "node:fs";
import type { Fetcher, HttpResponse } from "../http.ts";

const DIR = new URL(
  "../../../../../tests/fixtures/newstarterhomes/",
  import.meta.url,
);

export function fixture(name: string): string {
  return readFileSync(new URL(name, DIR), "utf8");
}

/**
 * A fetcher that serves fixtures by URL. Unknown URLs get a 404. `overrides` lets a test
 * change a page (or make it fail) without touching the saved files.
 */
export function fixtureFetcher(
  routes: Record<string, string | HttpResponse | (() => HttpResponse)>,
): Fetcher & { calls: string[] } {
  const calls: string[] = [];
  const fetcher = (async (url: string) => {
    calls.push(url);
    const route = routes[url];
    if (route === undefined) return { status: 404, text: "Not found" };
    if (typeof route === "function") return route();
    if (typeof route === "string") return { status: 200, text: fixture(route) };
    return route;
  }) as Fetcher & { calls: string[] };
  fetcher.calls = calls;
  return fetcher;
}
