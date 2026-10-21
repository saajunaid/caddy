// Every scheduled job. Module sessions add one entry each (one-line import + one array item).
// Shared with GitHub Actions scripts: relative imports with .ts, no Next.js APIs.
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "../../lib/supabase/database.types.ts";
import { dublinDate } from "../domain/dates.ts";
import type { JobContext } from "./runner.ts";
import { placesRefreshJob } from "../../modules/places/server/job.ts";

export type JobGroup = "daily" | "weekly";

export type JobDefinition = {
  type: string;
  group: JobGroup;
  description: string;
  /** Unique key per period so retries and double triggers never repeat finished work. */
  idempotencyKey(now: Date): string;
  run(ctx: JobContext, admin: SupabaseClient<Database>): Promise<void>;
};

/** Proves the scheduler, database and ledger work end to end. */
const heartbeat: JobDefinition = {
  type: "heartbeat",
  group: "daily",
  description: "Daily check that background jobs can reach the database",
  idempotencyKey: (now) => `heartbeat:${dublinDate(now)}`,
  async run(ctx, admin) {
    const { count, error } = await admin
      .from("households")
      .select("id", { count: "exact", head: true });
    await ctx.recordSource({
      source: "database",
      status: error ? "failed" : "ok",
      itemsSeen: count ?? undefined,
      error: error?.message,
    });
    ctx.setSummary(
      error ? "Database unreachable" : "Scheduler and database OK",
    );
  },
};

export const JOBS: readonly JobDefinition[] = [heartbeat, placesRefreshJob];
