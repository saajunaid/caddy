import { randomUUID } from "node:crypto";
import { Client } from "pg";

export async function connect(): Promise<Client> {
  const url = process.env.TEST_DATABASE_URL;
  if (!url)
    throw new Error(
      "TEST_DATABASE_URL not set; run through vitest.db.config.ts",
    );
  const client = new Client({ connectionString: url });
  await client.connect();
  return client;
}

export type Fixture = {
  householdA: string;
  householdB: string;
  userA: string;
  userA2: string;
  userB: string;
  userNoProfile: string;
};

/** Two households, two adults in A, one in B, and a signed-in user with no household. */
export async function seed(db: Client): Promise<Fixture> {
  const f: Fixture = {
    householdA: randomUUID(),
    householdB: randomUUID(),
    userA: randomUUID(),
    userA2: randomUUID(),
    userB: randomUUID(),
    userNoProfile: randomUUID(),
  };
  for (const id of [f.userA, f.userA2, f.userB, f.userNoProfile]) {
    await db.query("insert into auth.users (id, email) values ($1, $2)", [
      id,
      `${id}@example.test`,
    ]);
  }
  await db.query(
    "insert into public.households (id, name) values ($1, 'A'), ($2, 'B')",
    [f.householdA, f.householdB],
  );
  await db.query(
    `insert into public.profiles (user_id, household_id, display_name)
     values ($1, $4, 'Adult A1'), ($2, $4, 'Adult A2'), ($3, $5, 'Adult B1')`,
    [f.userA, f.userA2, f.userB, f.householdA, f.householdB],
  );
  await db.query(
    `insert into public.household_members (household_id, display_name, relationship)
     values ($1, 'Child A', 'child'), ($2, 'Child B', 'child')`,
    [f.householdA, f.householdB],
  );
  await db.query(
    `insert into public.audit_events (household_id, actor_id, action) values ($1, $2, 'seed'), ($3, $4, 'seed')`,
    [f.householdA, f.userA, f.householdB, f.userB],
  );
  return f;
}

/**
 * Runs `fn` as the given user the way Supabase does for API requests:
 * role "authenticated" (or "anon") with the user's id in the JWT claims. Always rolled back.
 */
export async function as<T>(
  db: Client,
  userId: string | null,
  fn: () => Promise<T>,
): Promise<T> {
  await db.query("begin");
  try {
    if (userId) {
      await db.query("set local role authenticated");
      await db.query("select set_config('request.jwt.claims', $1, true)", [
        JSON.stringify({ sub: userId, role: "authenticated" }),
      ]);
    } else {
      await db.query("set local role anon");
    }
    return await fn();
  } finally {
    await db.query("rollback");
  }
}

/** Runs `fn` as that user and returns the database error message, or null if it succeeded. */
export async function errorAs(
  db: Client,
  userId: string | null,
  fn: () => Promise<unknown>,
): Promise<string | null> {
  try {
    await as(db, userId, fn);
    return null;
  } catch (error) {
    return (error as Error).message;
  }
}
