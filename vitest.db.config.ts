import { defineConfig } from "vitest/config";

// Database tests: migrations + row-level security against a disposable Postgres (DATABASE_URL).
export default defineConfig({
  test: {
    environment: "node",
    include: ["tests/db/**/*.test.ts"],
    globalSetup: ["./tests/db/setup.ts"],
    fileParallelism: false,
    testTimeout: 20_000,
  },
});
