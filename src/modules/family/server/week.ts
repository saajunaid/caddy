// Builds the Monday-start family week. Pure, no I/O; runs in plain Node too.
import { clashWarnings, type ClashCandidate } from "./clashes.ts";
import { expandEvents, type EventSeries } from "./recurrence.ts";
import {
  addDays,
  dublinTime,
  weekdayShort,
  weekStart,
  type HhMm,
  type IsoDate,
} from "./time.ts";

export type WeekEvent = EventSeries & {
  title: string;
  location: string | null;
  memberIds: string[];
};

export type WeekTask = {
  id: string;
  title: string;
  dueOn: IsoDate | null;
  dueTime: HhMm | null;
  status: "open" | "done";
  assigneeMemberId: string | null;
};

export type WeekEntry =
  | {
      kind: "event";
      key: string;
      eventId: string;
      title: string;
      allDay: boolean;
      /** "18:15" for timed events; null for all-day. */
      time: HhMm | null;
      endTime: HhMm | null;
      /** True on the 2nd+ day of a multi-day all-day event. */
      continued: boolean;
      memberIds: string[];
      location: string | null;
      warnings: string[];
    }
  | {
      kind: "task";
      key: string;
      taskId: string;
      title: string;
      time: HhMm | null;
      done: boolean;
      overdue: boolean;
      assigneeMemberId: string | null;
    };

export type WeekDay = {
  date: IsoDate;
  weekday: string;
  dayOfMonth: number;
  isToday: boolean;
  entries: WeekEntry[];
};

export type Week = {
  start: IsoDate;
  end: IsoDate;
  previous: IsoDate;
  next: IsoDate;
  days: WeekDay[];
  clashCount: number;
};

/**
 * The week (Monday–Sunday) containing `anyDate`, with events (repeats expanded) and tasks
 * placed on their local Dublin day. All-day items come first, then timed items by time.
 */
export function buildWeek(input: {
  anyDate: IsoDate;
  today: IsoDate;
  events: readonly WeekEvent[];
  tasks: readonly WeekTask[];
}): Week {
  const start = weekStart(input.anyDate);
  const end = addDays(start, 6);
  const occurrences = expandEvents(input.events, start, end);

  const candidates: ClashCandidate[] = occurrences.map((o) => ({
    key: o.key,
    title: o.event.title,
    start: o.start,
    end: o.end,
    allDay: o.event.allDay,
    memberIds: o.event.memberIds,
  }));
  const warnings = clashWarnings(candidates);

  const days: WeekDay[] = Array.from({ length: 7 }, (_, i) => {
    const date = addDays(start, i);
    return {
      date,
      weekday: weekdayShort(date),
      dayOfMonth: Number(date.slice(8, 10)),
      isToday: date === input.today,
      entries: [],
    };
  });
  const dayIndex = new Map(days.map((d, i) => [d.date, i]));

  for (const o of occurrences) {
    if (o.event.allDay) {
      for (let date = o.date; date <= o.lastDate; date = addDays(date, 1)) {
        const i = dayIndex.get(date);
        if (i === undefined) continue;
        days[i].entries.push({
          kind: "event",
          key: `${o.key}:${date}`,
          eventId: o.event.id,
          title: o.event.title,
          allDay: true,
          time: null,
          endTime: null,
          continued: date !== o.date,
          memberIds: o.event.memberIds,
          location: o.event.location,
          warnings: [],
        });
      }
      continue;
    }
    const i = dayIndex.get(o.date);
    if (i === undefined) continue; // Started the evening before the week; shown on that week.
    days[i].entries.push({
      kind: "event",
      key: o.key,
      eventId: o.event.id,
      title: o.event.title,
      allDay: false,
      time: dublinTime(o.start),
      endTime: o.end ? dublinTime(o.end) : null,
      continued: false,
      memberIds: o.event.memberIds,
      location: o.event.location,
      warnings: warnings.get(o.key) ?? [],
    });
  }

  for (const task of input.tasks) {
    if (!task.dueOn) continue;
    const i = dayIndex.get(task.dueOn);
    if (i === undefined) continue;
    days[i].entries.push({
      kind: "task",
      key: `task:${task.id}`,
      taskId: task.id,
      title: task.title,
      time: task.dueTime ? task.dueTime.slice(0, 5) : null,
      done: task.status === "done",
      overdue: task.status === "open" && task.dueOn < input.today,
      assigneeMemberId: task.assigneeMemberId,
    });
  }

  for (const day of days) day.entries.sort(compareEntries);

  let clashCount = 0;
  for (const list of warnings.values()) clashCount += list.length;

  return {
    start,
    end,
    previous: addDays(start, -7),
    next: addDays(start, 7),
    days,
    clashCount: clashCount / 2,
  };
}

function rank(entry: WeekEntry): string {
  // All-day events, then untimed tasks, then everything with a time in time order.
  if (entry.kind === "event" && entry.allDay) return "0";
  if (entry.time === null) return "1";
  return `2${entry.time}`;
}

function compareEntries(a: WeekEntry, b: WeekEntry): number {
  return rank(a).localeCompare(rank(b)) || a.title.localeCompare(b.title);
}
