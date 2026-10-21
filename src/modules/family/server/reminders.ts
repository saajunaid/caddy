// Decides which family reminders to send. Pure, no I/O; the job in reminders-job.ts does the I/O.
import type { NewNotification } from "../../../server/notifications/notify.ts";
import { daysBetween } from "../../../server/domain/dates.ts";
import { addDays, formatShortDate, type HhMm, type IsoDate } from "./time.ts";

export type ReminderTask = {
  id: string;
  title: string;
  dueOn: IsoDate;
  dueTime: HhMm | null;
  assigneeName: string | null;
};

export type ReminderEvent = {
  title: string;
  /** null for all-day. */
  time: HhMm | null;
};

export type ReminderApplication = {
  id: string;
  schoolId: string;
  schoolName: string;
  childName: string;
  status: string;
  applicationDeadline: IsoDate | null;
  openDay: IsoDate | null;
};

/** Application statuses where a deadline still matters (nothing submitted yet). */
const NOT_YET_APPLIED = new Set(["researching"]);

/**
 * Notifications for one household on `today` (Dublin date):
 * - each open task due today or overdue, once per task per due date;
 * - one summary of today's events;
 * - school application deadlines within 7 days (not yet applied), once per application per deadline;
 * - open days tomorrow, once per school per date.
 * Dedupe keys make re-runs (and late or doubled cron runs) harmless.
 */
export function planFamilyReminders(input: {
  householdId: string;
  today: IsoDate;
  openTasks: readonly ReminderTask[];
  todaysEvents: readonly ReminderEvent[];
  applications: readonly ReminderApplication[];
  jobRunId?: string;
}): NewNotification[] {
  const { householdId, today, jobRunId } = input;
  const out: NewNotification[] = [];
  const year = Number(today.slice(0, 4));

  for (const task of input.openTasks) {
    if (task.dueOn > today) continue;
    const overdue = task.dueOn < today;
    const who = task.assigneeName ? ` · ${task.assigneeName}` : "";
    out.push({
      householdId,
      kind: overdue ? "family.task_overdue" : "family.task_due",
      severity: overdue ? "critical" : "warning",
      title: overdue ? `Overdue: ${task.title}` : `Due today: ${task.title}`,
      body: overdue
        ? `Was due ${formatShortDate(task.dueOn, year)}${who}`
        : `${task.dueTime ? `By ${task.dueTime.slice(0, 5)}` : "Today"}${who}`,
      actionUrl: `/family/tasks/${task.id}`,
      dedupeKey: `family:task:${task.id}:${task.dueOn}`,
      jobRunId,
    });
  }

  if (input.todaysEvents.length > 0) {
    const sorted = [...input.todaysEvents].sort((a, b) =>
      (a.time ?? "").localeCompare(b.time ?? ""),
    );
    const count = sorted.length;
    out.push({
      householdId,
      kind: "family.events_today",
      severity: "info",
      title: `Today: ${count} event${count === 1 ? "" : "s"}`,
      body: sorted
        .map((e) => `${e.time ?? "All day"} ${e.title}`)
        .join(" · ")
        .slice(0, 500),
      actionUrl: "/family",
      dedupeKey: `family:events:${today}`,
      jobRunId,
    });
  }

  const tomorrow = addDays(today, 1);
  const openDaysSeen = new Set<string>();
  for (const app of input.applications) {
    const deadline = app.applicationDeadline;
    if (deadline && NOT_YET_APPLIED.has(app.status)) {
      const days = daysBetween(today, deadline);
      if (days >= 0 && days <= 7) {
        const when =
          days === 0 ? "today" : days === 1 ? "tomorrow" : `in ${days} days`;
        out.push({
          householdId,
          kind: "family.school_deadline",
          severity: days <= 2 ? "critical" : "warning",
          title: `School application closes ${when}: ${app.schoolName}`,
          body: `${app.childName} · deadline ${formatShortDate(deadline, year)}. Check the school's admissions policy.`,
          actionUrl: "/family/schools",
          dedupeKey: `family:school-deadline:${app.id}:${deadline}`,
          jobRunId,
        });
      }
    }
    if (app.openDay === tomorrow) {
      const key = `family:open-day:${app.schoolId}:${app.openDay}`;
      if (openDaysSeen.has(key)) continue;
      openDaysSeen.add(key);
      out.push({
        householdId,
        kind: "family.open_day",
        severity: "info",
        title: `Open day tomorrow: ${app.schoolName}`,
        body: formatShortDate(app.openDay, year),
        actionUrl: "/family/schools",
        dedupeKey: key,
        jobRunId,
      });
    }
  }

  return out;
}
