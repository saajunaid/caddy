import Link from "next/link";
import type { CSSProperties } from "react";
import { TriangleAlert } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Chip, TONES } from "@/components/ui/status";
import type { Member } from "../queries";
import type { Week, WeekEntry } from "../server/week.ts";

/** Meaning colour for an entry's stripe (never decoration). */
function stripe(entry: WeekEntry, today: string, date: string): string {
  if (entry.kind === "task") {
    if (entry.done) return "var(--line)";
    if (entry.overdue) return TONES.bad;
    return date === today ? TONES.due : TONES.primary;
  }
  if (entry.warnings.length > 0) return TONES.due;
  return entry.allDay ? "var(--line)" : TONES.info;
}

function names(ids: readonly string[], members: Map<string, Member>): string {
  return ids
    .map((id) => members.get(id)?.name)
    .filter(Boolean)
    .join(" + ");
}

function Entry({
  entry,
  date,
  today,
  members,
}: {
  entry: WeekEntry;
  date: string;
  today: string;
  members: Map<string, Member>;
}) {
  const href =
    entry.kind === "event"
      ? `/family/events/${entry.eventId}`
      : `/family/tasks/${entry.taskId}`;
  const who =
    entry.kind === "event"
      ? names(entry.memberIds, members)
      : entry.assigneeMemberId
        ? (members.get(entry.assigneeMemberId)?.name ?? "")
        : "";
  let time: string;
  if (entry.kind === "event") {
    time = entry.allDay
      ? entry.continued
        ? "continues"
        : "all day"
      : `${entry.time}${entry.endTime ? `–${entry.endTime}` : ""}`;
  } else {
    time = entry.done
      ? "done"
      : [entry.overdue ? "overdue" : "due", entry.time]
          .filter(Boolean)
          .join(" · ");
  }
  return (
    <Link
      href={href}
      className="block min-w-0 rounded-md border-l-[3px] bg-sunk px-2 py-1.5 text-[0.8rem] wrap-anywhere hover:bg-fg/5"
      style={{ borderLeftColor: stripe(entry, today, date) } as CSSProperties}
    >
      <span className="num block text-[0.72rem] text-muted">{time}</span>
      <span
        className={
          entry.kind === "task" && entry.done
            ? "block text-muted line-through"
            : "block"
        }
      >
        {entry.kind === "task" ? `Due: ${entry.title}` : entry.title}
      </span>
      {who ? <span className="block text-xs text-muted">{who}</span> : null}
      {entry.kind === "event"
        ? entry.warnings.map((warning) => (
            <span
              key={warning}
              className="mt-0.5 flex items-start gap-1 text-xs text-due"
            >
              <TriangleAlert
                aria-hidden="true"
                className="mt-0.5 size-3 shrink-0"
              />
              {warning}
            </span>
          ))
        : null}
    </Link>
  );
}

/** Seven day cards: stacked on phones, a 7-column grid on desktop. */
export function WeekGrid({
  week,
  today,
  members,
}: {
  week: Week;
  today: string;
  members: Member[];
}) {
  const byId = new Map(members.map((m) => [m.id, m]));
  return (
    <div className="grid gap-2.5 lg:grid-cols-7 lg:gap-2 [&>*]:min-w-0">
      {week.days.map((day) => (
        <Card
          key={day.date}
          aria-label={`${day.weekday} ${day.dayOfMonth}${day.isToday ? ", today" : ""}`}
          className="grid content-start gap-1.5 p-2.5 lg:min-h-[220px]"
          style={day.isToday ? { borderColor: "var(--purple)" } : undefined}
        >
          <div className="flex items-baseline justify-between gap-2 text-[0.8rem]">
            <strong>
              {day.weekday} <span className="num">{day.dayOfMonth}</span>
            </strong>
            {day.isToday ? (
              <Chip tone="primary" dot={false}>
                Today
              </Chip>
            ) : null}
          </div>
          {day.entries.length > 0 ? (
            day.entries.map((entry) => (
              <Entry
                key={entry.key}
                entry={entry}
                date={day.date}
                today={today}
                members={byId}
              />
            ))
          ) : (
            <p className="text-sm text-muted">Nothing planned</p>
          )}
        </Card>
      ))}
    </div>
  );
}
