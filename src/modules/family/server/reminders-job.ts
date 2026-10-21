// "family-reminders": daily task, event and school reminders for every household.
// Shared with GitHub Actions scripts: relative imports with .ts, no Next.js APIs.
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "../../../lib/supabase/database.types.ts";
import type { JobDefinition } from "../../../server/jobs/registry.ts";
import type { JobContext } from "../../../server/jobs/runner.ts";
import {
  allHouseholdIds,
  notify,
} from "../../../server/notifications/notify.ts";
import { dublinDate } from "../../../server/domain/dates.ts";
import { expandEvents, type EventRecurrence } from "./recurrence.ts";
import {
  planFamilyReminders,
  type ReminderApplication,
  type ReminderTask,
} from "./reminders.ts";
import { addDays, dublinTime, zonedInstant, type IsoDate } from "./time.ts";

type Admin = SupabaseClient<Database>;

/** Loads one household's data and plans its reminders. Throws on any query error. */
export async function familyRemindersFor(
  admin: Admin,
  householdId: string,
  today: IsoDate,
  jobRunId?: string,
) {
  const tomorrowStart = zonedInstant(addDays(today, 1)).toISOString();
  // One-off events must have started in the last 60 days to touch today (long all-day
  // events included); repeating ones can have started any time before tomorrow.
  const lookback = zonedInstant(addDays(today, -60)).toISOString();
  const [members, schools, tasks, events, applications] = await Promise.all([
    admin
      .from("household_members")
      .select("id, display_name")
      .eq("household_id", householdId),
    admin.from("schools").select("id, name").eq("household_id", householdId),
    admin
      .from("tasks")
      .select("id, title, due_on, due_time, assignee_member_id")
      .eq("household_id", householdId)
      .eq("status", "open")
      .lte("due_on", today)
      .order("due_on"),
    admin
      .from("events")
      .select(
        "id, title, starts_at, ends_at, all_day, start_date, end_date, recurrence",
      )
      .eq("household_id", householdId)
      .lt("starts_at", tomorrowStart)
      .or(`recurrence.neq.none,starts_at.gte.${lookback}`),
    admin
      .from("school_applications")
      .select(
        "id, status, application_deadline, open_day, school_id, child_member_id",
      )
      .eq("household_id", householdId)
      .or(`application_deadline.gte.${today},open_day.eq.${addDays(today, 1)}`),
  ]);
  for (const result of [members, schools, tasks, events, applications]) {
    if (result.error) throw new Error(result.error.message);
  }

  const names = new Map(
    (members.data ?? []).map((m) => [m.id, m.display_name]),
  );
  const openTasks: ReminderTask[] = (tasks.data ?? []).flatMap((t) =>
    t.due_on
      ? [
          {
            id: t.id,
            title: t.title,
            dueOn: t.due_on,
            dueTime: t.due_time,
            assigneeName: t.assignee_member_id
              ? (names.get(t.assignee_member_id) ?? null)
              : null,
          },
        ]
      : [],
  );
  const occurrences = expandEvents(
    (events.data ?? []).map((e) => ({
      id: e.id,
      title: e.title,
      startsAt: new Date(e.starts_at),
      endsAt: e.ends_at ? new Date(e.ends_at) : null,
      allDay: e.all_day,
      startDate: e.start_date,
      endDate: e.end_date,
      recurrence: e.recurrence as EventRecurrence,
    })),
    today,
    today,
  );
  const todaysEvents = occurrences
    // A timed event that started yesterday evening isn't "today's".
    .filter((o) => o.event.allDay || o.date === today)
    .map((o) => ({
      title: o.event.title,
      time: o.event.allDay ? null : dublinTime(o.start),
    }));
  const schoolNames = new Map((schools.data ?? []).map((s) => [s.id, s.name]));
  const apps: ReminderApplication[] = (applications.data ?? []).map((a) => ({
    id: a.id,
    schoolId: a.school_id,
    schoolName: schoolNames.get(a.school_id) ?? "School",
    childName: names.get(a.child_member_id) ?? "Child",
    status: a.status,
    applicationDeadline: a.application_deadline,
    openDay: a.open_day,
  }));

  return planFamilyReminders({
    householdId,
    today,
    openTasks,
    todaysEvents,
    applications: apps,
    jobRunId,
  });
}

export const familyReminders: JobDefinition = {
  type: "family-reminders",
  group: "daily",
  description:
    "Tasks due or overdue, today's events, school deadlines and open days",
  idempotencyKey: (now) => `family-reminders:${dublinDate(now)}`,
  async run(ctx: JobContext, admin: Admin) {
    const today = dublinDate(ctx.now);
    const households = await allHouseholdIds(admin);
    let sent = 0;
    let failed = 0;
    for (const householdId of households) {
      try {
        const planned = await familyRemindersFor(
          admin,
          householdId,
          today,
          ctx.runId,
        );
        const created = await notify(admin, planned);
        sent += created;
        await ctx.recordSource({
          source: `household:${householdId.slice(0, 8)}`,
          status: "ok",
          itemsSeen: planned.length,
        });
      } catch (error) {
        failed += 1;
        await ctx.recordSource({
          source: `household:${householdId.slice(0, 8)}`,
          status: "failed",
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }
    if (households.length === 0) {
      await ctx.recordSource({
        source: "households",
        status: "ok",
        itemsSeen: 0,
      });
    }
    ctx.setStats({ households: households.length, sent, failed });
    ctx.setSummary(
      failed > 0
        ? `${sent} reminder${sent === 1 ? "" : "s"} sent · ${failed} household${failed === 1 ? "" : "s"} failed`
        : `${sent} reminder${sent === 1 ? "" : "s"} sent`,
    );
  },
};
