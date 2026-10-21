// Pure rules for job outcomes. No I/O; unit-tested.

export type SourceStatus = "ok" | "failed" | "skipped";
export type JobStatus =
  | "queued"
  | "running"
  | "succeeded"
  | "partial"
  | "failed"
  | "skipped"
  | "cancelled";

/**
 * Final status of a run. A run that threw is failed. A run where every checked source failed
 * is failed too, so "zero results" can never hide a broken source. Some failures = partial.
 */
export function finalStatus(
  sources: readonly SourceStatus[],
  threw: boolean,
): JobStatus {
  if (threw) return "failed";
  const checked = sources.filter((s) => s !== "skipped");
  const failed = checked.filter((s) => s === "failed").length;
  if (checked.length > 0 && failed === checked.length) return "failed";
  if (failed > 0) return "partial";
  return "succeeded";
}

export type ExistingRun = {
  status: JobStatus;
  attempt: number;
  startedAt: Date;
};

export type StartDecision =
  { action: "start"; attempt: number } | { action: "skip"; reason: string };

/** How long a "running" run is trusted before we assume the worker died and retry. */
export const STALE_RUN_MS = 30 * 60 * 1000;
export const MAX_ATTEMPTS = 3;

/**
 * Whether to start a run for an idempotency key that may already have a run.
 * Succeeded runs are never repeated; failed ones retry up to MAX_ATTEMPTS.
 */
export function decideStart(
  existing: ExistingRun | null,
  now: Date,
): StartDecision {
  if (!existing) return { action: "start", attempt: 1 };
  if (existing.status === "succeeded" || existing.status === "skipped") {
    return { action: "skip", reason: "already done for this period" };
  }
  if (existing.status === "running" || existing.status === "queued") {
    const age = now.getTime() - existing.startedAt.getTime();
    if (age < STALE_RUN_MS)
      return { action: "skip", reason: "another run is in progress" };
  }
  if (existing.attempt >= MAX_ATTEMPTS) {
    return { action: "skip", reason: `gave up after ${MAX_ATTEMPTS} attempts` };
  }
  return { action: "start", attempt: existing.attempt + 1 };
}
