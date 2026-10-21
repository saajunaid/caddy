// @vitest-environment node
import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const ingest = vi.fn();
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: () => ({}) }));
vi.mock("@/modules/housing/server/ingest-research.ts", () => ({
  ingestResearch: (...args: unknown[]) => ingest(...args),
}));

const { POST } = await import("./route");

const SECRET = "sb_secret_test_value_1234567890";

function request(body: unknown, token: string | null = SECRET) {
  return new NextRequest("https://caddy.test/api/ingest/research", {
    method: "POST",
    headers: token ? { authorization: `Bearer ${token}` } : {},
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}

const valid = {
  topic: "housing",
  agent: "claude-code-routine",
  run_started_at: "2026-10-21T05:30:00Z",
  items: [
    {
      title: "Cost Rental homes approved in Limerick",
      url: "https://www.limerick.ie/news/x",
      source_name: "Limerick City and County Council",
      source_type: "official",
      published_on: "2026-10-12",
      summary: null,
      locality: "Limerick City",
      provider: null,
      cost_rental_confirmed: "unconfirmed",
      verification: "officially_confirmed",
    },
  ],
};

beforeEach(() => {
  vi.stubEnv("SUPABASE_SECRET_KEY", SECRET);
  ingest.mockReset();
  ingest.mockResolvedValue({
    status: "succeeded",
    runId: "run-1",
    summary: "1 item from claude-code-routine · 1 new",
    received: 1,
    inserted: 1,
    updated: 0,
    notified: 2,
  });
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("POST /api/ingest/research", () => {
  it("rejects missing or wrong tokens", async () => {
    expect((await POST(request(valid, null))).status).toBe(401);
    expect((await POST(request(valid, "nope"))).status).toBe(401);
    expect(ingest).not.toHaveBeenCalled();
  });

  it("accepts a dedicated research token when one is configured", async () => {
    vi.stubEnv("RESEARCH_INGEST_TOKEN", "research-token-abcdef");
    expect((await POST(request(valid, "research-token-abcdef"))).status).toBe(
      200,
    );
  });

  it("rejects invalid JSON and schema mismatches with a clear 400", async () => {
    const notJson = await POST(request("{nope"));
    expect(notJson.status).toBe(400);
    const bad = await POST(
      request({ ...valid, items: [{ ...valid.items[0], url: "not-a-url" }] }),
    );
    expect(bad.status).toBe(400);
    const body = await bad.json();
    expect(body.error).toBe("Payload doesn't match the research schema.");
    expect(body.issues.some((i: string) => i.startsWith("items.0.url"))).toBe(
      true,
    );
    expect(ingest).not.toHaveBeenCalled();
  });

  it("stores a valid result and reports what happened", async () => {
    const response = await POST(request(valid));
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      status: "succeeded",
      run_id: "run-1",
      inserted: 1,
      notified: 2,
    });
    expect(ingest).toHaveBeenCalledWith(
      {},
      expect.objectContaining({ agent: "claude-code-routine" }),
    );
  });
});
