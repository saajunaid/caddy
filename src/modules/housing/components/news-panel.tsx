import { ExternalLink, Newspaper } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Chip, TONES, type Tone } from "@/components/ui/status";
import { formatChecked } from "@/server/domain/relative-time";
import { dateLabel } from "../display";
import type { JobRunInfo, NewsItem } from "../queries";
import { link, note } from "./styles";

const VERIFICATION: Record<string, { label: string; tone: Tone }> = {
  officially_confirmed: { label: "Officially confirmed", tone: "ok" },
  corroborated: { label: "Corroborated", tone: "info" },
  reported: { label: "Reported", tone: "neutral" },
  unverified: { label: "Unverified lead", tone: "review" },
  contradicted: { label: "Contradicted", tone: "bad" },
};

const SOURCE_TYPE: Record<string, string> = {
  official: "Official",
  provider: "Provider",
  news: "News",
  social: "Social",
  unknown: "Source",
};

const STALE_MS = 36 * 60 * 60 * 1000;

function RunStatus({ run, now }: { run: JobRunInfo | null; now: Date }) {
  if (!run) {
    return (
      <p className="text-sm text-due">
        News: no research run has arrived yet. Silence here never means
        &ldquo;no news&rdquo;.
      </p>
    );
  }
  if (run.status === "failed") {
    return (
      <p role="alert" className="text-sm text-bad">
        News: the last research run failed ({formatChecked(run.startedAt, now)}
        ).
      </p>
    );
  }
  if (now.getTime() - run.startedAt.getTime() > STALE_MS) {
    return (
      <p className="text-sm text-due">
        News: no update since {formatChecked(run.startedAt, now)}.
      </p>
    );
  }
  return (
    <p className="text-sm text-muted">
      Updated {formatChecked(run.startedAt, now)}
      {run.summary ? ` · ${run.summary}` : ""}
    </p>
  );
}

/** Housing news from research agents (last 30 days), collapsible. */
export function NewsPanel({
  items,
  run,
  now,
  today,
}: {
  items: NewsItem[];
  run: JobRunInfo | null;
  now: Date;
  today: string;
}) {
  return (
    <Card id="news" className="scroll-mt-20">
      <details open={items.length > 0} className="group">
        <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-4 py-3.5 [&::-webkit-details-marker]:hidden">
          <span className="flex items-center gap-2">
            <Newspaper aria-hidden="true" className="size-5 text-muted" />
            <h2 className="text-[1.05rem] font-semibold">Cost Rental news</h2>
            <span className="num text-xs text-muted">{items.length}</span>
          </span>
          <span className="text-sm text-info group-open:hidden">Show</span>
          <span className="hidden text-sm text-info group-open:inline">
            Hide
          </span>
        </summary>
        <div className="grid gap-3 px-4 pb-4">
          <RunStatus run={run} now={now} />
          {items.length === 0 ? (
            <p className="text-muted">
              No news items from the last 30 days. Items arrive from the daily
              research run (see research/README.md) and are never invented.
            </p>
          ) : (
            <ul className="divide-y divide-line">
              {items.map((item) => {
                const v =
                  VERIFICATION[item.verification] ?? VERIFICATION.unverified;
                return (
                  <li key={item.id} className="grid gap-1 py-3 first:pt-0">
                    <a
                      href={item.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className={`${link} font-semibold`}
                    >
                      {item.title}
                      <ExternalLink
                        aria-hidden="true"
                        className="ml-1 inline size-3"
                      />
                    </a>
                    <div className="flex flex-wrap items-center gap-2 text-sm text-muted">
                      <Chip tone={v.tone}>{v.label}</Chip>
                      {item.cost_rental_confirmed === "yes" ? (
                        <Chip tone="ok" dot={false}>
                          Cost Rental confirmed
                        </Chip>
                      ) : null}
                      <span
                        className="tag"
                        style={
                          {
                            "--c":
                              item.source_type === "official" ||
                              item.source_type === "provider"
                                ? TONES.info
                                : TONES.neutral,
                          } as React.CSSProperties
                        }
                      >
                        {SOURCE_TYPE[item.source_type] ?? "Source"}
                      </span>
                      <span>{item.source_name}</span>
                      <span className="num">
                        {item.published_on
                          ? dateLabel(item.published_on, today)
                          : "Date not stated"}
                      </span>
                    </div>
                    {item.summary ? (
                      <p className="text-sm">{item.summary}</p>
                    ) : null}
                  </li>
                );
              })}
            </ul>
          )}
          <p className={note}>
            Social posts are leads only. Nothing is marked confirmed without an
            official source.
          </p>
        </div>
      </details>
    </Card>
  );
}
