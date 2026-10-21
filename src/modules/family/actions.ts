"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { requireHousehold } from "@/server/auth";
import { dublinDate } from "@/server/domain/dates";
import {
  applicationSchema,
  childSchema,
  eventColumns,
  eventSchema,
  feedSchema,
  firstError,
  formObject,
  listItemSchema,
  listSchema,
  schoolSchema,
  taskFromSchema,
  taskSchema,
  type TaskFromInput,
} from "./schemas";
import {
  feedUrls,
  generateFeedToken,
  hashFeedToken,
} from "./server/ical-token.ts";
import { nextTaskDueOn } from "./server/recurrence.ts";

// Every action re-checks the signed-in user and works through row-level security,
// so it can only ever touch the caller's own household.

export type FormState = {
  ok?: boolean;
  error?: string;
  notice?: string;
};

export type FeedState = FormState & {
  urls?: { https: string; webcal: string };
};

const NO_HOUSEHOLD = "Your account isn't part of a household yet.";
const SAVE_FAILED = "Couldn't save. Check your connection and try again.";

async function context() {
  const { user, profile } = await requireHousehold();
  if (!profile) return null;
  return {
    userId: user.id,
    householdId: profile.householdId,
    supabase: await createClient(),
  };
}

function refreshFamily() {
  revalidatePath("/family", "layout");
}

/** Only allow returning to Family pages. */
function safeReturn(value: FormDataEntryValue | null, fallback: string) {
  return typeof value === "string" &&
    /^\/family(\/[\w\-/]*)?(\?[\w=&\-]*)?$/.test(value)
    ? value
    : fallback;
}

// Tasks -----------------------------------------------------------------------------------

export async function createTaskAction(formData: FormData): Promise<FormState> {
  const ctx = await context();
  if (!ctx) return { error: NO_HOUSEHOLD };
  const parsed = taskSchema.safeParse(formObject(formData));
  if (!parsed.success) return { error: firstError(parsed.error) };
  const t = parsed.data;
  const { error } = await ctx.supabase.from("tasks").insert({
    household_id: ctx.householdId,
    title: t.title,
    notes: t.notes,
    due_on: t.dueOn,
    due_time: t.dueTime,
    assignee_member_id: t.assigneeMemberId,
    recurrence: t.recurrence,
    recurrence_interval: t.recurrenceInterval,
    recurrence_anchor_on: t.recurrence === "none" ? null : t.dueOn,
    related_url: t.relatedUrl,
    created_by: ctx.userId,
  });
  if (error) return { error: SAVE_FAILED };
  refreshFamily();
  const back = formData.get("returnTo");
  if (back) redirect(safeReturn(back, "/family/tasks"));
  return { ok: true, notice: `Added “${t.title}”.` };
}

export async function updateTaskAction(
  id: string,
  formData: FormData,
): Promise<FormState> {
  const ctx = await context();
  if (!ctx) return { error: NO_HOUSEHOLD };
  const parsed = taskSchema.safeParse(formObject(formData));
  if (!parsed.success) return { error: firstError(parsed.error) };
  const t = parsed.data;
  const current = await ctx.supabase
    .from("tasks")
    .select("due_on, recurrence, recurrence_interval, recurrence_anchor_on")
    .eq("id", id)
    .maybeSingle();
  if (current.error || !current.data) return { error: "That task is gone." };
  // Keep the series anchor (e.g. "the 31st") unless the schedule itself changed.
  const sameSchedule =
    current.data.due_on === t.dueOn &&
    current.data.recurrence === t.recurrence &&
    current.data.recurrence_interval === t.recurrenceInterval;
  const anchor =
    t.recurrence === "none"
      ? null
      : sameSchedule
        ? (current.data.recurrence_anchor_on ?? t.dueOn)
        : t.dueOn;
  const { error } = await ctx.supabase
    .from("tasks")
    .update({
      title: t.title,
      notes: t.notes,
      due_on: t.dueOn,
      due_time: t.dueTime,
      assignee_member_id: t.assigneeMemberId,
      recurrence: t.recurrence,
      recurrence_interval: t.recurrenceInterval,
      recurrence_anchor_on: anchor,
      related_url: t.relatedUrl,
    })
    .eq("id", id);
  if (error) return { error: SAVE_FAILED };
  refreshFamily();
  redirect(safeReturn(formData.get("returnTo"), "/family/tasks"));
}

export async function deleteTaskAction(id: string): Promise<void> {
  const ctx = await context();
  if (!ctx) return;
  await ctx.supabase.from("tasks").delete().eq("id", id);
  refreshFamily();
  redirect("/family/tasks");
}

/**
 * Ticks a task off (or back on). Completing a repeating task creates the next one,
 * due on the next date in the series after today.
 */
export async function setTaskDoneAction(
  id: string,
  done: boolean,
): Promise<FormState> {
  const ctx = await context();
  if (!ctx) return { error: NO_HOUSEHOLD };
  if (!done) {
    const { error } = await ctx.supabase
      .from("tasks")
      .update({ status: "open", completed_at: null, completed_by: null })
      .eq("id", id);
    if (error) return { error: SAVE_FAILED };
    refreshFamily();
    return { ok: true };
  }
  // Only the request that actually flips open → done spawns the next occurrence.
  const { data, error } = await ctx.supabase
    .from("tasks")
    .update({
      status: "done",
      completed_at: new Date().toISOString(),
      completed_by: ctx.userId,
    })
    .eq("id", id)
    .eq("status", "open")
    .select(
      "title, notes, due_on, due_time, assignee_member_id, recurrence, recurrence_interval, recurrence_anchor_on, related_entity_type, related_entity_id, related_url",
    );
  if (error) return { error: SAVE_FAILED };
  const task = data[0];
  if (task) {
    const next = nextTaskDueOn(
      {
        dueOn: task.due_on,
        recurrence: task.recurrence as Parameters<
          typeof nextTaskDueOn
        >[0]["recurrence"],
        interval: task.recurrence_interval,
        anchorOn: task.recurrence_anchor_on,
      },
      dublinDate(new Date()),
    );
    if (next) {
      const inserted = await ctx.supabase.from("tasks").insert({
        household_id: ctx.householdId,
        title: task.title,
        notes: task.notes,
        due_on: next,
        due_time: task.due_time,
        assignee_member_id: task.assignee_member_id,
        recurrence: task.recurrence,
        recurrence_interval: task.recurrence_interval,
        recurrence_anchor_on: task.recurrence_anchor_on ?? task.due_on,
        related_entity_type: task.related_entity_type,
        related_entity_id: task.related_entity_id,
        related_url: task.related_url,
        created_by: ctx.userId,
      });
      if (inserted.error)
        return { error: "Done, but the next repeat couldn't be created." };
    }
  }
  refreshFamily();
  return { ok: true };
}

/**
 * For other modules: create a task linked to something else (e.g. a housing deadline).
 * Returns the new task's id. Throws if the input is invalid or the user has no household.
 */
export async function createTaskFromAction(
  input: TaskFromInput,
): Promise<string> {
  const ctx = await context();
  if (!ctx) throw new Error(NO_HOUSEHOLD);
  const parsed = taskFromSchema.safeParse(input);
  if (!parsed.success) throw new Error(firstError(parsed.error));
  const t = parsed.data;
  const { data, error } = await ctx.supabase
    .from("tasks")
    .insert({
      household_id: ctx.householdId,
      title: t.title,
      due_on: t.dueOn ?? null,
      related_entity_type: t.relatedEntityType ?? null,
      related_entity_id: t.relatedEntityId ?? null,
      related_url: t.relatedUrl ?? null,
      created_by: ctx.userId,
    })
    .select("id")
    .single();
  if (error) throw new Error(`Couldn't create the task: ${error.message}`);
  refreshFamily();
  return data.id;
}

// Events ----------------------------------------------------------------------------------

export async function saveEventAction(
  id: string | null,
  formData: FormData,
): Promise<FormState> {
  const ctx = await context();
  if (!ctx) return { error: NO_HOUSEHOLD };
  const parsed = eventSchema.safeParse(formObject(formData, ["memberIds"]));
  if (!parsed.success) return { error: firstError(parsed.error) };
  const e = parsed.data;
  const row = {
    title: e.title,
    location: e.location,
    notes: e.notes,
    member_ids: e.memberIds,
    recurrence: e.recurrence,
    related_url: e.relatedUrl,
    ...eventColumns(e),
  };
  const { error } = id
    ? await ctx.supabase.from("events").update(row).eq("id", id)
    : await ctx.supabase.from("events").insert({
        ...row,
        household_id: ctx.householdId,
        created_by: ctx.userId,
      });
  if (error) return { error: SAVE_FAILED };
  refreshFamily();
  redirect(`/family?week=${e.date}`);
}

export async function deleteEventAction(id: string): Promise<void> {
  const ctx = await context();
  if (!ctx) return;
  await ctx.supabase.from("events").delete().eq("id", id);
  refreshFamily();
  redirect("/family");
}

// Lists -----------------------------------------------------------------------------------

export async function createListAction(formData: FormData): Promise<FormState> {
  const ctx = await context();
  if (!ctx) return { error: NO_HOUSEHOLD };
  const parsed = listSchema.safeParse(formObject(formData));
  if (!parsed.success) return { error: firstError(parsed.error) };
  const { data, error } = await ctx.supabase
    .from("lists")
    .insert({ household_id: ctx.householdId, ...parsed.data })
    .select("id")
    .single();
  if (error) return { error: SAVE_FAILED };
  refreshFamily();
  redirect(`/family/lists/${data.id}`);
}

export async function updateListAction(
  id: string,
  formData: FormData,
): Promise<FormState> {
  const ctx = await context();
  if (!ctx) return { error: NO_HOUSEHOLD };
  const parsed = listSchema.safeParse(formObject(formData));
  if (!parsed.success) return { error: firstError(parsed.error) };
  const { error } = await ctx.supabase
    .from("lists")
    .update(parsed.data)
    .eq("id", id);
  if (error) return { error: SAVE_FAILED };
  refreshFamily();
  return { ok: true, notice: "Saved." };
}

export async function deleteListAction(id: string): Promise<void> {
  const ctx = await context();
  if (!ctx) return;
  await ctx.supabase.from("lists").delete().eq("id", id);
  refreshFamily();
  redirect("/family/lists");
}

export async function addListItemAction(
  listId: string,
  formData: FormData,
): Promise<FormState> {
  const ctx = await context();
  if (!ctx) return { error: NO_HOUSEHOLD };
  const parsed = listItemSchema.safeParse(formObject(formData));
  if (!parsed.success) return { error: firstError(parsed.error) };
  const { error } = await ctx.supabase.from("list_items").insert({
    list_id: listId,
    household_id: ctx.householdId,
    text: parsed.data.text,
    created_by: ctx.userId,
  });
  if (error) return { error: SAVE_FAILED };
  refreshFamily();
  return { ok: true };
}

export async function setListItemCheckedAction(
  id: string,
  checked: boolean,
): Promise<FormState> {
  const ctx = await context();
  if (!ctx) return { error: NO_HOUSEHOLD };
  const { error } = await ctx.supabase
    .from("list_items")
    .update({
      checked,
      checked_at: checked ? new Date().toISOString() : null,
    })
    .eq("id", id);
  if (error) return { error: SAVE_FAILED };
  refreshFamily();
  return { ok: true };
}

export async function deleteListItemAction(id: string): Promise<FormState> {
  const ctx = await context();
  if (!ctx) return { error: NO_HOUSEHOLD };
  const { error } = await ctx.supabase.from("list_items").delete().eq("id", id);
  if (error) return { error: SAVE_FAILED };
  refreshFamily();
  return { ok: true };
}

export async function clearCheckedAction(listId: string): Promise<FormState> {
  const ctx = await context();
  if (!ctx) return { error: NO_HOUSEHOLD };
  const { error } = await ctx.supabase
    .from("list_items")
    .delete()
    .eq("list_id", listId)
    .eq("checked", true);
  if (error) return { error: SAVE_FAILED };
  refreshFamily();
  return { ok: true };
}

// People ----------------------------------------------------------------------------------

export async function addChildAction(formData: FormData): Promise<FormState> {
  const ctx = await context();
  if (!ctx) return { error: NO_HOUSEHOLD };
  const parsed = childSchema.safeParse(formObject(formData));
  if (!parsed.success) return { error: firstError(parsed.error) };
  const { name, dateOfBirth } = parsed.data;
  if (dateOfBirth && dateOfBirth > dublinDate(new Date())) {
    return { error: "Date of birth can't be in the future." };
  }
  const { error } = await ctx.supabase.from("household_members").insert({
    household_id: ctx.householdId,
    display_name: name,
    relationship: "child",
    date_of_birth: dateOfBirth,
  });
  if (error) return { error: SAVE_FAILED };
  refreshFamily();
  return { ok: true, notice: `Added ${name}.` };
}

export async function updatePersonAction(
  id: string,
  formData: FormData,
): Promise<FormState> {
  const ctx = await context();
  if (!ctx) return { error: NO_HOUSEHOLD };
  const parsed = childSchema.safeParse(formObject(formData));
  if (!parsed.success) return { error: firstError(parsed.error) };
  const { name, dateOfBirth } = parsed.data;
  if (dateOfBirth && dateOfBirth > dublinDate(new Date())) {
    return { error: "Date of birth can't be in the future." };
  }
  // Adults with a login are renamed in Settings; here only their date of birth changes.
  const current = await ctx.supabase
    .from("household_members")
    .select("user_id")
    .eq("id", id)
    .maybeSingle();
  if (current.error || !current.data) return { error: "That person is gone." };
  const { error } = await ctx.supabase
    .from("household_members")
    .update(
      current.data.user_id
        ? { date_of_birth: dateOfBirth }
        : { display_name: name, date_of_birth: dateOfBirth },
    )
    .eq("id", id);
  if (error) return { error: SAVE_FAILED };
  refreshFamily();
  redirect("/family#people");
}

export async function removePersonAction(id: string): Promise<void> {
  const ctx = await context();
  if (!ctx) return;
  // People with a login can't be removed here (that's an account change).
  await ctx.supabase
    .from("household_members")
    .delete()
    .eq("id", id)
    .is("user_id", null);
  refreshFamily();
  redirect("/family#people");
}

// Schools ---------------------------------------------------------------------------------

export async function saveSchoolAction(
  id: string | null,
  formData: FormData,
): Promise<FormState> {
  const ctx = await context();
  if (!ctx) return { error: NO_HOUSEHOLD };
  const parsed = schoolSchema.safeParse(formObject(formData));
  if (!parsed.success) return { error: firstError(parsed.error) };
  const s = parsed.data;
  const row = {
    name: s.name,
    level: s.level,
    address: s.address,
    website: s.website,
    admissions_policy_url: s.admissionsPolicyUrl,
    policy_checked_on: s.policyCheckedOn,
    latitude: s.latitude,
    longitude: s.longitude,
    notes: s.notes,
  };
  const { error } = id
    ? await ctx.supabase.from("schools").update(row).eq("id", id)
    : await ctx.supabase
        .from("schools")
        .insert({ ...row, household_id: ctx.householdId });
  if (error) return { error: SAVE_FAILED };
  refreshFamily();
  redirect("/family/schools");
}

export async function deleteSchoolAction(id: string): Promise<void> {
  const ctx = await context();
  if (!ctx) return;
  await ctx.supabase.from("schools").delete().eq("id", id);
  refreshFamily();
  redirect("/family/schools");
}

export async function saveApplicationAction(
  id: string | null,
  formData: FormData,
): Promise<FormState> {
  const ctx = await context();
  if (!ctx) return { error: NO_HOUSEHOLD };
  const parsed = applicationSchema.safeParse(formObject(formData));
  if (!parsed.success) return { error: firstError(parsed.error) };
  const a = parsed.data;
  const row = {
    school_id: a.schoolId,
    child_member_id: a.childMemberId,
    intake_year: a.intakeYear,
    status: a.status,
    preference_rank: a.preferenceRank,
    application_deadline: a.applicationDeadline,
    open_day: a.openDay,
    decision_date: a.decisionDate,
    notes: a.notes,
  };
  const { error } = id
    ? await ctx.supabase.from("school_applications").update(row).eq("id", id)
    : await ctx.supabase
        .from("school_applications")
        .insert({ ...row, household_id: ctx.householdId });
  if (error) {
    return {
      error:
        error.code === "23505"
          ? "This child already has this school for that intake year."
          : SAVE_FAILED,
    };
  }
  refreshFamily();
  redirect("/family/schools");
}

export async function deleteApplicationAction(id: string): Promise<void> {
  const ctx = await context();
  if (!ctx) return;
  await ctx.supabase.from("school_applications").delete().eq("id", id);
  refreshFamily();
  redirect("/family/schools");
}

// Calendar feeds --------------------------------------------------------------------------

async function requestOrigin(): Promise<string> {
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "localhost:3000";
  const proto =
    h.get("x-forwarded-proto") ??
    (host.startsWith("localhost") ? "http" : "https");
  return `${proto}://${host}`;
}

/** Creates a private feed. The token is returned once and only its hash is stored. */
export async function createFeedAction(formData: FormData): Promise<FeedState> {
  const ctx = await context();
  if (!ctx) return { error: NO_HOUSEHOLD };
  const parsed = feedSchema.safeParse(formObject(formData));
  if (!parsed.success) return { error: firstError(parsed.error) };
  const token = generateFeedToken();
  const { data, error } = await ctx.supabase
    .from("ical_tokens")
    .insert({
      household_id: ctx.householdId,
      token_hash: hashFeedToken(token),
      label: parsed.data.label,
      created_by: ctx.userId,
    })
    .select("id")
    .single();
  if (error) return { error: "Couldn't create the feed. Try again." };
  await ctx.supabase.from("audit_events").insert({
    household_id: ctx.householdId,
    actor_id: ctx.userId,
    action: "family.calendar_feed.created",
    entity_type: "ical_token",
    entity_id: data.id,
  });
  refreshFamily();
  return { ok: true, urls: feedUrls(await requestOrigin(), token) };
}

export async function revokeFeedAction(id: string): Promise<FormState> {
  const ctx = await context();
  if (!ctx) return { error: NO_HOUSEHOLD };
  const { error } = await ctx.supabase
    .from("ical_tokens")
    .update({ revoked_at: new Date().toISOString() })
    .eq("id", id)
    .is("revoked_at", null);
  if (error) return { error: "Couldn't revoke the feed. Try again." };
  await ctx.supabase.from("audit_events").insert({
    household_id: ctx.householdId,
    actor_id: ctx.userId,
    action: "family.calendar_feed.revoked",
    entity_type: "ical_token",
    entity_id: id,
  });
  refreshFamily();
  return { ok: true };
}
