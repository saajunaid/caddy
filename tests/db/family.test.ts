import { createHash, randomBytes } from "node:crypto";
import type { Client } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { as, connect, errorAs, seed, type Fixture } from "./helpers";

let db: Client;
let f: Fixture;
let childA: string;
let childB: string;
let listA: string;
let listB: string;
let schoolA: string;
let schoolB: string;
let tokenA: string;

const hash = (token: string) =>
  createHash("sha256").update(token).digest("hex");

beforeAll(async () => {
  db = await connect();
  f = await seed(db);
  const member = async (household: string) =>
    (
      await db.query(
        "select id from public.household_members where household_id = $1 and relationship = 'child'",
        [household],
      )
    ).rows[0].id as string;
  childA = await member(f.householdA);
  childB = await member(f.householdB);

  await db.query(
    `insert into public.tasks (household_id, title, due_on) values ($1, 'Task A', '2026-10-21'), ($2, 'Task B', '2026-10-21')`,
    [f.householdA, f.householdB],
  );
  await db.query(
    `insert into public.events (household_id, title, starts_at) values ($1, 'Event A', now()), ($2, 'Event B', now())`,
    [f.householdA, f.householdB],
  );
  const list = async (household: string) =>
    (
      await db.query(
        "insert into public.lists (household_id, name, kind) values ($1, 'Shopping', 'shopping') returning id",
        [household],
      )
    ).rows[0].id as string;
  listA = await list(f.householdA);
  listB = await list(f.householdB);
  await db.query(
    "insert into public.list_items (list_id, household_id, text) values ($1, $2, 'Milk'), ($3, $4, 'Eggs')",
    [listA, f.householdA, listB, f.householdB],
  );
  const school = async (household: string) =>
    (
      await db.query(
        "insert into public.schools (household_id, name, level) values ($1, 'Scoil', 'primary') returning id",
        [household],
      )
    ).rows[0].id as string;
  schoolA = await school(f.householdA);
  schoolB = await school(f.householdB);
  await db.query(
    `insert into public.school_applications (household_id, school_id, child_member_id, intake_year)
     values ($1, $2, $3, 2027), ($4, $5, $6, 2027)`,
    [f.householdA, schoolA, childA, f.householdB, schoolB, childB],
  );
  tokenA = randomBytes(32).toString("base64url");
  await db.query(
    "insert into public.ical_tokens (household_id, token_hash, created_by) values ($1, $2, $3), ($4, $5, $6)",
    [
      f.householdA,
      hash(tokenA),
      f.userA,
      f.householdB,
      hash(randomBytes(32).toString("base64url")),
      f.userB,
    ],
  );
});

afterAll(async () => {
  await db.end();
});

const TABLES: [string, string][] = [
  ["tasks", "title"],
  ["events", "title"],
  ["lists", "name"],
  ["list_items", "text"],
  ["schools", "name"],
  ["school_applications", "intake_year"],
];

describe("family tables", () => {
  it.each(TABLES)("%s are isolated per household", async (table) => {
    const households = await as(db, f.userB, async () =>
      (await db.query(`select household_id from public.${table}`)).rows.map(
        (r) => r.household_id,
      ),
    );
    expect(households.length).toBeGreaterThan(0);
    expect(new Set(households)).toEqual(new Set([f.householdB]));
  });

  it.each(TABLES)("%s are hidden from anonymous visitors", async (table) => {
    const error = await errorAs(db, null, () =>
      db.query(`select 1 from public.${table}`),
    );
    expect(error).toMatch(/permission denied/);
  });

  it.each(TABLES)(
    "%s can't be changed in another household",
    async (table, column) => {
      const value = column === "intake_year" ? "2030" : "'hacked'";
      const updated = await as(
        db,
        f.userA,
        async () =>
          (
            await db.query(
              `update public.${table} set ${column} = ${value} where household_id = $1`,
              [f.householdB],
            )
          ).rowCount,
      );
      expect(updated).toBe(0);
      const deleted = await as(
        db,
        f.userA,
        async () =>
          (
            await db.query(
              `delete from public.${table} where household_id = $1`,
              [f.householdB],
            )
          ).rowCount,
      );
      expect(deleted).toBe(0);
    },
  );

  it("members can add, complete and delete their own tasks", async () => {
    const result = await as(db, f.userA, async () => {
      const inserted = await db.query(
        "insert into public.tasks (household_id, title, assignee_member_id) values ($1, 'Mine', $2) returning id, created_by",
        [f.householdA, childA],
      );
      const id = inserted.rows[0].id;
      await db.query(
        "update public.tasks set status = 'done', completed_at = now(), completed_by = $2 where id = $1",
        [id, f.userA],
      );
      const deleted = await db.query("delete from public.tasks where id = $1", [
        id,
      ]);
      return {
        createdBy: inserted.rows[0].created_by,
        deleted: deleted.rowCount,
      };
    });
    expect(result).toEqual({ createdBy: f.userA, deleted: 1 });
  });

  it("refuse rows for another household", async () => {
    const error = await errorAs(db, f.userA, () =>
      db.query(
        "insert into public.tasks (household_id, title) values ($1, 'x')",
        [f.householdB],
      ),
    );
    expect(error).toMatch(/row-level security/);
  });

  it("refuse assignees, children and lists from another household", async () => {
    const assignee = await errorAs(db, f.userA, () =>
      db.query(
        "insert into public.tasks (household_id, title, assignee_member_id) values ($1, 'x', $2)",
        [f.householdA, childB],
      ),
    );
    expect(assignee).toMatch(/foreign key/);
    const application = await errorAs(db, f.userA, () =>
      db.query(
        "insert into public.school_applications (household_id, school_id, child_member_id, intake_year) values ($1, $2, $3, 2028)",
        [f.householdA, schoolA, childB],
      ),
    );
    expect(application).toMatch(/foreign key/);
    const item = await errorAs(db, f.userA, () =>
      db.query(
        "insert into public.list_items (list_id, household_id, text) values ($1, $2, 'x')",
        [listB, f.householdA],
      ),
    );
    expect(item).toMatch(/foreign key/);
    const event = await errorAs(db, f.userA, () =>
      db.query(
        "insert into public.events (household_id, title, starts_at, member_ids) values ($1, 'x', now(), $2)",
        [f.householdA, [childB]],
      ),
    );
    expect(event).toMatch(/same household/);
  });

  it("keep tasks when their assignee is removed", async () => {
    const assignee = await as(db, f.userA, async () => {
      const task = await db.query(
        "insert into public.tasks (household_id, title, assignee_member_id) values ($1, 'x', $2) returning id",
        [f.householdA, childA],
      );
      await db.query(
        "delete from public.school_applications where child_member_id = $1",
        [childA],
      );
      await db.query("delete from public.household_members where id = $1", [
        childA,
      ]);
      return (
        await db.query(
          "select household_id, assignee_member_id from public.tasks where id = $1",
          [task.rows[0].id],
        )
      ).rows[0];
    });
    expect(assignee).toEqual({
      household_id: f.householdA,
      assignee_member_id: null,
    });
  });

  it("check the shape of all-day events and repeating tasks", async () => {
    const allDay = await errorAs(db, f.userA, () =>
      db.query(
        "insert into public.events (household_id, title, starts_at, all_day) values ($1, 'x', now(), true)",
        [f.householdA],
      ),
    );
    expect(allDay).toMatch(/check constraint/);
    const repeat = await errorAs(db, f.userA, () =>
      db.query(
        "insert into public.tasks (household_id, title, recurrence) values ($1, 'x', 'weekly')",
        [f.householdA],
      ),
    );
    expect(repeat).toMatch(/check constraint/);
  });
});

describe("calendar feed tokens", () => {
  it("never expose token hashes to signed-in users", async () => {
    const error = await errorAs(db, f.userA, () =>
      db.query("select token_hash from public.ical_tokens"),
    );
    expect(error).toMatch(/permission denied/);
  });

  it("list only your household's feeds", async () => {
    const rows = await as(db, f.userB, async () =>
      (
        await db.query("select household_id, label from public.ical_tokens")
      ).rows.map((r) => r.household_id),
    );
    expect(rows).toEqual([f.householdB]);
  });

  it("can't be looked up by hash, even across households", async () => {
    const error = await errorAs(db, f.userB, () =>
      db.query("select id from public.ical_tokens where token_hash = $1", [
        hash(tokenA),
      ]),
    );
    expect(error).toMatch(/permission denied/);
  });

  it("are hidden from anonymous visitors", async () => {
    const error = await errorAs(db, null, () =>
      db.query("select id from public.ical_tokens"),
    );
    expect(error).toMatch(/permission denied/);
  });

  it("store only a SHA-256 hex hash", async () => {
    const error = await errorAs(db, f.userA, () =>
      db.query(
        "insert into public.ical_tokens (household_id, token_hash, created_by) values ($1, $2, $3)",
        [f.householdA, "plain-token-not-a-hash", f.userA],
      ),
    );
    expect(error).toMatch(/check constraint/);
  });

  it("can be created for your own household only, as yourself", async () => {
    const created = await as(
      db,
      f.userA,
      async () =>
        (
          await db.query(
            "insert into public.ical_tokens (household_id, token_hash, created_by) values ($1, $2, $3) returning id",
            [f.householdA, hash("new"), f.userA],
          )
        ).rowCount,
    );
    expect(created).toBe(1);
    const otherHousehold = await errorAs(db, f.userA, () =>
      db.query(
        "insert into public.ical_tokens (household_id, token_hash, created_by) values ($1, $2, $3)",
        [f.householdB, hash("other"), f.userA],
      ),
    );
    expect(otherHousehold).toMatch(/row-level security/);
  });

  it("can be revoked but not re-pointed or rehashed", async () => {
    const revoked = await as(
      db,
      f.userA,
      async () =>
        (await db.query("update public.ical_tokens set revoked_at = now()"))
          .rowCount,
    );
    expect(revoked).toBe(1);
    const rehash = await errorAs(db, f.userA, () =>
      db.query("update public.ical_tokens set token_hash = $1", [hash("x")]),
    );
    expect(rehash).toMatch(/permission denied/);
    const otherRevoked = await as(
      db,
      f.userA,
      async () =>
        (
          await db.query(
            "update public.ical_tokens set revoked_at = now() where household_id = $1",
            [f.householdB],
          )
        ).rowCount,
    );
    expect(otherRevoked).toBe(0);
  });
});
