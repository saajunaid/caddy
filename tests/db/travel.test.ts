import type { Client } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { as, connect, errorAs, seed, type Fixture } from "./helpers";

let db: Client;
let f: Fixture;
let tripA: string;
let tripB: string;
let candidateA: string;
let candidateB: string;
let rateTry: string;
let memberB: string;

const one = async (sql: string, params: unknown[] = []) =>
  (await db.query(sql, params)).rows[0];

beforeAll(async () => {
  db = await connect();
  f = await seed(db);
  rateTry = (
    await one(
      "insert into public.fx_rates (rate_date, currency, rate) values ('2026-10-20', 'TRY', 55.6009) returning id",
    )
  ).id;
  await db.query(
    "insert into public.fx_rates (rate_date, currency, rate) values ('2026-10-20', 'GBP', 0.84028)",
  );
  const trip = async (household: string, name: string) =>
    (
      await one(
        `insert into public.trips (household_id, name, date_from, date_to, nights_min, nights_max)
         values ($1, $2, '2027-02-14', '2027-02-22', 6, 7) returning id`,
        [household, name],
      )
    ).id as string;
  tripA = await trip(f.householdA, "Mid-term A");
  tripB = await trip(f.householdB, "Mid-term B");
  const candidate = async (trip: string, household: string) =>
    (
      await one(
        `insert into public.trip_candidates (trip_id, household_id, destination, outbound_date, return_date)
         values ($1, $2, 'Albufeira', '2027-02-14', '2027-02-20') returning id`,
        [trip, household],
      )
    ).id as string;
  candidateA = await candidate(tripA, f.householdA);
  candidateB = await candidate(tripB, f.householdB);
  await db.query(
    `insert into public.trip_components (candidate_id, household_id, kind, provider, price_minor, currency)
     values ($1, $2, 'flight', 'Ryanair', 61200, 'EUR'), ($3, $4, 'flight', 'Aer Lingus', 90000, 'EUR')`,
    [candidateA, f.householdA, candidateB, f.householdB],
  );
  await db.query(
    `insert into public.trip_travellers (trip_id, household_id, name, is_child, age_at_travel, confirmed)
     values ($1, $2, 'Child A', true, 8, true), ($3, $4, 'Child B', true, 4, true)`,
    [tripA, f.householdA, tripB, f.householdB],
  );
  memberB = (
    await one(
      "select id from public.household_members where household_id = $1 limit 1",
      [f.householdB],
    )
  ).id;
});

afterAll(async () => {
  await db.end();
});

describe("trips and their parts", () => {
  it("are visible only to their household", async () => {
    const rows = await as(db, f.userA, async () => ({
      trips: (await db.query("select id from public.trips")).rows.map(
        (r) => r.id,
      ),
      travellers: (await db.query("select name from public.trip_travellers"))
        .rows,
      candidates: (
        await db.query("select id from public.trip_candidates")
      ).rows.map((r) => r.id),
      components: (
        await db.query("select provider from public.trip_components")
      ).rows,
    }));
    expect(rows.trips).toEqual([tripA]);
    expect(rows.travellers).toEqual([{ name: "Child A" }]);
    expect(rows.candidates).toEqual([candidateA]);
    expect(rows.components).toEqual([{ provider: "Ryanair" }]);
  });

  it("are hidden from anonymous visitors and accounts without a household", async () => {
    for (const user of [null, f.userNoProfile]) {
      const error = await errorAs(db, user, () =>
        db.query("select 1 from public.trips"),
      );
      if (error) {
        expect(error).toMatch(/permission denied/);
      } else {
        const count = await as(
          db,
          user,
          async () => (await db.query("select 1 from public.trips")).rowCount,
        );
        expect(count).toBe(0);
      }
    }
  });

  it("let both adults of a household add and edit trips", async () => {
    const name = await as(db, f.userA2, async () => {
      const { id } = await one(
        `insert into public.trips (household_id, name, date_from, date_to) values ($1, 'Easter', '2027-03-27', '2027-04-11') returning id`,
        [f.householdA],
      );
      await db.query(
        "update public.trips set name = 'Easter 2027' where id = $1",
        [id],
      );
      return (await one("select name from public.trips where id = $1", [id]))
        .name;
    });
    expect(name).toBe("Easter 2027");
  });

  it("can't be created in another household", async () => {
    const error = await errorAs(db, f.userA, () =>
      db.query(
        `insert into public.trips (household_id, name, date_from, date_to) values ($1, 'x', '2027-01-01', '2027-01-02')`,
        [f.householdB],
      ),
    );
    expect(error).toMatch(/row-level security/);
  });

  it("can't be edited or deleted by another household", async () => {
    const result = await as(db, f.userB, async () => ({
      updated: (
        await db.query(
          "update public.trips set name = 'hijack' where id = $1",
          [tripA],
        )
      ).rowCount,
      deleted: (
        await db.query(
          "delete from public.trip_components where candidate_id = $1",
          [candidateA],
        )
      ).rowCount,
    }));
    expect(result).toEqual({ updated: 0, deleted: 0 });
  });

  it("can't attach an option to another household's trip", async () => {
    const error = await errorAs(db, f.userA, () =>
      db.query(
        `insert into public.trip_candidates (trip_id, household_id, destination, outbound_date, return_date)
         values ($1, $2, 'x', '2027-02-14', '2027-02-20')`,
        [tripB, f.householdA],
      ),
    );
    expect(error).toMatch(/foreign key/);
  });

  it("can't link a traveller to another household's member", async () => {
    const error = await errorAs(db, f.userA, () =>
      db.query(
        `insert into public.trip_travellers (trip_id, household_id, member_id, name) values ($1, $2, $3, 'x')`,
        [tripA, f.householdA, memberB],
      ),
    );
    expect(error).toMatch(/row-level security/);
  });

  it("don't confirm a child's age that isn't known", async () => {
    const error = await errorAs(db, f.userA, () =>
      db.query(
        `insert into public.trip_travellers (trip_id, household_id, name, is_child, confirmed) values ($1, $2, 'x', true, true)`,
        [tripA, f.householdA],
      ),
    );
    expect(error).toMatch(/check constraint/);
  });

  it("compute nights from the option's dates", async () => {
    const { nights } = await one(
      "select nights from public.trip_candidates where id = $1",
      [candidateA],
    );
    expect(nights).toBe(6);
  });

  it("are removed with their trip", async () => {
    const left = await as(db, f.userA, async () => {
      await db.query("delete from public.trips where id = $1", [tripA]);
      return (
        await db.query(
          "select 1 from public.trip_components where candidate_id = $1",
          [candidateA],
        )
      ).rowCount;
    });
    expect(left).toBe(0);
  });
});

describe("trip prices", () => {
  const insert = (fields: Record<string, unknown>) => {
    const row = {
      candidate_id: candidateA,
      household_id: f.householdA,
      kind: "transfer",
      provider: "Shuttle Co",
      price_minor: 215000,
      currency: "TRY",
      ...fields,
    };
    const keys = Object.keys(row);
    return db.query(
      `insert into public.trip_components (${keys.join(", ")}) values (${keys.map((_, i) => `$${i + 1}`).join(", ")})`,
      Object.values(row),
    );
  };

  it("pin the exchange rate used", async () => {
    const error = await errorAs(db, f.userA, () =>
      insert({ fx_rate_id: rateTry }),
    );
    expect(error).toBeNull();
  });

  it("can't use another currency's rate", async () => {
    const error = await errorAs(db, f.userA, () =>
      insert({ currency: "GBP", fx_rate_id: rateTry }),
    );
    expect(error).toMatch(/foreign key/);
  });

  it("don't take a rate for euro prices", async () => {
    const error = await errorAs(db, f.userA, () =>
      insert({ currency: "EUR", fx_rate_id: rateTry }),
    );
    expect(error).toMatch(/check constraint/);
  });

  it("only accept https booking links", async () => {
    const error = await errorAs(db, f.userA, () =>
      insert({ booking_url: "http://example.com/deal" }),
    );
    expect(error).toMatch(/check constraint/);
    const ok = await errorAs(db, f.userA, () =>
      insert({ booking_url: "https://example.com/deal" }),
    );
    expect(ok).toBeNull();
  });

  it("need a provider unless they're an estimate", async () => {
    expect(
      await errorAs(db, f.userA, () => insert({ provider: null })),
    ).toMatch(/check constraint/);
    expect(
      await errorAs(db, f.userA, () =>
        insert({ provider: null, is_estimate: true }),
      ),
    ).toBeNull();
  });

  it("never store negative amounts", async () => {
    expect(
      await errorAs(db, f.userA, () => insert({ price_minor: -1 })),
    ).toMatch(/check constraint/);
  });
});

describe("exchange rates", () => {
  it("are readable by household members", async () => {
    const currencies = await as(
      db,
      f.userA,
      async () =>
        (
          await db.query(
            "select currency, rate::text as rate from public.fx_rates order by currency",
          )
        ).rows,
    );
    expect(currencies).toEqual([
      { currency: "GBP", rate: "0.84028000" },
      { currency: "TRY", rate: "55.60090000" },
    ]);
  });

  it("are hidden from accounts without a household", async () => {
    const count = await as(
      db,
      f.userNoProfile,
      async () => (await db.query("select 1 from public.fx_rates")).rowCount,
    );
    expect(count).toBe(0);
  });

  it("can't be written by signed-in users", async () => {
    const error = await errorAs(db, f.userA, () =>
      db.query(
        "insert into public.fx_rates (rate_date, currency, rate) values ('2026-10-21', 'USD', 1.1)",
      ),
    );
    expect(error).toMatch(/permission denied/);
  });

  it("keep one rate per currency per day", async () => {
    await expect(
      db.query(
        "insert into public.fx_rates (rate_date, currency, rate) values ('2026-10-20', 'TRY', 50)",
      ),
    ).rejects.toThrow(/duplicate key/);
  });
});
