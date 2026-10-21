import Link from "next/link";
import { connection } from "next/server";
import { ChevronRight } from "lucide-react";
import { Card } from "@/components/ui/card";
import { JobList } from "@/components/jobs/job-list";
import { PageHeader } from "@/components/ui/page-header";
import { Chip } from "@/components/ui/status";
import { NAV_ITEMS } from "@/modules/nav";
import { loadToday, type SectionCounts } from "@/modules/today/load";
import { shortDay } from "@/modules/today/needs-you";
import { requireHousehold } from "@/server/auth";
import { latestJobRuns } from "@/server/jobs/health";
import { dublinDate, formatLongDate, greetingFor } from "@/server/domain/dates";

export const metadata = { title: "Today" };

const MODULE_IDS = ["housing", "money", "family", "travel"];

export default async function TodayPage() {
  await connection(); // Render per request so the date and greeting are always current.
  const { profile } = await requireHousehold();
  const now = new Date();
  const [jobs, today] = profile
    ? await Promise.all([latestJobRuns(), loadToday(now)])
    : [[], null];
  const firstName = profile?.displayName.split(" ")[0];
  const modules = NAV_ITEMS.filter((item) => MODULE_IDS.includes(item.id));

  return (
    <>
      <PageHeader
        eyebrow={formatLongDate(dublinDate(now))}
        title={
          firstName ? `${greetingFor(now)}, ${firstName}` : greetingFor(now)
        }
      />

      {profile ? null : (
        <Card className="grid gap-1 border-review/50 p-4">
          <h2 className="text-[1.05rem] font-semibold">
            Your account isn&apos;t linked yet
          </h2>
          <p className="text-muted">
            You&apos;re signed in, but your account isn&apos;t part of a
            household. An adult in your household can add you from Settings.
          </p>
        </Card>
      )}

      {today ? (
        <Card>
          <div className="px-4 pt-4 pb-1.5">
            <h2 className="text-[1.05rem] font-semibold">Needs you</h2>
          </div>
          {today.needsYou.length > 0 ? (
            <ul className="divide-y divide-line">
              {today.needsYou.map((item) => (
                <li key={item.key}>
                  <Link
                    href={item.href}
                    className="flex items-start gap-3 px-4 py-3 hover:bg-fg/4"
                  >
                    <span className="min-w-0 flex-1">
                      <span className="block font-semibold">{item.title}</span>
                      <span className="block text-sm text-muted">
                        {item.detail}
                      </span>
                    </span>
                    <Chip tone={item.tone}>{item.label}</Chip>
                  </Link>
                </li>
              ))}
            </ul>
          ) : (
            <p className="px-4 pb-4 text-muted">
              You&apos;re all caught up. Matching homes, deadlines, contract
              reminders and trips to book will appear here.
            </p>
          )}
        </Card>
      ) : null}

      {today ? (
        <Card>
          <div className="px-4 pt-4 pb-1.5">
            <h2 className="text-[1.05rem] font-semibold">This week</h2>
          </div>
          {today.weekFailed ? (
            <p className="px-4 pb-4 text-bad">
              Couldn&apos;t load this week&apos;s events. Reload to try again.
            </p>
          ) : today.week.length > 0 ? (
            <ul className="divide-y divide-line">
              {today.week.map((row) => (
                <li key={row.key}>
                  <Link
                    href={row.href}
                    className="flex items-baseline gap-3 px-4 py-2.5 hover:bg-fg/4"
                  >
                    <span className="num w-[7.5rem] shrink-0 text-sm text-muted">
                      {shortDay(row.date)}
                      {row.time ? ` · ${row.time}` : ""}
                    </span>
                    <span className="min-w-0 flex-1">{row.title}</span>
                    {row.kind === "task" ? (
                      <span className="text-sm text-muted">Task</span>
                    ) : null}
                  </Link>
                </li>
              ))}
            </ul>
          ) : (
            <p className="px-4 pb-4 text-muted">
              Nothing in the calendar for the next 7 days.
            </p>
          )}
        </Card>
      ) : null}

      <section className="grid gap-2.5">
        <h2 className="text-[1.05rem] font-semibold">Sections</h2>
        <Card className="divide-y divide-line">
          {modules.map((item) => {
            const Icon = item.icon;
            return (
              <Link
                key={item.id}
                href={item.href}
                className="flex items-center gap-3 px-4 py-3 hover:bg-fg/4"
              >
                <Icon
                  aria-hidden="true"
                  className="size-5 shrink-0 text-muted"
                />
                <span className="min-w-0 flex-1">
                  <span className="block font-semibold">{item.label}</span>
                  <span className="block text-sm text-muted">
                    {item.description}
                  </span>
                </span>
                <SectionChip id={item.id} counts={today?.counts ?? null} />
                <ChevronRight
                  aria-hidden="true"
                  className="size-4 shrink-0 text-muted"
                />
              </Link>
            );
          })}
        </Card>
      </section>

      <Card className="grid gap-2 p-4">
        <h2 className="text-[1.05rem] font-semibold">Background checks</h2>
        {jobs.length > 0 ? (
          <JobList jobs={jobs} now={now} />
        ) : (
          <p className="text-muted">
            No checks have run yet. Each run will show here with its time and
            result, and a failed run is never shown as &ldquo;nothing
            found&rdquo;.
          </p>
        )}
      </Card>
    </>
  );
}

const COUNT_LABELS: Record<keyof SectionCounts, (n: number) => string> = {
  housing: (n) => `${n} open ${n === 1 ? "match" : "matches"}`,
  money: (n) => `${n} ${n === 1 ? "contract" : "contracts"}`,
  family: (n) => `${n} open ${n === 1 ? "task" : "tasks"}`,
  travel: (n) => `${n} ${n === 1 ? "trip" : "trips"}`,
};

function SectionChip({
  id,
  counts,
}: {
  id: string;
  counts: SectionCounts | null;
}) {
  const key = id as keyof SectionCounts;
  if (!counts || !(key in counts)) return null;
  const n = counts[key];
  if (n === null) return <Chip tone="bad">Couldn&apos;t load</Chip>;
  if (n === 0) return <Chip tone="neutral">Nothing yet</Chip>;
  return <Chip tone="info">{COUNT_LABELS[key](n)}</Chip>;
}
