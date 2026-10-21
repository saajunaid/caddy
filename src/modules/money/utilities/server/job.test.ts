import type { SupabaseClient } from "@supabase/supabase-js";
import { beforeEach, describe, expect, it } from "vitest";
import type { Database } from "@/lib/supabase/database.types";
import type { SourceCheck } from "@/server/jobs/runner";
import { JOBS } from "@/server/jobs/registry";
import { runUtilitiesDue, summarise, utilitiesDueJob } from "./job";

type Row = Record<string, unknown>;
type Write = { table: string; op: string };

/** Minimal in-memory stand-in for the supabase-js query builder, recording every write. */
class FakeDb {
  tables: Record<string, Row[]> = {};
  writes: Write[] = [];
  failOn: string | null = null;
  private nextId = 1;

  from(table: string) {
    const rows = (this.tables[table] ??= []);
    const filters: ((row: Row) => boolean)[] = [];
    const fail = this.failOn === table;
    const record = (op: string) => this.writes.push({ table, op });
    const nextId = () => `id-${this.nextId++}`;
    const unexpected = (op: string) => this.unexpected(table, op);
    let pending: () => {
      data: unknown;
      error: { message: string } | null;
    } = () => ({
      data: fail ? null : rows.filter((r) => filters.every((f) => f(r))),
      error: fail ? { message: `${table} unavailable` } : null,
    });
    const builder = {
      select: () => builder,
      eq(column: string, value: unknown) {
        filters.push((r) => r[column] === value);
        return builder;
      },
      in(column: string, values: unknown[]) {
        filters.push((r) => values.includes(r[column]));
        return builder;
      },
      upsert(
        items: Row[],
        options: { onConflict: string; ignoreDuplicates: boolean },
      ) {
        record("upsert");
        const keys = options.onConflict.split(",");
        pending = () => {
          const inserted: Row[] = [];
          for (const item of items) {
            const clash = rows.some((r) => keys.every((k) => r[k] === item[k]));
            if (clash && options.ignoreDuplicates) continue;
            const row = { id: nextId(), ...item };
            rows.push(row);
            inserted.push(row);
          }
          return { data: inserted.map((r) => ({ id: r.id })), error: null };
        };
        return builder;
      },
      insert: () => unexpected("insert"),
      update: () => unexpected("update"),
      delete: () => unexpected("delete"),
      then(
        resolve: (value: unknown) => unknown,
        reject: (error: unknown) => unknown,
      ) {
        try {
          return Promise.resolve(resolve(pending()));
        } catch (error) {
          return Promise.resolve(reject(error));
        }
      },
    };
    return builder;
  }

  unexpected(table: string, op: string): never {
    this.writes.push({ table, op });
    throw new Error(`Unexpected ${op} on ${table}`);
  }

  get admin() {
    return this as unknown as SupabaseClient<Database>;
  }
}

function contract(id: string, end: string | null, extra: Row = {}): Row {
  return {
    id,
    household_id: "h1",
    utility_type: "electricity",
    supplier: "Electric Ireland",
    tariff_name: null,
    account_label: null,
    meter_type: "smart_tou",
    contract_start: null,
    contract_end: end,
    comparison_due_on: null,
    status: "active",
    notes: "Ours: never touched by jobs",
    ...extra,
  };
}

function offer(id: string, contractId: string, extra: Row = {}): Row {
  return {
    id,
    household_id: "h1",
    contract_id: contractId,
    supplier: "Energia",
    tariff_name: null,
    utility_type: "electricity",
    day_rate_cents: 34.2,
    night_rate_cents: 17.1,
    peak_rate_cents: 39.9,
    standard_rate_cents: null,
    gas_rate_cents: null,
    standing_charge_cents_per_year: 28000,
    discount_percent: 22,
    discount_includes_standing: false,
    discount_months: 12,
    cashback_cents: 0,
    exit_fee_cents: 0,
    vat_percent: 9,
    source_url: "https://www.bonkers.ie/",
    checked_on: "2026-10-19",
    notes: null,
    decision: "negotiating",
    is_current_renewal: false,
    ...extra,
  };
}

function ctx(now: Date) {
  const sources: SourceCheck[] = [];
  const state = {
    sources,
    summary: "",
    stats: {} as Record<string, unknown>,
  };
  return {
    state,
    ctx: {
      now,
      runId: "run-1",
      async recordSource(check: SourceCheck) {
        sources.push(check);
      },
      setSummary(value: string) {
        state.summary = value;
      },
      setStats(value: Record<string, unknown>) {
        state.stats = value;
      },
    },
  };
}

// 20 Oct 2026, 07:15 in Dublin (06:15 UTC, summer time).
const NOW = new Date("2026-10-20T06:15:00Z");

let db: FakeDb;

beforeEach(() => {
  db = new FakeDb();
  db.tables.utility_contracts = [
    contract("due", "2026-11-03"),
    contract("later", "2027-03-14", {
      utility_type: "gas",
      supplier: "Flogas",
    }),
    contract("unknown", null, { utility_type: "broadband", supplier: "Eir" }),
    contract("ended", "2026-10-01"),
    contract("late", "2026-10-30"),
    contract("switching", "2026-11-03", { status: "switching" }),
  ];
  db.tables.tariff_offers = [
    offer("o1", "due"),
    offer("o2", "due", {
      supplier: "Electric Ireland",
      is_current_renewal: true,
      discount_percent: 0,
      day_rate_cents: 37.12,
      night_rate_cents: 19.85,
      peak_rate_cents: 42.1,
      standing_charge_cents_per_year: 30200,
    }),
  ];
  db.tables.utility_usage = [
    {
      id: "u1",
      household_id: "h1",
      contract_id: "due",
      period_start: "2025-09-01",
      period_end: "2026-08-31",
      day_kwh: 4920,
      night_kwh: 3410,
      peak_kwh: 610,
      standard_kwh: null,
      gas_kwh: null,
      total_cents: null,
      source: "manual",
      document_id: null,
    },
  ];
  db.tables.utility_preferences = [];
  db.tables.notifications = [];
  db.tables.utility_comparisons = [];
});

describe("utilities-due job", () => {
  it("is registered as a daily job keyed by the Dublin date", () => {
    expect(JOBS).toContain(utilitiesDueJob);
    expect(utilitiesDueJob.group).toBe("daily");
    // 23:30 UTC on 19 Oct is already 20 Oct in Dublin.
    expect(
      utilitiesDueJob.idempotencyKey(new Date("2026-10-19T23:30:00Z")),
    ).toBe("utilities-due:2026-10-20");
  });

  it("alerts once per contract state and snapshots due comparisons with offers", async () => {
    const { ctx: c, state } = ctx(NOW);
    await runUtilitiesDue(c, db.admin);

    const notes = db.tables.notifications;
    expect(notes.map((n) => n.dedupe_key).sort()).toEqual([
      "utilities:due:due:2026-11-03",
      "utilities:due:late:2026-10-30",
      "utilities:ended:ended:2026-10-01",
      "utilities:unknown-end:unknown",
    ]);
    expect(
      notes.find((n) => n.dedupe_key === "utilities:due:due:2026-11-03"),
    ).toMatchObject({
      title: "Electricity contract ends in 14 days: compare offers",
      severity: "warning",
      action_url: "/money/utilities/due",
      job_run_id: "run-1",
      push: true,
    });
    expect(
      notes.find((n) => n.dedupe_key === "utilities:due:late:2026-10-30")?.body,
    ).toContain("this reminder is 4 days late");

    // Only the due contract with offers gets a snapshot.
    expect(db.tables.utility_comparisons).toHaveLength(1);
    const snapshot = db.tables.utility_comparisons[0];
    expect(snapshot).toMatchObject({
      contract_id: "due",
      trigger: "due",
      contract_end: "2026-11-03",
      dedupe_key: "utilities:due:due:2026-11-03",
    });
    const results = snapshot.results as {
      bestOfferId: string;
      rows: { supplier: string; year1Cents: number }[];
    };
    expect(results.bestOfferId).toBe("o1");
    expect(results.rows[0]).toMatchObject({
      supplier: "Energia",
      year1Cents: 243847,
    });

    expect(state.summary).toBe(
      "5 contracts checked · 2 comparisons due · 1 ended, needs review · 1 without an end date",
    );
    expect(state.stats).toMatchObject({
      notificationsNew: 4,
      snapshots: 1,
      late: 1,
    });
    expect(state.sources.map((s) => [s.source, s.status, s.itemsSeen])).toEqual(
      [
        ["utility_contracts", "ok", 5],
        ["utility_offers_and_usage", "ok", 2],
      ],
    );
  });

  it("never notifies or snapshots twice when re-run", async () => {
    await runUtilitiesDue(ctx(NOW).ctx, db.admin);
    const again = ctx(new Date("2026-10-21T06:15:00Z"));
    await runUtilitiesDue(again.ctx, db.admin);
    expect(db.tables.notifications).toHaveLength(4);
    expect(db.tables.utility_comparisons).toHaveLength(1);
    expect(again.state.stats).toMatchObject({
      notificationsNew: 0,
      snapshots: 0,
    });
  });

  it("re-arms the reminder when the end date changes", async () => {
    await runUtilitiesDue(ctx(NOW).ctx, db.admin);
    db.tables.utility_contracts[0].contract_end = "2027-11-03";
    await runUtilitiesDue(ctx(new Date("2027-10-20T06:15:00Z")).ctx, db.admin);
    expect(
      db.tables.notifications.filter((n) =>
        String(n.dedupe_key).startsWith("utilities:due:due:"),
      ),
    ).toHaveLength(2);
  });

  it("never writes contracts, usage, offers or preferences", async () => {
    const before = structuredClone({
      contracts: db.tables.utility_contracts,
      offers: db.tables.tariff_offers,
      usage: db.tables.utility_usage,
    });
    await runUtilitiesDue(ctx(NOW).ctx, db.admin);
    expect(new Set(db.writes.map((w) => w.table))).toEqual(
      new Set(["notifications", "utility_comparisons"]),
    );
    expect(db.writes.every((w) => w.op === "upsert")).toBe(true);
    expect({
      contracts: db.tables.utility_contracts,
      offers: db.tables.tariff_offers,
      usage: db.tables.utility_usage,
    }).toEqual(before);
  });

  it("records a failed source instead of reporting zero contracts", async () => {
    db.failOn = "utility_contracts";
    const { ctx: c, state } = ctx(NOW);
    await expect(runUtilitiesDue(c, db.admin)).rejects.toThrow(
      /Couldn't load utility contracts/,
    );
    expect(state.sources).toEqual([
      {
        source: "utility_contracts",
        status: "failed",
        error: "utility_contracts unavailable",
      },
    ]);
    expect(db.tables.notifications).toHaveLength(0);
  });

  it("checks successfully with no contracts", async () => {
    db.tables.utility_contracts = [];
    const { ctx: c, state } = ctx(NOW);
    await runUtilitiesDue(c, db.admin);
    expect(state.summary).toBe("0 contracts checked · 0 comparisons due");
    expect(state.sources[0]).toMatchObject({ status: "ok", itemsSeen: 0 });
  });
});

describe("summarise", () => {
  it("uses singular forms", () => {
    expect(summarise({ contracts: 1, due: 1, ended: 0, unknownEnd: 0 })).toBe(
      "1 contract checked · 1 comparison due",
    );
  });
});
