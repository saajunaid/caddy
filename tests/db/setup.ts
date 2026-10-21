import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { Client } from "pg";

/**
 * Vitest global setup for database tests: recreate a scratch database, apply the auth shim,
 * then every migration in order. Requires DATABASE_URL pointing at a disposable Postgres.
 */
// Separate names let several sessions share one Postgres container without clashing.
const TEST_DB = process.env.TEST_DB_NAME ?? "caddy_test";
if (!/^[a-z0-9_]+$/.test(TEST_DB))
  throw new Error("TEST_DB_NAME must be lowercase letters, digits or _");

export default async function setup() {
  const adminUrl = process.env.DATABASE_URL;
  if (!adminUrl) throw new Error("DATABASE_URL is required for database tests");
  if (/supabase\.(co|com)/.test(adminUrl)) {
    throw new Error(
      "Refusing to run database tests against a Supabase project",
    );
  }

  const admin = new Client({ connectionString: adminUrl });
  await admin.connect();
  await admin.query(`drop database if exists ${TEST_DB} with (force)`);
  await admin.query(`create database ${TEST_DB}`);
  await admin.end();

  const testUrl = new URL(adminUrl);
  testUrl.pathname = `/${TEST_DB}`;
  const db = new Client({ connectionString: testUrl.toString() });
  await db.connect();

  const root = path.resolve(import.meta.dirname, "../../supabase");
  await db.query(
    await readFile(path.join(root, "tests/auth-shim.sql"), "utf8"),
  );

  const migrations = (await readdir(path.join(root, "migrations")))
    .filter((file) => file.endsWith(".sql"))
    .sort();
  for (const file of migrations) {
    try {
      await db.query(
        await readFile(path.join(root, "migrations", file), "utf8"),
      );
    } catch (error) {
      throw new Error(`Migration ${file} failed: ${(error as Error).message}`);
    }
  }
  await db.end();

  process.env.TEST_DATABASE_URL = testUrl.toString();
}
