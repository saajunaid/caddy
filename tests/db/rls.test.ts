import type { Client } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { as, connect, errorAs, seed, type Fixture } from "./helpers";

let db: Client;
let f: Fixture;

beforeAll(async () => {
  db = await connect();
  f = await seed(db);
});

afterAll(async () => {
  await db.end();
});

describe("every table", () => {
  it("has row-level security enabled", async () => {
    const { rows } = await db.query(
      "select tablename from pg_tables where schemaname = 'public' and not rowsecurity",
    );
    expect(rows).toEqual([]);
  });
});

describe("anonymous visitors", () => {
  it("cannot read any household data", async () => {
    for (const table of [
      "households",
      "profiles",
      "household_members",
      "audit_events",
    ]) {
      const error = await errorAs(db, null, () =>
        db.query(`select * from public.${table}`),
      );
      expect(error, table).toMatch(/permission denied/);
    }
  });
});

describe("households", () => {
  it("are visible only to their own members", async () => {
    const rows = await as(
      db,
      f.userA,
      async () => (await db.query("select id from public.households")).rows,
    );
    expect(rows).toEqual([{ id: f.householdA }]);
  });

  it("cannot be renamed by another household", async () => {
    const count = await as(
      db,
      f.userA,
      async () =>
        (
          await db.query(
            "update public.households set name = 'x' where id = $1",
            [f.householdB],
          )
        ).rowCount,
    );
    expect(count).toBe(0);
  });

  it("can be renamed by a member", async () => {
    const count = await as(
      db,
      f.userA2,
      async () =>
        (
          await db.query(
            "update public.households set name = 'Home' where id = $1",
            [f.householdA],
          )
        ).rowCount,
    );
    expect(count).toBe(1);
  });

  it("cannot have their currency changed by members", async () => {
    const error = await errorAs(db, f.userA, () =>
      db.query("update public.households set currency = 'USD' where id = $1", [
        f.householdA,
      ]),
    );
    expect(error).toMatch(/permission denied/);
  });

  it("cannot be created by signed-in users", async () => {
    const error = await errorAs(db, f.userNoProfile, () =>
      db.query("insert into public.households (name) values ('sneaky')"),
    );
    expect(error).toMatch(/permission denied/);
  });
});

describe("profiles", () => {
  it("show only adults in the same household", async () => {
    const names = await as(db, f.userA, async () =>
      (
        await db.query(
          "select display_name from public.profiles order by display_name",
        )
      ).rows.map((r) => r.display_name),
    );
    expect(names).toEqual(["Adult A1", "Adult A2"]);
  });

  it("cannot be moved to another household", async () => {
    const error = await errorAs(db, f.userA, () =>
      db.query(
        "update public.profiles set household_id = $1 where user_id = $2",
        [f.householdB, f.userA],
      ),
    );
    expect(error).toMatch(/permission denied/);
  });

  it("can only be edited by their owner", async () => {
    const own = await as(
      db,
      f.userA,
      async () =>
        (
          await db.query(
            "update public.profiles set display_name = 'Me' where user_id = $1",
            [f.userA],
          )
        ).rowCount,
    );
    const partner = await as(
      db,
      f.userA,
      async () =>
        (
          await db.query(
            "update public.profiles set display_name = 'You' where user_id = $1",
            [f.userA2],
          )
        ).rowCount,
    );
    expect(own).toBe(1);
    expect(partner).toBe(0);
  });

  it("cannot be inserted by signed-in users", async () => {
    const error = await errorAs(db, f.userNoProfile, () =>
      db.query(
        "insert into public.profiles (user_id, household_id, display_name) values ($1, $2, 'x')",
        [f.userNoProfile, f.householdA],
      ),
    );
    expect(error).toMatch(/permission denied/);
  });
});

describe("household members", () => {
  it("are isolated per household", async () => {
    const names = await as(db, f.userB, async () =>
      (
        await db.query("select display_name from public.household_members")
      ).rows.map((r) => r.display_name),
    );
    expect(names).toEqual(["Child B"]);
  });

  it("cannot be added to another household", async () => {
    const error = await errorAs(db, f.userA, () =>
      db.query(
        "insert into public.household_members (household_id, display_name) values ($1, 'x')",
        [f.householdB],
      ),
    );
    expect(error).toMatch(/row-level security/);
  });

  it("can be added to your own household", async () => {
    const count = await as(
      db,
      f.userA,
      async () =>
        (
          await db.query(
            "insert into public.household_members (household_id, display_name, relationship) values ($1, 'Baby', 'child')",
            [f.householdA],
          )
        ).rowCount,
    );
    expect(count).toBe(1);
  });

  it("cannot be deleted by another household", async () => {
    const count = await as(
      db,
      f.userB,
      async () =>
        (
          await db.query(
            "delete from public.household_members where household_id = $1",
            [f.householdA],
          )
        ).rowCount,
    );
    expect(count).toBe(0);
  });
});

describe("audit log", () => {
  it("shows only your household's events", async () => {
    const rows = await as(
      db,
      f.userA,
      async () =>
        (await db.query("select household_id from public.audit_events")).rows,
    );
    expect(rows.every((r) => r.household_id === f.householdA)).toBe(true);
    expect(rows.length).toBeGreaterThan(0);
  });

  it("accepts events you record yourself", async () => {
    const count = await as(
      db,
      f.userA,
      async () =>
        (
          await db.query(
            "insert into public.audit_events (household_id, actor_id, action) values ($1, $2, 'test')",
            [f.householdA, f.userA],
          )
        ).rowCount,
    );
    expect(count).toBe(1);
  });

  it("rejects events recorded in someone else's name", async () => {
    const error = await errorAs(db, f.userA, () =>
      db.query(
        "insert into public.audit_events (household_id, actor_id, action) values ($1, $2, 'fake')",
        [f.householdA, f.userA2],
      ),
    );
    expect(error).toMatch(/row-level security/);
  });

  it("is append-only", async () => {
    const update = await errorAs(db, f.userA, () =>
      db.query("update public.audit_events set action = 'x'"),
    );
    const remove = await errorAs(db, f.userA, () =>
      db.query("delete from public.audit_events"),
    );
    expect(update).toMatch(/permission denied/);
    expect(remove).toMatch(/permission denied/);
  });
});

describe("a signed-in user without a household", () => {
  it("sees nothing", async () => {
    const counts = await as(db, f.userNoProfile, async () => {
      const result: number[] = [];
      for (const table of [
        "households",
        "profiles",
        "household_members",
        "audit_events",
      ]) {
        result.push(
          (await db.query(`select 1 from public.${table}`)).rowCount ?? 0,
        );
      }
      return result;
    });
    expect(counts).toEqual([0, 0, 0, 0]);
  });
});
