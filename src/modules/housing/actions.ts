"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireHousehold } from "@/server/auth";
import {
  applicationFormSchema,
  firstError,
  formValues,
  projectFormSchema,
} from "./forms";

export type FormState = { error?: string; notice?: string };

const APPLICATION_FIELDS = [
  "status",
  "applied_on",
  "provider_reference",
  "outcome_text",
  "next_action",
  "next_action_due",
  "notes",
] as const;

/** Saves the household's own tracking for a listing. Daily checks never write this. */
export async function saveApplicationAction(
  listingId: string,
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const { user, profile } = await requireHousehold();
  if (!profile) return { error: "Your account isn't part of a household yet." };
  const parsed = applicationFormSchema.safeParse(
    formValues(formData, APPLICATION_FIELDS),
  );
  if (!parsed.success) return { error: firstError(parsed.error) };

  const supabase = await createClient();
  const listing = await supabase
    .from("housing_listings")
    .select("id")
    .eq("id", listingId)
    .maybeSingle();
  if (listing.error || !listing.data)
    return { error: "That listing no longer exists." };

  const existing = await supabase
    .from("housing_applications")
    .select("id")
    .eq("listing_id", listingId)
    .maybeSingle();
  if (existing.error) return { error: "Couldn't save. Try again." };

  // RLS limits both to this household; household_id and listing_id can't be updated.
  const saved = existing.data
    ? await supabase
        .from("housing_applications")
        .update(parsed.data)
        .eq("id", existing.data.id)
    : await supabase.from("housing_applications").insert({
        ...parsed.data,
        household_id: profile.householdId,
        listing_id: listingId,
      });
  if (saved.error) return { error: "Couldn't save. Try again." };

  // Audit without personal text: the status is enough to follow what happened.
  await supabase.from("audit_events").insert({
    household_id: profile.householdId,
    actor_id: user.id,
    action: "housing.application.saved",
    entity_type: "housing_listing",
    entity_id: listingId,
    metadata: { status: parsed.data.status },
  });
  revalidatePath("/housing");
  revalidatePath(`/housing/${listingId}`);
  return { notice: "Saved. Daily checks never change this section." };
}

const PROJECT_FIELDS = [
  "name",
  "locality",
  "county",
  "provider",
  "stage",
  "total_homes",
  "cost_rental_homes",
  "bedroom_mix",
  "cost_rental_confirmed",
  "expected_date_text",
  "source_url",
  "notes",
  "verification",
  "last_checked_on",
] as const;

/** Adds a pipeline project, or edits one when the form carries an id. */
export async function saveProjectAction(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const { user, profile } = await requireHousehold();
  if (!profile) return { error: "Your account isn't part of a household yet." };
  const parsed = projectFormSchema.safeParse(
    formValues(formData, PROJECT_FIELDS),
  );
  if (!parsed.success) return { error: firstError(parsed.error) };
  const id = String(formData.get("id") ?? "").trim();
  if (id && !/^[0-9a-f-]{36}$/i.test(id)) return { error: "Unknown project." };

  const supabase = await createClient();
  const saved = id
    ? await supabase
        .from("housing_projects")
        .update(parsed.data)
        .eq("id", id)
        .select("id")
        .maybeSingle()
    : await supabase
        .from("housing_projects")
        .insert(parsed.data)
        .select("id")
        .single();
  if (saved.error || !saved.data)
    return { error: "Couldn't save the project. Try again." };

  await supabase.from("audit_events").insert({
    household_id: profile.householdId,
    actor_id: user.id,
    action: id ? "housing.project.updated" : "housing.project.added",
    entity_type: "housing_project",
    entity_id: saved.data.id,
    metadata: {
      cost_rental_confirmed: parsed.data.cost_rental_confirmed,
      verification: parsed.data.verification,
    },
  });
  revalidatePath("/housing/pipeline");
  return {
    notice: id
      ? `Updated “${parsed.data.name}”.`
      : `Added “${parsed.data.name}”.`,
  };
}
