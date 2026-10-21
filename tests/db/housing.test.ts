import type { Client } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { parseListingPage } from "../../src/modules/housing/server/parser.ts";
import { buildSnapshot } from "../../src/modules/housing/server/snapshot.ts";
import { fixture } from "../../src/modules/housing/server/testing/fixtures.ts";
import {
  buildListingChange,
  LISTING_COLUMNS,
  type ListingRow,
} from "../../src/modules/housing/server/upsert.ts";
import { as, connect, errorAs, seed, type Fixture } from "./helpers";

let db: Client;
let f: Fixture;
let listingId: string;
let otherListingId: string;
let appB: string;

const HOUSING_TABLES = [
  "housing_listings",
  "housing_observations",
  "housing_applications",
  "housing_projects",
  "research_items",
];

/** The same statement the Supabase upsert issues: insert … on conflict (source, external_id) do update. */
async function upsertListing(row: ListingRow): Promise<string> {
  const columns = [...LISTING_COLUMNS];
  const values = columns.map((c) => {
    const value = row[c];
    return value !== null && typeof value === "object"
      ? JSON.stringify(value)
      : value;
  });
  const sql = `insert into public.housing_listings (${columns.join(", ")})
    values (${columns.map((_, i) => `$${i + 1}`).join(", ")})
    on conflict (source, external_id) do update set
    ${columns.map((c) => `${c} = excluded.${c}`).join(", ")}
    returning id`;
  await db.query("begin");
  try {
    await db.query("set local role service_role");
    const { rows } = await db.query(sql, values);
    await db.query("commit");
    return rows[0].id as string;
  } catch (error) {
    await db.query("rollback");
    throw error;
  }
}

function woodbrookRow(now: Date): ListingRow {
  const snapshot = buildSnapshot({
    externalId: "woodbrook1",
    card: null,
    page: parseListingPage(fixture("listing-woodbrook1.html")),
  });
  return buildListingChange(snapshot, null, now, "2026-10-21").row;
}

beforeAll(async () => {
  db = await connect();
  f = await seed(db);
  listingId = await upsertListing(
    woodbrookRow(new Date("2026-10-21T06:15:00Z")),
  );
  const other = woodbrookRow(new Date("2026-10-21T06:15:00Z"));
  otherListingId = await upsertListing({
    ...other,
    external_id: `other-${f.householdA}`,
    url: "https://newstarterhomes.ie/rent/other/",
  });
  await db.query(
    `insert into public.housing_observations (listing_id, content_hash, snapshot)
     values ($1, 'h', '{}')`,
    [listingId],
  );
  await db.query(
    `insert into public.housing_applications (household_id, listing_id, status, outcome_text, notes)
     values ($1, $2, 'applied', 'Your application has been received.', 'Sent payslips')`,
    [f.householdA, listingId],
  );
  appB = (
    await db.query(
      `insert into public.housing_applications (household_id, listing_id, status)
       values ($1, $2, 'lottery_entered') returning id`,
      [f.householdB, listingId],
    )
  ).rows[0].id;
  await db.query(
    `insert into public.research_items (title, url, source_name, agent, content_hash)
     values ('News', $1, 'Council', 'test', 'h')`,
    [`https://example.ie/news/${f.householdA}`],
  );
});

afterAll(async () => {
  await db.end();
});

describe("housing tables", () => {
  it("all have row-level security", async () => {
    const { rows } = await db.query(
      "select tablename, rowsecurity from pg_tables where schemaname = 'public' and tablename = any($1)",
      [HOUSING_TABLES],
    );
    expect(rows).toHaveLength(HOUSING_TABLES.length);
    expect(rows.every((r) => r.rowsecurity)).toBe(true);
  });

  it("are closed to anonymous visitors", async () => {
    for (const table of HOUSING_TABLES) {
      const error = await errorAs(db, null, () =>
        db.query(`select * from public.${table}`),
      );
      expect(error, table).toMatch(/permission denied/);
    }
  });
});

describe("listings, history and news (shared public facts)", () => {
  it("are readable by any adult in a household", async () => {
    for (const user of [f.userA, f.userB]) {
      const counts = await as(db, user, async () => [
        (
          await db.query(
            "select 1 from public.housing_listings where id = $1",
            [listingId],
          )
        ).rowCount,
        (
          await db.query(
            "select 1 from public.housing_observations where listing_id = $1",
            [listingId],
          )
        ).rowCount,
        (await db.query("select 1 from public.research_items")).rowCount,
      ]);
      expect(counts).toEqual([1, 1, 1]);
    }
  });

  it("are hidden from accounts without a household", async () => {
    const counts = await as(db, f.userNoProfile, async () => [
      (await db.query("select 1 from public.housing_listings")).rowCount,
      (await db.query("select 1 from public.housing_observations")).rowCount,
      (await db.query("select 1 from public.research_items")).rowCount,
      (await db.query("select 1 from public.housing_projects")).rowCount,
    ]);
    expect(counts).toEqual([0, 0, 0, 0]);
  });

  it("can't be written by signed-in users", async () => {
    const attempts = [
      () =>
        db.query(
          "update public.housing_listings set title = 'x' where id = $1",
          [listingId],
        ),
      () =>
        db.query("delete from public.housing_listings where id = $1", [
          listingId,
        ]),
      () =>
        db.query(
          "insert into public.housing_observations (listing_id, content_hash, snapshot) values ($1, 'x', '{}')",
          [listingId],
        ),
      () =>
        db.query(
          "insert into public.research_items (title, url, source_name, agent, content_hash) values ('x', 'https://x.ie', 'x', 'x', 'x')",
        ),
    ];
    for (const attempt of attempts) {
      expect(await errorAs(db, f.userA, attempt)).toMatch(/permission denied/);
    }
  });

  it("keep their history: a listing with an application can't be deleted", async () => {
    await expect(
      db.query("delete from public.housing_listings where id = $1", [
        listingId,
      ]),
    ).rejects.toThrow(/foreign key/);
  });
});

describe("applications (user-owned)", () => {
  it("are visible only to the household that owns them", async () => {
    const seenByA = await as(
      db,
      f.userA,
      async () =>
        (
          await db.query(
            "select household_id, status from public.housing_applications",
          )
        ).rows,
    );
    expect(seenByA).toEqual([
      { household_id: f.householdA, status: "applied" },
    ]);
    const seenByNobody = await as(
      db,
      f.userNoProfile,
      async () =>
        (await db.query("select 1 from public.housing_applications")).rowCount,
    );
    expect(seenByNobody).toBe(0);
  });

  it("can be added for your own household only", async () => {
    const own = await as(db, f.userA, async () => {
      const { rows } = await db.query(
        `insert into public.housing_applications (household_id, listing_id, status)
         values ($1, $2, 'not_applied') returning updated_by`,
        [f.householdA, otherListingId],
      );
      return rows[0].updated_by;
    });
    expect(own).toBe(f.userA);
    const other = await errorAs(db, f.userA, () =>
      db.query(
        `insert into public.housing_applications (household_id, listing_id, status)
         values ($1, $2, 'applied')`,
        [f.householdB, otherListingId],
      ),
    );
    expect(other).toMatch(/row-level security/);
  });

  it("can be updated by the household, which stamps who changed it", async () => {
    const row = await as(db, f.userA2, async () => {
      const { rows } = await db.query(
        `update public.housing_applications set status = 'offered', next_action = 'Send P60'
         where listing_id = $1 returning status, updated_by`,
        [listingId],
      );
      return rows[0];
    });
    expect(row).toEqual({ status: "offered", updated_by: f.userA2 });
  });

  it("can't be changed by another household", async () => {
    const updated = await as(
      db,
      f.userA,
      async () =>
        (
          await db.query(
            "update public.housing_applications set notes = 'x' where id = $1",
            [appB],
          )
        ).rowCount,
    );
    expect(updated).toBe(0);
  });

  it("can't be moved to another household, re-stamped or deleted", async () => {
    expect(
      await errorAs(db, f.userA, () =>
        db.query("update public.housing_applications set household_id = $1", [
          f.householdB,
        ]),
      ),
    ).toMatch(/permission denied/);
    expect(
      await errorAs(db, f.userA, () =>
        db.query("update public.housing_applications set updated_by = $1", [
          f.userB,
        ]),
      ),
    ).toMatch(/permission denied/);
    expect(
      await errorAs(db, f.userA, () =>
        db.query("delete from public.housing_applications"),
      ),
    ).toMatch(/permission denied/);
  });

  it("survive the daily listing upsert untouched", async () => {
    const before = (
      await db.query(
        "select * from public.housing_applications where household_id = $1 order by id",
        [f.householdA],
      )
    ).rows;
    // The listing changes (closing date, status, units) and is upserted exactly as the job does.
    const changed = woodbrookRow(new Date("2026-10-26T06:15:00Z"));
    changed.closing_date = "2026-11-02";
    changed.status = "closed";
    changed.unit_types = [];
    const id = await upsertListing(changed);
    expect(id).toBe(listingId);
    const after = (
      await db.query(
        "select * from public.housing_applications where household_id = $1 order by id",
        [f.householdA],
      )
    ).rows;
    expect(after).toEqual(before);
    const listing = (
      await db.query(
        "select status, closing_date::text, first_seen_at from public.housing_listings where id = $1",
        [listingId],
      )
    ).rows[0];
    expect(listing).toMatchObject({
      status: "closed",
      closing_date: "2026-11-02",
    });
  });
});

describe("pipeline projects", () => {
  it("are seeded with the two Limerick leads, unconfirmed", async () => {
    const rows = await as(
      db,
      f.userA,
      async () =>
        (
          await db.query(
            "select name, county, cost_rental_confirmed, verification from public.housing_projects order by name",
          )
        ).rows,
    );
    expect(rows).toEqual([
      {
        name: "St Joseph's Hospital site, Limerick",
        county: "Limerick",
        cost_rental_confirmed: "unconfirmed",
        verification: "lead",
      },
      {
        name: "The Gasworks / Dock Road, Limerick",
        county: "Limerick",
        cost_rental_confirmed: "unconfirmed",
        verification: "lead",
      },
    ]);
  });

  it("can be added and edited by household adults, stamping who did it", async () => {
    const stamped = await as(db, f.userB, async () => {
      const { rows } = await db.query(
        `insert into public.housing_projects (name, county, verification) values ('New scheme', 'Cork', 'reported')
         returning id`,
      );
      const { rows: updated } = await db.query(
        "update public.housing_projects set stage = 'Planning granted' where id = $1 returning updated_by",
        [rows[0].id],
      );
      return updated[0].updated_by;
    });
    expect(stamped).toBe(f.userB);
  });

  it("can't be written by accounts without a household, or deleted", async () => {
    expect(
      await errorAs(db, f.userNoProfile, () =>
        db.query("insert into public.housing_projects (name) values ('x')"),
      ),
    ).toMatch(/row-level security/);
    expect(
      await errorAs(db, f.userA, () =>
        db.query("delete from public.housing_projects"),
      ),
    ).toMatch(/permission denied/);
    expect(
      await errorAs(db, f.userA, () =>
        db.query("update public.housing_projects set updated_by = $1", [
          f.userB,
        ]),
      ),
    ).toMatch(/permission denied/);
  });

  it("only accept known confirmation states", async () => {
    expect(
      await errorAs(db, f.userA, () =>
        db.query(
          "insert into public.housing_projects (name, cost_rental_confirmed) values ('x', 'maybe')",
        ),
      ),
    ).toMatch(/check constraint/);
  });
});
