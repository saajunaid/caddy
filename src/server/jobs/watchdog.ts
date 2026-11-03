// "watchdog": a late-morning check that today's daily jobs actually ran. It runs on Vercel's
// scheduler, separate from GitHub Actions, so it still works if GitHub stops the daily jobs
// (paused schedule, outage, expired key). A run that never happened can't report itself.
// Shared code: relative imports with .ts, no Next.js APIs.
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "../../lib/supabase/database.types.ts";
import { dublinDate, dublinHour, type IsoDate } from "../domain/dates.ts";
import { allHouseholdIds, notify } from "../notifications/notify.ts";
import { jobLabel } from "./labels.ts";
import type { JobDefinition } from "./registry.ts";

type Admin = SupabaseClient<Database>;

export const WATCHDOG_JOB = "watchdog";

/** The daily runs (05:55 and 07:25 UTC) are long finished by 10:00 Dublin time. Before that,
 * a missing run may just be late, so the check must not run (or record a run) at all. */
export const WATCHDOG_EARLIEST_HOUR = 10;

export function watchdogDue(now: Date): boolean {
  return dublinHour(now) >= WATCHDOG_EARLIEST_HOUR;
}

type RunRow = { job_type: string; started_at: string };

/** Expected jobs with no run at all today (Dublin), in friendly names. Pure. */
export function missingJobs(
  runs: readonly RunRow[],
  expected: readonly string[],
  today: IsoDate,
): string[] {
  const ranToday = new Set(
    runs
      .filter((run) => dublinDate(new Date(run.started_at)) === today)
      .map((run) => run.job_type),
  );
  return expected
    .filter((type) => !ranToday.has(type))
    .map(jobLabel)
    .sort();
}

/** The alert for missing runs. Pure. */
export function missingRunsAlert(missing: readonly string[]): {
  title: string;
  body: string;
} {
  const all = missing.length;
  return {
    title:
      all === 1
        ? `A daily check didn't run today: ${missing[0]}`
        : "Caddy's daily checks didn't run today",
    body:
      `No run today for: ${missing.join(", ")}. ` +
      "GitHub may have paused the schedule, so Caddy isn't checking for you. See Settings → Background jobs.",
  };
}

/** `expected` is a function so the registry can pass its own job list without a circular import. */
export function makeWatchdogJob(
  expected: () => readonly string[],
): JobDefinition {
  return {
    type: WATCHDOG_JOB,
    group: "watchdog",
    description:
      "Late-morning check that today's daily jobs ran (runs on Vercel)",
    idempotencyKey: (now) => `${WATCHDOG_JOB}:${dublinDate(now)}`,
    async run(ctx, admin: Admin) {
      const today = dublinDate(ctx.now);
      const types = expected();
      const since = new Date(
        ctx.now.getTime() - 26 * 60 * 60 * 1000,
      ).toISOString();
      const { data, error } = await admin
        .from("job_runs")
        .select("job_type, started_at")
        .in("job_type", [...types])
        .gte("started_at", since)
        .limit(1000);
      if (error) {
        await ctx.recordSource({
          source: "job ledger",
          status: "failed",
          error: error.message,
        });
        throw new Error(`Couldn't read the job ledger: ${error.message}`);
      }
      await ctx.recordSource({
        source: "job ledger",
        status: "ok",
        itemsSeen: data.length,
      });

      const missing = missingJobs(data, types, today);
      ctx.setStats({ expected: types.length, missing });
      if (missing.length === 0) {
        ctx.setSummary(`All ${types.length} daily checks ran today`);
        return;
      }
      const alert = missingRunsAlert(missing);
      const households = await allHouseholdIds(admin);
      await notify(
        admin,
        households.map((householdId) => ({
          householdId,
          kind: "system.jobs_missing",
          severity: "critical" as const,
          title: alert.title,
          body: alert.body,
          actionUrl: "/settings",
          dedupeKey: `${WATCHDOG_JOB}:${today}`,
          jobRunId: ctx.runId,
        })),
      );
      ctx.setSummary(
        `${missing.length} of ${types.length} daily checks didn't run today`,
      );
    },
  };
}
