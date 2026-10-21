import { Chip, type Tone } from "@/components/ui/status";
import { formatChecked } from "@/server/domain/relative-time";
import { jobLabel, type JobHealth } from "@/server/jobs/health";

const STATUS: Record<string, { label: string; tone: Tone }> = {
  succeeded: { label: "OK", tone: "ok" },
  partial: { label: "Partly failed", tone: "due" },
  failed: { label: "Failed", tone: "bad" },
  running: { label: "Running", tone: "info" },
  queued: { label: "Queued", tone: "info" },
  skipped: { label: "Skipped", tone: "neutral" },
  cancelled: { label: "Cancelled", tone: "neutral" },
};

export function jobStatus(status: string) {
  return STATUS[status] ?? { label: status, tone: "neutral" as Tone };
}

/** One row per job: name, last run time, result. */
export function JobList({ jobs, now }: { jobs: JobHealth[]; now: Date }) {
  return (
    <ul className="divide-y divide-line">
      {jobs.map((job) => {
        const { label, tone } = jobStatus(job.status);
        return (
          <li
            key={job.jobType}
            className="flex items-start justify-between gap-3 py-2.5"
          >
            <span className="min-w-0">
              <span className="block font-medium">{jobLabel(job.jobType)}</span>
              <span className="block text-sm text-muted">
                {formatChecked(job.startedAt, now)}
                {job.summary ? ` · ${job.summary}` : ""}
              </span>
              {job.error ? (
                <span className="block text-sm text-bad">{job.error}</span>
              ) : null}
            </span>
            <Chip tone={tone}>{label}</Chip>
          </li>
        );
      })}
    </ul>
  );
}
