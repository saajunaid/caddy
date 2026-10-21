import { ExternalLink } from "lucide-react";
import { Chip, type Tone } from "@/components/ui/status";
import { formatChecked } from "@/server/domain/relative-time";
import type { JobRunInfo } from "../queries";
import { link } from "./styles";

const STALE_MS = 36 * 60 * 60 * 1000;

function describe(run: JobRunInfo, now: Date): { label: string; tone: Tone } {
  const when = formatChecked(run.startedAt, now);
  switch (run.status) {
    case "succeeded":
      return now.getTime() - run.startedAt.getTime() > STALE_MS
        ? { label: `Last checked ${when}`, tone: "due" }
        : { label: `Checked ${when}`, tone: "ok" };
    case "partial":
      return { label: `Partly failed ${when}`, tone: "due" };
    case "failed":
      return { label: `Failed ${when}`, tone: "bad" };
    case "running":
    case "queued":
      return { label: `Checking now (started ${when})`, tone: "info" };
    default:
      return { label: `${run.status} ${when}`, tone: "neutral" };
  }
}

/** "Checked today 07:14 · 203 listings checked · 1 match · 2 new", or the failure. */
export function Freshness({ run, now }: { run: JobRunInfo | null; now: Date }) {
  if (!run) {
    return (
      <div className="flex flex-wrap items-center gap-2 text-[0.8rem] text-muted">
        <Chip tone="review">Not checked yet</Chip>
        <span>
          The first daily check of newstarterhomes.ie hasn&apos;t run.
        </span>
      </div>
    );
  }
  const { label, tone } = describe(run, now);
  return (
    <div className="grid gap-1">
      <div className="flex flex-wrap items-center gap-2 text-[0.8rem] text-muted">
        <Chip tone={tone}>{label}</Chip>
        {run.summary ? <span>newstarterhomes.ie · {run.summary}</span> : null}
        <a
          href="https://newstarterhomes.ie/rent/"
          target="_blank"
          rel="noopener noreferrer"
          className={`${link} inline-flex items-center gap-1`}
        >
          Source <ExternalLink aria-hidden="true" className="size-3" />
        </a>
      </div>
      {run.error && run.status !== "succeeded" ? (
        <p role="alert" className="text-sm text-bad">
          {run.error}. Listings below are from the last successful check.
        </p>
      ) : null}
      {run.status === "partial" ? (
        <p className="text-sm text-due">
          Some pages couldn&apos;t be read; see Settings → Background jobs.
          Nothing is shown as &ldquo;no results&rdquo; because of it.
        </p>
      ) : null}
    </div>
  );
}
