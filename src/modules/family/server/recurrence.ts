// Repeating tasks and events. Pure, no I/O; runs in plain Node too.
import {
  addDays,
  addMonthsClamped,
  dublinDate,
  dublinTime,
  zonedInstant,
  type IsoDate,
} from "./time.ts";
import { daysBetween } from "../../../server/domain/dates.ts";

export type TaskRecurrence = "none" | "daily" | "weekly" | "monthly" | "yearly";
export type EventRecurrence = "none" | "weekly" | "yearly";

export type RepeatingTask = {
  dueOn: IsoDate | null;
  recurrence: TaskRecurrence;
  /** Every N days/weeks/months/years. */
  interval: number;
  /** First due date of the series; keeps "the 31st" on the 31st after a short month. */
  anchorOn?: IsoDate | null;
};

/**
 * Due date of the next task after this one is completed `today`.
 *
 * The next date is the first date in the series strictly after both the current due date
 * and today: finishing early doesn't skip an occurrence; finishing late doesn't pile up
 * missed ones. Monthly series clamp to the month's last day (31 Jan → 28 Feb → 31 Mar),
 * and yearly series on 29 Feb fall on 28 Feb in other years.
 */
export function nextTaskDueOn(
  task: RepeatingTask,
  today: IsoDate,
): IsoDate | null {
  if (task.recurrence === "none" || !task.dueOn) return null;
  const interval = Math.max(1, Math.trunc(task.interval || 1));
  const after = task.dueOn > today ? task.dueOn : today;

  if (task.recurrence === "daily" || task.recurrence === "weekly") {
    const step = task.recurrence === "daily" ? interval : interval * 7;
    const steps = Math.floor(daysBetween(task.dueOn, after) / step) + 1;
    return addDays(task.dueOn, steps * step);
  }

  const anchor = task.anchorOn ?? task.dueOn;
  const monthStep = task.recurrence === "monthly" ? interval : interval * 12;
  const [ay, am] = anchor.split("-").map(Number);
  const [ty, tm] = after.split("-").map(Number);
  const monthsApart = (ty - ay) * 12 + (tm - am);
  // Start a little before the target and walk forward.
  let n = Math.max(1, Math.floor(monthsApart / monthStep) - 1);
  for (;;) {
    const candidate = addMonthsClamped(anchor, n * monthStep);
    if (candidate > after) return candidate;
    n += 1;
  }
}

/** The fields of an event needed to place it on a calendar. */
export type EventSeries = {
  id: string;
  startsAt: Date;
  endsAt: Date | null;
  allDay: boolean;
  startDate: IsoDate | null;
  endDate: IsoDate | null;
  recurrence: EventRecurrence;
};

export type Occurrence<E extends EventSeries = EventSeries> = {
  event: E;
  /** Stable per occurrence: "<event id>:<local start date>". */
  key: string;
  /** Local (Dublin) start date. */
  date: IsoDate;
  /** Local end date (inclusive) for all-day events; same as `date` for timed ones. */
  lastDate: IsoDate;
  start: Date;
  end: Date | null;
};

function yearlyOn(first: IsoDate, year: number): IsoDate {
  const [y] = first.split("-").map(Number);
  return addMonthsClamped(first, (year - y) * 12);
}

/**
 * Every occurrence of `events` that touches the local dates `from`…`to` (inclusive).
 * Weekly events keep their wall-clock time across the clock changes (18:00 stays 18:00);
 * yearly events on 29 Feb fall on 28 Feb in other years.
 */
export function expandEvents<E extends EventSeries>(
  events: readonly E[],
  from: IsoDate,
  to: IsoDate,
): Occurrence<E>[] {
  const rangeStart = zonedInstant(from);
  const rangeEnd = zonedInstant(addDays(to, 1));
  const out: Occurrence<E>[] = [];

  for (const event of events) {
    if (event.allDay && event.startDate) {
      const span = event.endDate
        ? daysBetween(event.startDate, event.endDate)
        : 0;
      const push = (date: IsoDate) => {
        const lastDate = addDays(date, span);
        if (date <= to && lastDate >= from) {
          out.push({
            event,
            key: `${event.id}:${date}`,
            date,
            lastDate,
            start: zonedInstant(date),
            end: zonedInstant(addDays(lastDate, 1)),
          });
        }
      };
      forEachStart(event.recurrence, event.startDate, from, to, span, push);
      continue;
    }

    const firstDate = dublinDate(event.startsAt);
    const time = dublinTime(event.startsAt);
    const durationMs = event.endsAt
      ? event.endsAt.getTime() - event.startsAt.getTime()
      : null;
    // A timed event can run past midnight; look back far enough to catch it.
    const spanDays = durationMs ? Math.ceil(durationMs / 86_400_000) : 0;
    const push = (date: IsoDate) => {
      const start =
        event.recurrence === "none" ? event.startsAt : zonedInstant(date, time);
      const end =
        durationMs === null ? null : new Date(start.getTime() + durationMs);
      const touches =
        start < rangeEnd && (end ? end > rangeStart : start >= rangeStart);
      if (touches) {
        out.push({
          event,
          key: `${event.id}:${date}`,
          date,
          lastDate: date,
          start,
          end,
        });
      }
    };
    forEachStart(event.recurrence, firstDate, from, to, spanDays, push);
  }

  return out.sort(
    (a, b) =>
      a.start.getTime() - b.start.getTime() || a.key.localeCompare(b.key),
  );
}

/** Calls `push` with each series start date that could touch from…to. */
function forEachStart(
  recurrence: EventRecurrence,
  first: IsoDate,
  from: IsoDate,
  to: IsoDate,
  spanDays: number,
  push: (date: IsoDate) => void,
): void {
  if (recurrence === "none") {
    push(first);
    return;
  }
  const earliest = addDays(from, -spanDays - 1);
  if (recurrence === "weekly") {
    const skip = Math.max(0, Math.floor(daysBetween(first, earliest) / 7));
    for (
      let date = addDays(first, skip * 7);
      date <= to;
      date = addDays(date, 7)
    ) {
      if (date >= first) push(date);
    }
    return;
  }
  const firstYear = Number(first.slice(0, 4));
  const startYear = Math.max(firstYear, Number(earliest.slice(0, 4)));
  for (let year = startYear; year <= Number(to.slice(0, 4)); year += 1) {
    const date = yearlyOn(first, year);
    if (date >= first) push(date);
  }
}
