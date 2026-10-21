import "server-only";
import { createClient } from "@/lib/supabase/server";
import type { EventRecurrence, TaskRecurrence } from "./server/recurrence.ts";
import { addDays, zonedInstant, type IsoDate } from "./server/time.ts";
import type { WeekEvent, WeekTask } from "./server/week.ts";

// Data loaders for Family pages. They run as the signed-in user, so row-level security
// scopes every query to their household.

type Client = Awaited<ReturnType<typeof createClient>>;

function fail(what: string, message: string): never {
  throw new Error(`Couldn't load ${what}: ${message}`);
}

export type Member = {
  id: string;
  name: string;
  relationship: "adult" | "child" | "other";
  dateOfBirth: IsoDate | null;
  hasLogin: boolean;
};

export async function loadMembers(supabase?: Client): Promise<Member[]> {
  const db = supabase ?? (await createClient());
  const { data, error } = await db
    .from("household_members")
    .select("id, display_name, relationship, date_of_birth, user_id")
    .eq("is_active", true)
    .order("created_at");
  if (error) fail("people", error.message);
  return data.map((m) => ({
    id: m.id,
    name: m.display_name,
    relationship: m.relationship as Member["relationship"],
    dateOfBirth: m.date_of_birth,
    hasLogin: Boolean(m.user_id),
  }));
}

export type EventRow = WeekEvent & {
  notes: string | null;
  relatedUrl: string | null;
  updatedAt: Date;
};

const EVENT_COLUMNS =
  "id, title, starts_at, ends_at, all_day, start_date, end_date, location, notes, member_ids, recurrence, related_url, updated_at";

type EventDbRow = {
  id: string;
  title: string;
  starts_at: string;
  ends_at: string | null;
  all_day: boolean;
  start_date: string | null;
  end_date: string | null;
  location: string | null;
  notes: string | null;
  member_ids: string[];
  recurrence: string;
  related_url: string | null;
  updated_at: string;
};

export function toEvent(row: EventDbRow): EventRow {
  return {
    id: row.id,
    title: row.title,
    startsAt: new Date(row.starts_at),
    endsAt: row.ends_at ? new Date(row.ends_at) : null,
    allDay: row.all_day,
    startDate: row.start_date,
    endDate: row.end_date,
    location: row.location,
    notes: row.notes,
    memberIds: row.member_ids,
    recurrence: row.recurrence as EventRecurrence,
    relatedUrl: row.related_url,
    updatedAt: new Date(row.updated_at),
  };
}

/**
 * Events that could touch local dates from…to: repeating ones that started before `to`, plus
 * one-off ones starting up to 60 days earlier (long all-day events). expandEvents() filters exactly.
 */
export async function loadEventsBetween(
  from: IsoDate,
  to: IsoDate,
  supabase?: Client,
): Promise<EventRow[]> {
  const db = supabase ?? (await createClient());
  const end = zonedInstant(addDays(to, 1)).toISOString();
  const lookback = zonedInstant(addDays(from, -60)).toISOString();
  const { data, error } = await db
    .from("events")
    .select(EVENT_COLUMNS)
    .lt("starts_at", end)
    .or(`recurrence.neq.none,starts_at.gte.${lookback}`)
    .order("starts_at")
    .limit(2000);
  if (error) fail("events", error.message);
  return data.map(toEvent);
}

export async function loadEvent(id: string): Promise<EventRow | null> {
  const db = await createClient();
  const { data, error } = await db
    .from("events")
    .select(EVENT_COLUMNS)
    .eq("id", id)
    .maybeSingle();
  if (error) fail("the event", error.message);
  return data ? toEvent(data) : null;
}

export type TaskRow = WeekTask & {
  notes: string | null;
  recurrence: TaskRecurrence;
  recurrenceInterval: number;
  recurrenceAnchorOn: IsoDate | null;
  completedAt: Date | null;
  relatedEntityType: string | null;
  relatedEntityId: string | null;
  relatedUrl: string | null;
};

const TASK_COLUMNS =
  "id, title, notes, due_on, due_time, assignee_member_id, recurrence, recurrence_interval, recurrence_anchor_on, status, completed_at, related_entity_type, related_entity_id, related_url";

type TaskDbRow = {
  id: string;
  title: string;
  notes: string | null;
  due_on: string | null;
  due_time: string | null;
  assignee_member_id: string | null;
  recurrence: string;
  recurrence_interval: number;
  recurrence_anchor_on: string | null;
  status: string;
  completed_at: string | null;
  related_entity_type: string | null;
  related_entity_id: string | null;
  related_url: string | null;
};

function toTask(row: TaskDbRow): TaskRow {
  return {
    id: row.id,
    title: row.title,
    notes: row.notes,
    dueOn: row.due_on,
    dueTime: row.due_time ? row.due_time.slice(0, 5) : null,
    assigneeMemberId: row.assignee_member_id,
    recurrence: row.recurrence as TaskRecurrence,
    recurrenceInterval: row.recurrence_interval,
    recurrenceAnchorOn: row.recurrence_anchor_on,
    status: row.status as TaskRow["status"],
    completedAt: row.completed_at ? new Date(row.completed_at) : null,
    relatedEntityType: row.related_entity_type,
    relatedEntityId: row.related_entity_id,
    relatedUrl: row.related_url,
  };
}

export async function loadTasksDueBetween(
  from: IsoDate,
  to: IsoDate,
  supabase?: Client,
): Promise<TaskRow[]> {
  const db = supabase ?? (await createClient());
  const { data, error } = await db
    .from("tasks")
    .select(TASK_COLUMNS)
    .gte("due_on", from)
    .lte("due_on", to)
    .limit(500);
  if (error) fail("tasks", error.message);
  return data.map(toTask);
}

/** Open tasks, soonest due first, undated last. */
export async function loadOpenTasks(supabase?: Client): Promise<TaskRow[]> {
  const db = supabase ?? (await createClient());
  const { data, error } = await db
    .from("tasks")
    .select(TASK_COLUMNS)
    .eq("status", "open")
    .order("due_on", { ascending: true, nullsFirst: false })
    .order("due_time", { ascending: true, nullsFirst: false })
    .order("created_at")
    .limit(500);
  if (error) fail("tasks", error.message);
  return data.map(toTask);
}

export async function loadRecentlyDoneTasks(limit = 20): Promise<TaskRow[]> {
  const db = await createClient();
  const { data, error } = await db
    .from("tasks")
    .select(TASK_COLUMNS)
    .eq("status", "done")
    .order("completed_at", { ascending: false })
    .limit(limit);
  if (error) fail("tasks", error.message);
  return data.map(toTask);
}

export async function loadTask(id: string): Promise<TaskRow | null> {
  const db = await createClient();
  const { data, error } = await db
    .from("tasks")
    .select(TASK_COLUMNS)
    .eq("id", id)
    .maybeSingle();
  if (error) fail("the task", error.message);
  return data ? toTask(data) : null;
}

export type FamilyList = {
  id: string;
  name: string;
  kind: string;
  items: { id: string; text: string; checked: boolean }[];
};

/**
 * Every list with its items. Creates the default "Shopping" list the first time a household
 * has no lists at all.
 */
export async function loadLists(householdId: string): Promise<FamilyList[]> {
  const db = await createClient();
  const lists = await db
    .from("lists")
    .select("id, name, kind, position")
    .order("position")
    .order("created_at");
  if (lists.error) fail("lists", lists.error.message);
  let rows = lists.data;
  if (rows.length === 0) {
    const created = await db
      .from("lists")
      .insert({ household_id: householdId, name: "Shopping", kind: "shopping" })
      .select("id, name, kind, position")
      .single();
    if (created.error) fail("lists", created.error.message);
    rows = [created.data];
  }
  const items = await db
    .from("list_items")
    .select("id, list_id, text, checked")
    .in(
      "list_id",
      rows.map((l) => l.id),
    )
    .order("checked")
    .order("position")
    .order("created_at")
    .limit(2000);
  if (items.error) fail("list items", items.error.message);
  return rows.map((l) => ({
    id: l.id,
    name: l.name,
    kind: l.kind,
    items: items.data
      .filter((i) => i.list_id === l.id)
      .map((i) => ({ id: i.id, text: i.text, checked: i.checked })),
  }));
}

export type School = {
  id: string;
  name: string;
  level: string;
  address: string | null;
  latitude: number | null;
  longitude: number | null;
  website: string | null;
  admissionsPolicyUrl: string | null;
  policyCheckedOn: IsoDate | null;
  notes: string | null;
};

export type Application = {
  id: string;
  schoolId: string;
  childMemberId: string;
  intakeYear: number;
  status: string;
  preferenceRank: number | null;
  applicationDeadline: IsoDate | null;
  openDay: IsoDate | null;
  decisionDate: IsoDate | null;
  notes: string | null;
};

export async function loadSchools(): Promise<{
  schools: School[];
  applications: Application[];
}> {
  const db = await createClient();
  const [schools, applications] = await Promise.all([
    db
      .from("schools")
      .select(
        "id, name, level, address, latitude, longitude, website, admissions_policy_url, policy_checked_on, notes",
      )
      .order("name"),
    db
      .from("school_applications")
      .select(
        "id, school_id, child_member_id, intake_year, status, preference_rank, application_deadline, open_day, decision_date, notes",
      )
      .order("intake_year")
      .order("preference_rank", { ascending: true, nullsFirst: false }),
  ]);
  if (schools.error) fail("schools", schools.error.message);
  if (applications.error)
    fail("school applications", applications.error.message);
  return {
    schools: schools.data.map((s) => ({
      id: s.id,
      name: s.name,
      level: s.level,
      address: s.address,
      latitude: s.latitude,
      longitude: s.longitude,
      website: s.website,
      admissionsPolicyUrl: s.admissions_policy_url,
      policyCheckedOn: s.policy_checked_on,
      notes: s.notes,
    })),
    applications: applications.data.map((a) => ({
      id: a.id,
      schoolId: a.school_id,
      childMemberId: a.child_member_id,
      intakeYear: a.intake_year,
      status: a.status,
      preferenceRank: a.preference_rank,
      applicationDeadline: a.application_deadline,
      openDay: a.open_day,
      decisionDate: a.decision_date,
      notes: a.notes,
    })),
  };
}

export type Feed = {
  id: string;
  label: string;
  createdAt: Date;
  lastUsedAt: Date | null;
  revokedAt: Date | null;
};

export async function loadFeeds(): Promise<Feed[]> {
  const db = await createClient();
  const { data, error } = await db
    .from("ical_tokens")
    .select("id, label, created_at, last_used_at, revoked_at")
    .order("created_at", { ascending: false });
  if (error) fail("calendar feeds", error.message);
  return data.map((f) => ({
    id: f.id,
    label: f.label,
    createdAt: new Date(f.created_at),
    lastUsedAt: f.last_used_at ? new Date(f.last_used_at) : null,
    revokedAt: f.revoked_at ? new Date(f.revoked_at) : null,
  }));
}
