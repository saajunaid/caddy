import type { Client } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { as, connect, errorAs, seed, type Fixture } from "./helpers";

let db: Client;
let f: Fixture;
let osmPlace: string;
let userPlaceA: string;
let userPlaceB: string;

const insertUserPlace = async (household: string, user: string, name: string) =>
  (
    await db.query(
      `insert into public.places (household_id, source, category, name, latitude, longitude, created_by)
       values ($1, 'user', 'halal', $2, 52.67, -8.55, $3) returning id`,
      [household, name, user],
    )
  ).rows[0].id as string;

beforeAll(async () => {
  db = await connect();
  f = await seed(db);
  osmPlace = (
    await db.query(
      `insert into public.places (source, source_id, category, name, latitude, longitude)
       values ('osm', $1, 'primary', 'Scoil Test', 52.674, -8.553) returning id`,
      [`node/${f.householdA}`],
    )
  ).rows[0].id;
  userPlaceA = await insertUserPlace(f.householdA, f.userA, "A's grill");
  userPlaceB = await insertUserPlace(f.householdB, f.userB, "B's grill");
  await db.query(
    `insert into public.household_place_marks (household_id, place_id, mark) values ($1, $2, 'pinned'), ($3, $2, 'hidden')`,
    [f.householdA, osmPlace, f.householdB],
  );
  await db.query(
    `insert into public.place_searches (anchor_key, latitude, longitude, categories_version, source, status)
     values ($1, 52.674, -8.553, 'test', 'osm', 'ok')`,
    [`test:${f.householdA}`],
  );
});

afterAll(async () => {
  await db.end();
});

const names = async (user: string | null) =>
  as(db, user, async () =>
    (await db.query("select name from public.places order by name")).rows.map(
      (r) => r.name as string,
    ),
  );

describe("places", () => {
  it("show cached places and only your household's own additions", async () => {
    const a = await names(f.userA);
    expect(a).toContain("Scoil Test");
    expect(a).toContain("A's grill");
    expect(a).not.toContain("B's grill");
    const b = await names(f.userB);
    expect(b).toContain("B's grill");
    expect(b).not.toContain("A's grill");
  });

  it("are hidden from anonymous visitors and accounts without a household", async () => {
    expect(
      await errorAs(db, null, () => db.query("select * from public.places")),
    ).toMatch(/permission denied/);
    expect(await names(f.userNoProfile)).toEqual([]);
  });

  it("can be added by members for their own household only", async () => {
    const ok = await as(
      db,
      f.userA,
      async () =>
        (
          await db.query(
            `insert into public.places (household_id, source, category, name, latitude, longitude, created_by)
             values ($1, 'user', 'mosque', 'Our mosque', 52.6, -8.6, $2)`,
            [f.householdA, f.userA],
          )
        ).rowCount,
    );
    expect(ok).toBe(1);
    const otherHousehold = await errorAs(db, f.userA, () =>
      db.query(
        `insert into public.places (household_id, source, category, name, latitude, longitude, created_by)
         values ($1, 'user', 'mosque', 'Sneaky', 52.6, -8.6, $2)`,
        [f.householdB, f.userA],
      ),
    );
    expect(otherHousehold).toMatch(/row-level security/);
  });

  it("can't be written as cached OSM, Google or official data by members", async () => {
    for (const sql of [
      `insert into public.places (source, source_id, category, name, latitude, longitude)
       values ('osm', 'node/1', 'bus', 'Fake stop', 52.6, -8.6)`,
      `insert into public.places (household_id, source, source_id, category, name, latitude, longitude, created_by)
       values ('${f.householdA}', 'google', 'g1', 'halal', 'Fake', 52.6, -8.6, '${f.userA}')`,
    ]) {
      expect(await errorAs(db, f.userA, () => db.query(sql))).toMatch(
        /row-level security|violates check constraint/,
      );
    }
  });

  it("can't be edited or deleted unless they are your household's own", async () => {
    const touched = await as(db, f.userA, async () => {
      const cached = await db.query(
        "update public.places set name = 'Renamed' where id = $1",
        [osmPlace],
      );
      const other = await db.query(
        "update public.places set name = 'Renamed' where id = $1",
        [userPlaceB],
      );
      const deleted = await db.query(
        "delete from public.places where id in ($1, $2)",
        [osmPlace, userPlaceB],
      );
      const own = await db.query(
        "update public.places set name = 'Renamed' where id = $1",
        [userPlaceA],
      );
      return [cached.rowCount, other.rowCount, deleted.rowCount, own.rowCount];
    });
    expect(touched).toEqual([0, 0, 0, 1]);
  });

  it("can't be moved to another household", async () => {
    const error = await errorAs(db, f.userA, () =>
      db.query("update public.places set household_id = $1 where id = $2", [
        f.householdB,
        userPlaceA,
      ]),
    );
    expect(error).toMatch(/permission denied/);
  });
});

describe("place searches", () => {
  it("are readable by members but never writable", async () => {
    const count = await as(
      db,
      f.userA,
      async () =>
        (await db.query("select 1 from public.place_searches")).rowCount,
    );
    expect(count).toBeGreaterThanOrEqual(1);
    const error = await errorAs(db, f.userA, () =>
      db.query(
        `insert into public.place_searches (anchor_key, latitude, longitude, categories_version, source, status)
         values ('x', 1, 1, 'v', 'osm', 'ok')`,
      ),
    );
    expect(error).toMatch(/permission denied/);
    const none = await as(
      db,
      f.userNoProfile,
      async () =>
        (await db.query("select 1 from public.place_searches")).rowCount,
    );
    expect(none).toBe(0);
  });
});

describe("household place marks", () => {
  it("are isolated per household", async () => {
    const marks = await as(db, f.userA, async () =>
      (
        await db.query("select mark from public.household_place_marks")
      ).rows.map((r) => r.mark),
    );
    expect(marks).toEqual(["pinned"]);
  });

  it("can't point at another household's private place", async () => {
    const error = await errorAs(db, f.userA, () =>
      db.query(
        "insert into public.household_place_marks (household_id, place_id, mark) values ($1, $2, 'pinned')",
        [f.householdA, userPlaceB],
      ),
    );
    expect(error).toMatch(/row-level security/);
  });

  it("can't be written for another household", async () => {
    const error = await errorAs(db, f.userA, () =>
      db.query(
        "insert into public.household_place_marks (household_id, place_id, mark) values ($1, $2, 'pinned')",
        [f.householdB, userPlaceA],
      ),
    );
    expect(error).toMatch(/row-level security/);
    const changed = await as(
      db,
      f.userA,
      async () =>
        (
          await db.query(
            "update public.household_place_marks set mark = 'pinned' where household_id = $1",
            [f.householdB],
          )
        ).rowCount,
    );
    expect(changed).toBe(0);
  });

  it("can be changed by members of the household", async () => {
    const changed = await as(
      db,
      f.userA2,
      async () =>
        (
          await db.query(
            "update public.household_place_marks set mark = 'hidden', note = 'Closed down' where place_id = $1",
            [osmPlace],
          )
        ).rowCount,
    );
    expect(changed).toBe(1);
  });
});
