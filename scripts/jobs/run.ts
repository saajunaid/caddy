// Runs scheduled jobs. Used by GitHub Actions; also works locally.
//   node --experimental-strip-types scripts/jobs/run.ts daily            # every daily job
//   node --experimental-strip-types scripts/jobs/run.ts digest           # the morning summary push
//   node --experimental-strip-types scripts/jobs/run.ts job housing-daily  # one job
// Env: SUPABASE_URL, SUPABASE_SECRET_KEY, optional APP_URL (to send push notifications after).
import { createClient } from "@supabase/supabase-js";
import type { Database } from "../../src/lib/supabase/database.types.ts";
import { JOBS, type JobGroup } from "../../src/server/jobs/registry.ts";
import { runJob } from "../../src/server/jobs/runner.ts";

function required(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) {
    console.error(`Missing ${name}.`);
    process.exit(1);
  }
  return value;
}

const [mode, name] = process.argv.slice(2);
const selected =
  mode === "job"
    ? JOBS.filter((job) => job.type === name)
    : JOBS.filter((job) => job.group === (mode as JobGroup));
if (selected.length === 0) {
  console.error(`No jobs match "${process.argv.slice(2).join(" ")}".`);
  process.exit(1);
}

const secretKey = required("SUPABASE_SECRET_KEY");
const admin = createClient<Database>(required("SUPABASE_URL"), secretKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});
const trigger = process.env.JOB_TRIGGER === "manual" ? "manual" : "schedule";
const now = new Date();

let failures = 0;
for (const job of selected) {
  const result = await runJob(
    admin,
    {
      jobType: job.type,
      idempotencyKey: job.idempotencyKey(now),
      trigger,
      now,
    },
    (ctx) => job.run(ctx, admin),
  );
  const line = `${job.type}: ${result.status}${result.summary ? ` — ${result.summary}` : ""}`;
  if (result.status === "failed") {
    failures += 1;
    console.error(`${line}${result.error ? ` (${result.error})` : ""}`);
  } else {
    console.log(line);
  }
}

// Deliver push notifications created by these jobs.
const appUrl = process.env.APP_URL?.replace(/\/$/, "");
if (appUrl) {
  try {
    const response = await fetch(`${appUrl}/api/internal/push/flush`, {
      method: "POST",
      headers: { authorization: `Bearer ${secretKey}` },
    });
    console.log(`push flush: HTTP ${response.status} ${await response.text()}`);
  } catch (error) {
    console.error(`push flush failed: ${(error as Error).message}`);
  }
}

process.exit(failures > 0 ? 1 : 0);
