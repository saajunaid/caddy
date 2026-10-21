import Link from "next/link";
import { ChevronRight, GraduationCap } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Chip } from "@/components/ui/status";
import { formatWhen } from "@/server/domain/relative-time";
import { addChildAction, revokeFeedAction } from "../actions";
import type { Application, Feed, Member, School } from "../queries";
import { ageLabel, ECCE_INFO_URL, ecceHint } from "../server/people.ts";
import { dublinDate, formatShortDate } from "../server/time.ts";
import { ActionForm } from "./action-form";
import { Avatar } from "./avatar";
import { ConfirmButton } from "./controls";
import { FeedCreator } from "./feed-creator";
import { PersonFields } from "./forms";
import { buttonClass, cardTitleClass, linkClass } from "./ui";

/** Adults and children, with ages and an ECCE guide for small children. */
export function PeopleCard({
  members,
  today,
}: {
  members: Member[];
  today: string;
}) {
  return (
    <Card id="people" className="grid scroll-mt-20">
      <div className="px-4 pt-4 pb-1.5">
        <h2 className={cardTitleClass}>People</h2>
      </div>
      {members.length === 0 ? (
        <p className="px-4 pb-2 text-sm text-muted">
          No one here yet. Adults are added from Settings; add children below.
        </p>
      ) : (
        <ul className="divide-y divide-line">
          {members.map((m) => {
            const age = m.dateOfBirth ? ageLabel(m.dateOfBirth, today) : null;
            const ecce =
              m.relationship === "child" && m.dateOfBirth
                ? ecceHint(m.dateOfBirth, today)
                : null;
            return (
              <li key={m.id} className="flex items-center gap-3 px-4 py-2.5">
                <Avatar name={m.name} />
                <div className="min-w-0 flex-1">
                  <div className="font-semibold wrap-anywhere">{m.name}</div>
                  <div className="text-sm text-muted">
                    {m.relationship === "child"
                      ? "Child"
                      : m.hasLogin
                        ? "Adult"
                        : m.relationship === "adult"
                          ? "Adult · no login"
                          : "Other"}
                    {age
                      ? ` · ${age}`
                      : m.relationship === "child"
                        ? " · age unknown"
                        : ""}
                  </div>
                  {ecce ? (
                    <div className="text-sm">
                      <span className="text-review">{ecce.label}</span>{" "}
                      <a
                        href={ECCE_INFO_URL}
                        target="_blank"
                        rel="noopener noreferrer"
                        className={linkClass}
                      >
                        guide only, check gov.ie
                      </a>
                    </div>
                  ) : null}
                </div>
                <Link
                  href={`/family/people/${m.id}`}
                  className="shrink-0 text-sm text-info hover:underline"
                  aria-label={`Edit ${m.name}`}
                >
                  Edit
                </Link>
              </li>
            );
          })}
        </ul>
      )}
      <div className="border-t border-line px-4 py-3">
        <details>
          <summary className="cursor-pointer text-sm font-semibold text-info">
            Add a child
          </summary>
          <div className="pt-3">
            <ActionForm
              action={addChildAction}
              submitLabel="Add child"
              pendingLabel="Adding…"
              submitClassName={buttonClass}
              resetOnSuccess
            >
              <PersonFields today={today} />
            </ActionForm>
          </div>
        </details>
        <p className="mt-2 text-sm text-muted">
          Adults who sign in are added from{" "}
          <Link href="/settings" className={linkClass}>
            Settings
          </Link>
          .
        </p>
      </div>
    </Card>
  );
}

/** Private iCal feed: create a link once, list and revoke existing ones. */
export function CalendarCard({ feeds, now }: { feeds: Feed[]; now: Date }) {
  const active = feeds.filter((f) => !f.revokedAt);
  const revoked = feeds.filter((f) => f.revokedAt);
  return (
    <Card id="calendar" className="grid scroll-mt-20 gap-3 p-4">
      <h2 className={cardTitleClass}>Subscribe in Apple or Google Calendar</h2>
      <p className="text-sm text-muted">
        A private, read-only feed of your family events and task due dates, from
        a month ago to a year ahead. Changes you make in Caddy show up in your
        calendar app; it can&apos;t change anything here.
      </p>
      <FeedCreator />
      <details className="text-sm">
        <summary className="cursor-pointer font-semibold">
          How to add it on iPhone
        </summary>
        <ol className="mt-2 grid list-decimal gap-1 pl-5 text-muted">
          <li>
            Tap <strong className="text-fg">Open in Calendar</strong> after
            creating a feed, or copy the webcal link.
          </li>
          <li>
            Or open Settings → Calendar → Accounts → Add Account → Other → Add
            Subscribed Calendar, and paste the link.
          </li>
          <li>Tap Next, then Save. It refreshes on its own.</li>
        </ol>
      </details>
      <details className="text-sm">
        <summary className="cursor-pointer font-semibold">
          How to add it in Google Calendar
        </summary>
        <ol className="mt-2 grid list-decimal gap-1 pl-5 text-muted">
          <li>
            On a computer, open Google Calendar. Next to{" "}
            <strong className="text-fg">Other calendars</strong>, click + →{" "}
            <strong className="text-fg">From URL</strong>.
          </li>
          <li>Paste the https link and click Add calendar.</li>
          <li>
            Google refreshes subscribed calendars slowly, sometimes only once a
            day, so new events can take a while to appear on Android phones.
          </li>
        </ol>
      </details>
      {active.length > 0 ? (
        <div className="grid gap-1">
          <h3 className="text-sm font-semibold">Active feeds</h3>
          <ul className="divide-y divide-line">
            {active.map((feed) => (
              <li
                key={feed.id}
                className="flex flex-wrap items-center justify-between gap-2 py-2"
              >
                <span className="min-w-0">
                  <span className="block wrap-anywhere">{feed.label}</span>
                  <span className="block text-xs text-muted">
                    Created {formatShortDate(dublinDate(feed.createdAt))} ·{" "}
                    {feed.lastUsedAt
                      ? `Last fetched ${formatWhen(feed.lastUsedAt, now)}`
                      : "Not fetched yet"}
                  </span>
                </span>
                <ConfirmButton
                  action={revokeFeedAction.bind(null, feed.id)}
                  confirm={`Revoke “${feed.label}”? Calendars using it will stop updating.`}
                  className={buttonClass}
                >
                  Revoke
                </ConfirmButton>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
      {revoked.length > 0 ? (
        <p className="text-xs text-muted">
          {revoked.length} revoked feed{revoked.length === 1 ? "" : "s"} no
          longer work.
        </p>
      ) : null}
    </Card>
  );
}

/** Summary of the education planner with the next date that matters. */
export function SchoolCard({
  schools,
  applications,
  today,
}: {
  schools: School[];
  applications: Application[];
  today: string;
}) {
  const names = new Map(schools.map((s) => [s.id, s.name]));
  const upcoming = applications
    .flatMap((a) => [
      a.openDay && a.openDay >= today
        ? { date: a.openDay, text: `open day at ${names.get(a.schoolId)}` }
        : null,
      a.applicationDeadline &&
      a.applicationDeadline >= today &&
      a.status === "researching"
        ? {
            date: a.applicationDeadline,
            text: `deadline for ${names.get(a.schoolId)}`,
          }
        : null,
    ])
    .filter((x): x is { date: string; text: string } => x !== null)
    .sort((a, b) => a.date.localeCompare(b.date));
  const next = upcoming[0];
  const year = Number(today.slice(0, 4));
  return (
    <Card className="flex flex-wrap items-center justify-between gap-3 p-4">
      <div className="flex min-w-0 items-center gap-3">
        <GraduationCap
          aria-hidden="true"
          className="size-[22px] shrink-0 text-muted"
        />
        <div className="min-w-0">
          <h2 className={cardTitleClass}>School places</h2>
          <p className="text-sm text-muted">
            {schools.length === 0
              ? "Track schools, admissions policies, open days and deadlines."
              : `${schools.length} school${schools.length === 1 ? "" : "s"} tracked`}
            {next ? (
              <>
                {" · next: "}
                {next.text},{" "}
                <span className="num">{formatShortDate(next.date, year)}</span>
              </>
            ) : null}
          </p>
        </div>
      </div>
      <Link href="/family/schools" className={buttonClass}>
        Open planner
        <ChevronRight aria-hidden="true" className="size-4" />
      </Link>
    </Card>
  );
}

export function StatusChip({ status }: { status: string }) {
  const tone =
    status === "accepted" || status === "offered"
      ? "ok"
      : status === "declined" || status === "unsuccessful"
        ? "bad"
        : status === "waitlisted"
          ? "due"
          : status === "applied"
            ? "info"
            : "neutral";
  const label = status.charAt(0).toUpperCase() + status.slice(1);
  return <Chip tone={tone}>{label}</Chip>;
}
