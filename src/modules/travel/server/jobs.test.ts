import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";
import type { JobContext, SourceCheck } from "../../../server/jobs/runner";
import { runFxEcb, runTravelWeekly, travelWeeklyJob } from "./jobs";

const fixture = readFileSync(
  path.resolve(process.cwd(), "tests/fixtures/ecb/eurofxref-daily.xml"),
  "utf8",
);

type Call = { table: string; op: string; payload?: unknown };

/** A stand-in for the Supabase client that records every table operation. */
function fakeAdmin(tables: Record<string, unknown[]>, count = 1000) {
  const calls: Call[] = [];
  const admin = {
    from(table: string) {
      let op = "select";
      let payload: unknown;
      const builder = {
        select: (_cols?: string, opts?: { head?: boolean }) => {
          if (op === "select" && opts?.head) op = "count";
          return builder;
        },
        insert: (p: unknown) => ((op = "insert"), (payload = p), builder),
        upsert: (p: unknown) => ((op = "upsert"), (payload = p), builder),
        update: (p: unknown) => ((op = "update"), (payload = p), builder),
        delete: () => ((op = "delete"), builder),
        eq: () => builder,
        in: () => builder,
        then(resolve: (value: unknown) => void) {
          calls.push({ table, op, payload });
          if (op === "count") return resolve({ count, error: null });
          if (op === "upsert")
            return resolve({ data: payload as unknown[], error: null });
          return resolve({ data: tables[table] ?? [], error: null });
        },
      };
      return builder;
    },
  };
  return { admin: admin as never, calls };
}

function fakeContext(now = new Date("2026-10-21T06:00:00Z")) {
  const sources: SourceCheck[] = [];
  let summary = "";
  const ctx: JobContext = {
    runId: "run-1",
    admin: undefined as never,
    now,
    recordSource: async (check) => void sources.push(check),
    setSummary: (s) => void (summary = s),
    setStats: () => {},
  };
  return { ctx, sources, summary: () => summary };
}

const respond = (body: string, status = 200) =>
  vi.fn(async () => new Response(body, { status })) as unknown as typeof fetch;

describe("fx-ecb job", () => {
  it("saves every parsed rate and touches nothing else", async () => {
    const { admin, calls } = fakeAdmin({});
    const { ctx, sources, summary } = fakeContext();
    await runFxEcb(ctx, admin, respond(fixture));
    expect(sources).toEqual([
      expect.objectContaining({ status: "ok", itemsSeen: 29 }),
    ]);
    const writes = calls.filter((c) => c.op !== "select" && c.op !== "count");
    expect(writes.map((c) => [c.table, c.op])).toEqual([
      ["fx_rates", "upsert"],
    ]);
    const rows = writes[0].payload as { currency: string; rate: unknown }[];
    expect(rows.find((r) => r.currency === "TRY")?.rate).toBe("55.6009");
    expect(summary()).toBe("ECB rates for 2026-10-20 (29 currencies, 29 new)");
  });

  it("fails the source when the page parses to zero rates", async () => {
    const { admin, calls } = fakeAdmin({});
    const { ctx, sources } = fakeContext();
    await runFxEcb(ctx, admin, respond("<html>Service unavailable</html>"));
    expect(sources[0]).toMatchObject({
      status: "failed",
      itemsSeen: 0,
      error: expect.stringMatching(/zero rates/),
    });
    expect(calls.some((c) => c.op === "upsert")).toBe(false);
  });

  it("fails the source on HTTP errors and network errors", async () => {
    const { admin } = fakeAdmin({});
    const http = fakeContext();
    await runFxEcb(http.ctx, admin, respond("nope", 503));
    expect(http.sources[0]).toMatchObject({
      status: "failed",
      httpStatus: 503,
    });
    const net = fakeContext();
    const offline = vi.fn(async () => {
      throw new Error("ECONNRESET");
    }) as unknown as typeof fetch;
    await runFxEcb(net.ctx, admin, offline);
    expect(net.sources[0]).toMatchObject({
      status: "failed",
      error: "Unreachable: ECONNRESET",
    });
  });
});

describe("travel-weekly job", () => {
  it("only creates notifications, never edits trips", async () => {
    const { admin, calls } = fakeAdmin({
      trips: [
        {
          id: "t1",
          household_id: "h1",
          name: "Mid-term Feb 2027",
          status: "planning",
          date_from: "2026-12-01",
          date_to: "2026-12-08",
        },
      ],
      trip_candidates: [{ id: "c1", trip_id: "t1", status: "shortlisted" }],
      trip_components: [
        { candidate_id: "c1", checked_at: "2026-10-12T09:00:00Z" },
      ],
      notifications: [{ id: "n1" }],
    });
    const { ctx, sources, summary } = fakeContext();
    await runTravelWeekly(ctx, admin);
    const writes = calls.filter((c) => c.op !== "select" && c.op !== "count");
    expect(writes.map((c) => [c.table, c.op])).toEqual([
      ["notifications", "upsert"],
    ]);
    const [notification] = writes[0].payload as {
      title: string;
      action_url: string;
      dedupe_key: string;
    }[];
    expect(notification).toMatchObject({
      title:
        "Prices for Mid-term Feb 2027 were last checked 12 Oct: recheck before booking",
      action_url: "/travel/t1",
      dedupe_key: "travel-weekly:t1:2026-W43",
    });
    expect(sources).toEqual([
      expect.objectContaining({ source: "trips", status: "ok", itemsSeen: 1 }),
    ]);
    expect(summary()).toBe("1 reminder for 1 trip");
  });

  it("runs once per ISO week", () => {
    expect(
      travelWeeklyJob.idempotencyKey(new Date("2026-10-19T07:00:00Z")),
    ).toBe(travelWeeklyJob.idempotencyKey(new Date("2026-10-25T07:00:00Z")));
    expect(travelWeeklyJob.group).toBe("weekly");
  });
});
