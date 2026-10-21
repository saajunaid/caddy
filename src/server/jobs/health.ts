import "server-only";
import { createClient } from "@/lib/supabase/server";

export type JobHealth = {
  jobType: string;
  status: string;
  summary: string | null;
  error: string | null;
  startedAt: Date;
  finishedAt: Date | null;
};

const LABELS: Record<string, string> = {
  heartbeat: "Scheduler",
};

export function jobLabel(jobType: string): string {
  return (
    LABELS[jobType] ??
    jobType.replace(/[-_]/g, " ").replace(/^\w/, (c) => c.toUpperCase())
  );
}

/** Latest run of each job the signed-in household can see. */
export async function latestJobRuns(): Promise<JobHealth[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("job_runs")
    .select("job_type, status, summary, error, started_at, finished_at")
    .order("started_at", { ascending: false })
    .limit(100);
  if (error) throw new Error(`Couldn't load background jobs: ${error.message}`);
  const seen = new Set<string>();
  const latest: JobHealth[] = [];
  for (const run of data) {
    if (seen.has(run.job_type)) continue;
    seen.add(run.job_type);
    latest.push({
      jobType: run.job_type,
      status: run.status,
      summary: run.summary,
      error: run.error,
      startedAt: new Date(run.started_at),
      finishedAt: run.finished_at ? new Date(run.finished_at) : null,
    });
  }
  return latest.sort((a, b) => a.jobType.localeCompare(b.jobType));
}
