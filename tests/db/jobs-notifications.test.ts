import type { Client } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { as, connect, errorAs, seed, type Fixture } from "./helpers";

let db: Client;
let f: Fixture;
let runA: string;
let runSystem: string;
let runB: string;

beforeAll(async () => {
  db = await connect();
  f = await seed(db);
  const insertRun = async (household: string | null, key: string) =>
    (
      await db.query(
        "insert into public.job_runs (household_id, job_type, idempotency_key, status) values ($1, 'test', $2, 'succeeded') returning id",
        [household, key],
      )
    ).rows[0].id as string;
  runA = await insertRun(f.householdA, `a-${f.householdA}`);
  runB = await insertRun(f.householdB, `b-${f.householdB}`);
  runSystem = await insertRun(null, `system-${f.householdA}`);
  await db.query(
    "insert into public.job_source_checks (job_run_id, source, status) values ($1, 'site', 'ok'), ($2, 'site', 'failed')",
    [runA, runB],
  );
  await db.query(
    `insert into public.notifications (household_id, kind, title, dedupe_key)
     values ($1, 'test', 'For A', 'a1'), ($2, 'test', 'For B', 'b1')`,
    [f.householdA, f.householdB],
  );
  await db.query(
    `insert into public.push_subscriptions (household_id, user_id, endpoint, p256dh, auth)
     values ($1, $2, 'https://push.example/a2', 'k', 'a')`,
    [f.householdA, f.userA2],
  );
});

afterAll(async () => {
  await db.end();
});

describe("job runs", () => {
  it("show your household's runs and system runs, not other households'", async () => {
    const ids = await as(db, f.userA, async () =>
      (await db.query("select id from public.job_runs")).rows.map((r) => r.id),
    );
    expect(ids).toContain(runA);
    expect(ids).toContain(runSystem);
    expect(ids).not.toContain(runB);
  });

  it("hide system runs from accounts without a household", async () => {
    const count = await as(
      db,
      f.userNoProfile,
      async () => (await db.query("select 1 from public.job_runs")).rowCount,
    );
    expect(count).toBe(0);
  });

  it("can't be written by signed-in users", async () => {
    const error = await errorAs(db, f.userA, () =>
      db.query(
        "insert into public.job_runs (job_type, idempotency_key) values ('x', 'x')",
      ),
    );
    expect(error).toMatch(/permission denied/);
  });

  it("only expose source checks of visible runs", async () => {
    const runs = await as(db, f.userA, async () =>
      (
        await db.query("select job_run_id from public.job_source_checks")
      ).rows.map((r) => r.job_run_id),
    );
    expect(runs).toEqual([runA]);
  });
});

describe("notifications", () => {
  it("are isolated per household", async () => {
    const titles = await as(db, f.userB, async () =>
      (await db.query("select title from public.notifications")).rows.map(
        (r) => r.title,
      ),
    );
    expect(titles).toEqual(["For B"]);
  });

  it("can be marked read but not rewritten", async () => {
    const read = await as(
      db,
      f.userA,
      async () =>
        (await db.query("update public.notifications set read_at = now()"))
          .rowCount,
    );
    expect(read).toBe(1);
    const rewrite = await errorAs(db, f.userA, () =>
      db.query("update public.notifications set title = 'hacked'"),
    );
    expect(rewrite).toMatch(/permission denied/);
  });

  it("can't be created by signed-in users", async () => {
    const error = await errorAs(db, f.userA, () =>
      db.query(
        "insert into public.notifications (household_id, kind, title, dedupe_key) values ($1, 'x', 'x', 'x')",
        [f.householdA],
      ),
    );
    expect(error).toMatch(/permission denied/);
  });
});

describe("push subscriptions", () => {
  it("are private to each adult, even within a household", async () => {
    const mine = await as(
      db,
      f.userA,
      async () =>
        (await db.query("select 1 from public.push_subscriptions")).rowCount,
    );
    const partner = await as(
      db,
      f.userA2,
      async () =>
        (await db.query("select 1 from public.push_subscriptions")).rowCount,
    );
    expect(mine).toBe(0);
    expect(partner).toBe(1);
  });

  it("can only be registered for yourself", async () => {
    const error = await errorAs(db, f.userA, () =>
      db.query(
        `insert into public.push_subscriptions (household_id, user_id, endpoint, p256dh, auth)
         values ($1, $2, 'https://push.example/x', 'k', 'a')`,
        [f.householdA, f.userA2],
      ),
    );
    expect(error).toMatch(/row-level security/);
  });
});
