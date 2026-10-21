// Runs a background job with a ledger row, per-source checks and safe retries.
// Shared by GitHub Actions scripts and the app, so: relative imports with .ts, no Next.js APIs.
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, Json } from "../../lib/supabase/database.types.ts";
import {
  decideStart,
  finalStatus,
  type JobStatus,
  type SourceStatus,
} from "./status.ts";

type Admin = SupabaseClient<Database>;

export type SourceCheck = {
  source: string;
  url?: string;
  status: SourceStatus;
  httpStatus?: number;
  itemsSeen?: number;
  error?: string;
};

export type JobContext = {
  runId: string;
  admin: Admin;
  now: Date;
  /** Record that a source was checked. Never report zero results without recording the check. */
  recordSource(check: SourceCheck): Promise<void>;
  /** Short human summary shown in Settings → Background jobs. */
  setSummary(summary: string): void;
  setStats(stats: Record<string, Json>): void;
};

export type RunJobOptions = {
  jobType: string;
  /** Unique per period, e.g. "housing-daily:2026-10-21". Prevents double runs. */
  idempotencyKey: string;
  householdId?: string | null;
  trigger?: "schedule" | "manual" | "event";
  now?: Date;
};

export type RunJobResult = {
  status: JobStatus;
  runId: string | null;
  summary: string | null;
  error?: string;
};

export async function runJob(
  admin: Admin,
  options: RunJobOptions,
  handler: (ctx: JobContext) => Promise<void>,
): Promise<RunJobResult> {
  const now = options.now ?? new Date();
  const existing = await admin
    .from("job_runs")
    .select("id, status, attempt, started_at")
    .eq("idempotency_key", options.idempotencyKey)
    .maybeSingle();
  if (existing.error)
    throw new Error(`Job ledger unavailable: ${existing.error.message}`);

  const decision = decideStart(
    existing.data
      ? {
          status: existing.data.status as JobStatus,
          attempt: existing.data.attempt,
          startedAt: new Date(existing.data.started_at),
        }
      : null,
    now,
  );
  if (decision.action === "skip") {
    return {
      status: "skipped",
      runId: existing.data?.id ?? null,
      summary: decision.reason,
    };
  }

  const row = {
    household_id: options.householdId ?? null,
    job_type: options.jobType,
    idempotency_key: options.idempotencyKey,
    trigger: options.trigger ?? "schedule",
    status: "running",
    attempt: decision.attempt,
    started_at: now.toISOString(),
    finished_at: null,
    error: null,
    summary: null,
  };
  const started = existing.data
    ? await admin
        .from("job_runs")
        .update(row)
        .eq("id", existing.data.id)
        .select("id")
        .single()
    : await admin.from("job_runs").insert(row).select("id").single();
  if (started.error)
    throw new Error(`Couldn't start job: ${started.error.message}`);
  const runId = started.data.id;

  const sources: SourceStatus[] = [];
  let summary: string | null = null;
  let stats: Record<string, Json> = {};
  const ctx: JobContext = {
    runId,
    admin,
    now,
    async recordSource(check) {
      sources.push(check.status);
      const { error } = await admin.from("job_source_checks").insert({
        job_run_id: runId,
        source: check.source,
        url: check.url ?? null,
        status: check.status,
        http_status: check.httpStatus ?? null,
        items_seen: check.itemsSeen ?? null,
        error: check.error ? check.error.slice(0, 500) : null,
      });
      if (error)
        throw new Error(`Couldn't record source check: ${error.message}`);
    },
    setSummary(value) {
      summary = value.slice(0, 300);
    },
    setStats(value) {
      stats = value;
    },
  };

  let errorMessage: string | undefined;
  try {
    await handler(ctx);
  } catch (error) {
    errorMessage = error instanceof Error ? error.message : String(error);
  }

  const status = finalStatus(sources, errorMessage !== undefined);
  const finished = await admin
    .from("job_runs")
    .update({
      status,
      summary,
      stats,
      error: errorMessage ? errorMessage.slice(0, 1000) : null,
      finished_at: new Date().toISOString(),
    })
    .eq("id", runId);
  if (finished.error)
    throw new Error(`Couldn't finish job: ${finished.error.message}`);

  return { status, runId, summary, error: errorMessage };
}
