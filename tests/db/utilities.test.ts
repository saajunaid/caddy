import type { Client } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { as, connect, errorAs, seed, type Fixture } from "./helpers";

let db: Client;
let f: Fixture;
let contractA: string;
let contractB: string;

async function insertContract(
  household: string,
  end: string | null,
  supplier = "Electric Ireland",
): Promise<string> {
  const { rows } = await db.query(
    `insert into public.utility_contracts (household_id, utility_type, supplier, meter_type, contract_end)
     values ($1, 'electricity', $2, 'smart_tou', $3) returning id`,
    [household, supplier, end],
  );
  return rows[0].id as string;
}

async function dueOn(id: string): Promise<string | null> {
  const { rows } = await db.query(
    "select comparison_due_on::text as due from public.utility_contracts where id = $1",
    [id],
  );
  return rows[0].due as string | null;
}

beforeAll(async () => {
  db = await connect();
  f = await seed(db);
  contractA = await insertContract(f.householdA, "2026-11-03");
  contractB = await insertContract(f.householdB, "2027-03-14", "Flogas");
  await db.query(
    `insert into public.utility_usage (household_id, contract_id, period_start, period_end, day_kwh)
     values ($1, $2, '2026-09-01', '2026-09-30', 412.5), ($3, $4, '2026-09-01', '2026-09-30', 100)`,
    [f.householdA, contractA, f.householdB, contractB],
  );
  await db.query(
    `insert into public.tariff_offers (household_id, contract_id, supplier, utility_type, day_rate_cents, checked_on)
     values ($1, $2, 'Energia', 'electricity', 34.2, '2026-10-20'), ($3, $4, 'Pinergy', 'electricity', 32.9, '2026-10-20')`,
    [f.householdA, contractA, f.householdB, contractB],
  );
  await db.query(
    `insert into public.utility_comparisons (household_id, contract_id, trigger, dedupe_key)
     values ($1, $2, 'due', 'a'), ($3, $4, 'due', 'b')`,
    [f.householdA, contractA, f.householdB, contractB],
  );
  await db.query(
    "insert into public.utility_preferences (household_id) values ($1), ($2)",
    [f.householdA, f.householdB],
  );
});

afterAll(async () => {
  await db.end();
});

describe("comparison_due_on", () => {
  it("is exactly 14 calendar days before the contract end", async () => {
    expect(await dueOn(contractA)).toBe("2026-10-20");
  });

  it("follows the end date when it changes, and clears when it's unknown", async () => {
    const id = await insertContract(f.householdA, "2027-04-10");
    expect(await dueOn(id)).toBe("2027-03-27"); // DST weekend in between
    await db.query(
      "update public.utility_contracts set contract_end = '2028-03-10' where id = $1",
      [id],
    );
    expect(await dueOn(id)).toBe("2028-02-25"); // leap year: 29 Feb counted
    await db.query(
      "update public.utility_contracts set contract_end = null where id = $1",
      [id],
    );
    expect(await dueOn(id)).toBeNull();
  });

  it("can't be written directly, even by the service role", async () => {
    await expect(
      db.query(
        "update public.utility_contracts set comparison_due_on = '2026-01-01' where id = $1",
        [contractA],
      ),
    ).rejects.toThrow(/generated|only be updated to DEFAULT/);
  });

  it("is recalculated when a signed-in member edits the end date", async () => {
    const due = await as(db, f.userA, async () => {
      await db.query(
        "update public.utility_contracts set contract_end = '2027-01-01' where id = $1",
        [contractA],
      );
      return (
        await db.query(
          "select comparison_due_on::text as due from public.utility_contracts where id = $1",
          [contractA],
        )
      ).rows[0].due;
    });
    expect(due).toBe("2026-12-18"); // across the year boundary
    expect(await dueOn(contractA)).toBe("2026-10-20"); // rolled back
  });
});

describe("household isolation", () => {
  const tables = [
    "utility_contracts",
    "utility_usage",
    "tariff_offers",
    "utility_comparisons",
    "utility_preferences",
  ];

  for (const table of tables) {
    it(`${table}: members only see their own household`, async () => {
      const households = await as(db, f.userA, async () =>
        (await db.query(`select household_id from public.${table}`)).rows.map(
          (r) => r.household_id,
        ),
      );
      expect(households.length).toBeGreaterThan(0);
      expect(new Set(households)).toEqual(new Set([f.householdA]));
    });

    it(`${table}: hidden from anonymous visitors and accounts without a household`, async () => {
      expect(
        await errorAs(db, null, () =>
          db.query(`select 1 from public.${table}`),
        ),
      ).toMatch(/permission denied/);
      const count = await as(
        db,
        f.userNoProfile,
        async () => (await db.query(`select 1 from public.${table}`)).rowCount,
      );
      expect(count).toBe(0);
    });
  }

  it("members can't add contracts to another household", async () => {
    const error = await errorAs(db, f.userA, () =>
      db.query(
        "insert into public.utility_contracts (household_id, utility_type, supplier) values ($1, 'gas', 'X')",
        [f.householdB],
      ),
    );
    expect(error).toMatch(/row-level security/);
  });

  it("members can't edit or delete another household's offers", async () => {
    const changed = await as(db, f.userA, async () => {
      const update = await db.query(
        "update public.tariff_offers set decision = 'selected' where household_id = $1",
        [f.householdB],
      );
      const remove = await db.query(
        "delete from public.utility_contracts where household_id = $1",
        [f.householdB],
      );
      return (update.rowCount ?? 0) + (remove.rowCount ?? 0);
    });
    expect(changed).toBe(0);
  });

  it("usage and offers can't point at another household's contract", async () => {
    const usage = await errorAs(db, f.userA, () =>
      db.query(
        `insert into public.utility_usage (household_id, contract_id, period_start, period_end, gas_kwh)
         values ($1, $2, '2026-01-01', '2026-02-01', 10)`,
        [f.householdA, contractB],
      ),
    );
    expect(usage).toMatch(/foreign key/);
    const offer = await errorAs(db, f.userA, () =>
      db.query(
        `insert into public.tariff_offers (household_id, contract_id, supplier, utility_type, checked_on)
         values ($1, $2, 'X', 'gas', '2026-10-01')`,
        [f.householdA, contractB],
      ),
    );
    expect(offer).toMatch(/foreign key/);
  });

  it("members save manual comparisons only; due snapshots come from the job", async () => {
    const manual = await errorAs(db, f.userA, () =>
      db.query(
        "insert into public.utility_comparisons (household_id, contract_id, trigger, created_by) values ($1, $2, 'manual', $3)",
        [f.householdA, contractA, f.userA],
      ),
    );
    expect(manual).toBeNull();
    const due = await errorAs(db, f.userA, () =>
      db.query(
        "insert into public.utility_comparisons (household_id, contract_id, trigger, created_by, dedupe_key) values ($1, $2, 'due', $3, 'x')",
        [f.householdA, contractA, f.userA],
      ),
    );
    expect(due).toMatch(/row-level security/);
  });

  it("members can't move a row to another household", async () => {
    const error = await errorAs(db, f.userA, () =>
      db.query(
        "update public.utility_preferences set excluded_suppliers = '{}' where household_id = $1 returning household_id",
        [f.householdA],
      ),
    );
    expect(error).toBeNull();
    const moved = await errorAs(db, f.userA, () =>
      db.query(
        "update public.utility_contracts set household_id = $1 where id = $2",
        [f.householdB, contractA],
      ),
    );
    expect(moved).toMatch(/permission denied/);
  });
});

describe("constraints", () => {
  it("defaults the exclusion list to Bord Gáis Energy", async () => {
    const { rows } = await db.query(
      "select excluded_suppliers from public.utility_preferences where household_id = $1",
      [f.householdA],
    );
    expect(rows[0].excluded_suppliers).toEqual(["Bord Gáis Energy"]);
  });

  it("rejects usage periods that end before they start", async () => {
    await expect(
      db.query(
        `insert into public.utility_usage (household_id, contract_id, period_start, period_end, day_kwh)
         values ($1, $2, '2026-09-30', '2026-09-01', 1)`,
        [f.householdA, contractA],
      ),
    ).rejects.toThrow(/check constraint/);
  });

  it("rejects full account numbers in the account label", async () => {
    await expect(
      db.query(
        "update public.utility_contracts set account_label = '10012345678' where id = $1",
        [contractA],
      ),
    ).rejects.toThrow(/check constraint/);
    await db.query(
      "update public.utility_contracts set account_label = '•••• 4821' where id = $1",
      [contractA],
    );
  });

  it("allows one current renewal per contract", async () => {
    const insert = () =>
      db.query(
        `insert into public.tariff_offers (household_id, contract_id, supplier, utility_type, checked_on, is_current_renewal)
         values ($1, $2, 'Electric Ireland', 'electricity', '2026-10-20', true)`,
        [f.householdA, contractA],
      );
    await insert();
    await expect(insert()).rejects.toThrow(/duplicate key/);
  });

  it("stores rates exactly", async () => {
    const { rows } = await db.query(
      "select day_rate_cents::text as rate from public.tariff_offers where supplier = 'Energia'",
    );
    expect(rows[0].rate).toBe("34.2000");
  });
});
