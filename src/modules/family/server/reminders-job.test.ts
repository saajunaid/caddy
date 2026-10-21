import { describe, expect, it } from "vitest";
import type { JobContext, SourceCheck } from "../../../server/jobs/runner";
import { familyReminders } from "./reminders-job";

type Call = { table: string; op: string; payload?: unknown };

/**
 * A stand-in for the Supabase client that records every call and returns canned rows.
 * Query builders are chainable and thenable, like the real ones.
 */
function fakeAdmin(rows: Record<string, unknown[]>, failTable?: string) {
  const calls: Call[] = [];
  const builder = (table: string, op: string, payload?: unknown) => {
    calls.push({ table, op, payload });
    const result =
      table === failTable
        ? { data: null, error: { message: "boom" } }
        : op === "upsert"
          ? {
              data: (payload as unknown[]).map((_, i) => ({ id: `n${i}` })),
              error: null,
            }
          : { data: rows[table] ?? [], error: null };
    const chain: Record<string, unknown> = {};
    for (const method of [
      "select",
      "eq",
      "lte",
      "lt",
      "gte",
      "or",
      "order",
      "in",
      "is",
      "not",
      "limit",
    ]) {
      chain[method] = () => chain;
    }
    chain.then = (
      resolve: (v: unknown) => unknown,
      reject: (e: unknown) => unknown,
    ) => Promise.resolve(result).then(resolve, reject);
    return chain;
  };
  const admin = {
    from(table: string) {
      return {
        select: () => builder(table, "select"),
        insert: (p: unknown) => builder(table, "insert", p),
        update: (p: unknown) => builder(table, "update", p),
        upsert: (p: unknown) => builder(table, "upsert", p),
        delete: () => builder(table, "delete"),
      };
    },
  };
  return { admin, calls };
}

function fakeContext(admin: unknown, now: Date) {
  const sources: SourceCheck[] = [];
  let summary = "";
  const ctx = {
    runId: "run-1",
    admin,
    now,
    async recordSource(check: SourceCheck) {
      sources.push(check);
    },
    setSummary(value: string) {
      summary = value;
    },
    setStats() {},
  } as unknown as JobContext;
  return { ctx, sources, summary: () => summary };
}

const NOW = new Date("2026-10-21T06:30:00Z"); // 07:30 in Dublin

const ROWS = {
  households: [{ id: "h1" }],
  household_members: [{ id: "m1", display_name: "Junaid" }],
  schools: [{ id: "s1", name: "Scoil Mhuire" }],
  tasks: [
    {
      id: "t1",
      title: "Bins",
      due_on: "2026-10-21",
      due_time: null,
      assignee_member_id: "m1",
    },
    {
      id: "t2",
      title: "NCT",
      due_on: "2026-10-19",
      due_time: null,
      assignee_member_id: null,
    },
  ],
  events: [
    {
      id: "e1",
      title: "Swimming",
      starts_at: "2026-10-14T16:30:00Z",
      ends_at: "2026-10-14T17:15:00Z",
      all_day: false,
      start_date: null,
      end_date: null,
      recurrence: "weekly",
    },
  ],
  school_applications: [
    {
      id: "a1",
      status: "researching",
      application_deadline: "2026-10-25",
      open_day: "2026-10-22",
      school_id: "s1",
      child_member_id: "m1",
    },
  ],
};

describe("family-reminders job", () => {
  it("is daily and keyed by the Dublin date", () => {
    expect(familyReminders.group).toBe("daily");
    // 23:30 UTC on 24 Oct is already 25 Oct in Dublin.
    expect(
      familyReminders.idempotencyKey(new Date("2026-10-24T23:30:00Z")),
    ).toBe("family-reminders:2026-10-25");
  });

  it("only reads family data and only writes notifications", async () => {
    const { admin, calls } = fakeAdmin(ROWS);
    const { ctx, sources, summary } = fakeContext(admin, NOW);
    await familyReminders.run(ctx, admin as never);

    const writes = calls.filter((c) => c.op !== "select");
    expect(writes.map((c) => `${c.table}.${c.op}`)).toEqual([
      "notifications.upsert",
    ]);
    const keys = (writes[0].payload as { dedupe_key: string }[]).map(
      (n) => n.dedupe_key,
    );
    expect(keys).toEqual([
      "family:task:t1:2026-10-21",
      "family:task:t2:2026-10-19",
      "family:events:2026-10-21",
      "family:school-deadline:a1:2026-10-25",
      "family:open-day:s1:2026-10-22",
    ]);
    expect(sources).toEqual([
      { source: "household:h1", status: "ok", itemsSeen: 5 },
    ]);
    expect(summary()).toBe("5 reminders sent");
  });

  it("records a failed source instead of reporting zero reminders", async () => {
    const { admin, calls } = fakeAdmin(ROWS, "tasks");
    const { ctx, sources, summary } = fakeContext(admin, NOW);
    await familyReminders.run(ctx, admin as never);
    expect(calls.some((c) => c.op === "upsert")).toBe(false);
    expect(sources).toMatchObject([
      { source: "household:h1", status: "failed", error: "boom" },
    ]);
    expect(summary()).toBe("0 reminders sent · 1 household failed");
  });
});
