import { timingSafeEqual } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { JOBS } from "@/server/jobs/registry.ts";
import { runJob } from "@/server/jobs/runner.ts";
import { WATCHDOG_JOB, watchdogDue } from "@/server/jobs/watchdog.ts";
import {
  flushPendingPushes,
  vapidFromEnv,
} from "@/server/notifications/push.ts";

export const dynamic = "force-dynamic";

function bearerMatches(header: string, secret: string | undefined): boolean {
  if (!secret || !header.startsWith("Bearer ")) return false;
  const given = Buffer.from(header.slice(7));
  const wanted = Buffer.from(secret);
  return given.length === wanted.length && timingSafeEqual(given, wanted);
}

/**
 * Vercel's scheduler sends `Bearer $CRON_SECRET` when CRON_SECRET is set in Vercel. Manual
 * callers can use the Supabase secret key. Without CRON_SECRET the scheduler sends no token,
 * so the check is allowed without one: it does nothing before 10:00, runs at most once a day
 * (job ledger), alerts at most once a day (dedupe key) and only reports what is true.
 * Anonymous callers get the status only. PLAN D28.
 */
function caller(request: NextRequest): "trusted" | "anonymous" | "refused" {
  const header = request.headers.get("authorization") ?? "";
  const cronSecret = process.env.CRON_SECRET;
  if (
    bearerMatches(header, cronSecret) ||
    bearerMatches(header, process.env.SUPABASE_SECRET_KEY)
  )
    return "trusted";
  return cronSecret ? "refused" : "anonymous";
}

export async function GET(request: NextRequest) {
  const who = caller(request);
  if (who === "refused") {
    return NextResponse.json({ error: "unauthorised" }, { status: 401 });
  }
  const now = new Date();
  if (!watchdogDue(now)) {
    return NextResponse.json({ status: "too_early" });
  }

  const job = JOBS.find((j) => j.type === WATCHDOG_JOB);
  if (!job) {
    return NextResponse.json({ error: "not registered" }, { status: 500 });
  }
  const admin = createAdminClient();
  const result = await runJob(
    admin,
    {
      jobType: job.type,
      idempotencyKey: job.idempotencyKey(now),
      trigger: "schedule",
      now,
    },
    (ctx) => job.run(ctx, admin),
  );

  const vapid = vapidFromEnv();
  const push = vapid ? await flushPendingPushes(admin, vapid) : null;

  if (who === "anonymous") return NextResponse.json({ status: result.status });
  return NextResponse.json({
    status: result.status,
    summary: result.summary,
    error: result.error,
    push,
  });
}
