"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { requireHousehold } from "@/server/auth";
import { dublinDate } from "@/server/domain/dates";
import { latestRateOnOrBefore } from "./data";
import {
  isUuid,
  parseCandidateForm,
  parseComponentForm,
  parseTripForm,
} from "./server/forms";
import { CANDIDATE_STATUSES, type CandidateStatus } from "./server/labels";

export type FormState = { errors?: string[] };

const SAVE_FAILED = "Couldn't save. Check your connection and try again.";

async function household() {
  const { user, profile } = await requireHousehold();
  if (!profile) return null;
  return { userId: user.id, householdId: profile.householdId };
}

async function audit(
  supabase: Awaited<ReturnType<typeof createClient>>,
  who: { userId: string; householdId: string },
  action: string,
  entityType: string,
  entityId: string,
) {
  // The audit trail is best-effort; never fail the user's change because of it.
  await supabase.from("audit_events").insert({
    household_id: who.householdId,
    actor_id: who.userId,
    action,
    entity_type: entityType,
    entity_id: entityId,
  });
}

const formId = (formData: FormData, name: string) => {
  const value = formData.get(name);
  return typeof value === "string" && isUuid(value) ? value : null;
};

// Trips ---------------------------------------------------------------------------------------

export async function saveTripAction(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const who = await household();
  if (!who) return { errors: ["Your account isn't part of a household yet."] };
  const parsed = parseTripForm(formData);
  if (!parsed.ok) return { errors: parsed.errors };
  const input = parsed.value;
  const supabase = await createClient();

  const row = {
    name: input.name,
    date_from: input.dateFrom,
    date_to: input.dateTo,
    nights_min: input.nightsMin,
    nights_max: input.nightsMax,
    departure_airports: input.departureAirports,
    destination_ideas: input.destinationIdeas,
    budget_cents: input.budgetCents,
    board_basis: input.boardBasis,
    room_needs: input.roomNeeds,
    max_stops: input.maxStops,
    max_flight_minutes: input.maxFlightMinutes,
    require_free_cancellation: input.requireFreeCancellation,
    status: input.status,
    notes: input.notes,
  };
  let tripId = formId(formData, "trip_id");
  if (tripId) {
    const { data, error } = await supabase
      .from("trips")
      .update(row)
      .eq("id", tripId)
      .select("id")
      .maybeSingle();
    if (error) return { errors: [SAVE_FAILED] };
    if (!data) return { errors: ["This trip no longer exists."] };
  } else {
    const { data, error } = await supabase
      .from("trips")
      .insert({ ...row, household_id: who.householdId })
      .select("id")
      .single();
    if (error) return { errors: [SAVE_FAILED] };
    tripId = data.id;
    await audit(supabase, who, "travel.trip_created", "trip", tripId);
  }

  // Travellers: the form carries the whole list, so make the stored list match it.
  const existing = await supabase
    .from("trip_travellers")
    .select("id")
    .eq("trip_id", tripId);
  if (existing.error) return { errors: [SAVE_FAILED] };
  const existingIds = new Set(existing.data.map((t) => t.id));
  const keep = input.travellers.filter((t) => t.id && existingIds.has(t.id));
  const removed = [...existingIds].filter(
    (id) => !keep.some((t) => t.id === id),
  );
  if (removed.length > 0) {
    const { error } = await supabase
      .from("trip_travellers")
      .delete()
      .in("id", removed);
    if (error) return { errors: [SAVE_FAILED] };
  }
  const travellerRow = (t: (typeof input.travellers)[number]) => ({
    member_id: t.memberId,
    name: t.name,
    is_child: t.isChild,
    age_at_travel: t.ageAtTravel,
    confirmed: t.confirmed,
  });
  for (const t of keep) {
    const { error } = await supabase
      .from("trip_travellers")
      .update(travellerRow(t))
      .eq("id", t.id as string);
    if (error) return { errors: [SAVE_FAILED] };
  }
  const added = input.travellers.filter((t) => !t.id || !existingIds.has(t.id));
  if (added.length > 0) {
    const { error } = await supabase.from("trip_travellers").insert(
      added.map((t) => ({
        ...travellerRow(t),
        trip_id: tripId as string,
        household_id: who.householdId,
      })),
    );
    if (error) return { errors: [SAVE_FAILED] };
  }
  revalidatePath("/travel");
  redirect(`/travel/${tripId}`);
}

export async function deleteTripAction(tripId: string): Promise<void> {
  const who = await household();
  if (!who || !isUuid(tripId)) redirect("/travel");
  const supabase = await createClient();
  const { data } = await supabase
    .from("trips")
    .delete()
    .eq("id", tripId)
    .select("id");
  if (data && data.length > 0)
    await audit(supabase, who, "travel.trip_deleted", "trip", tripId);
  revalidatePath("/travel");
  redirect("/travel");
}

// Options (candidates) -------------------------------------------------------------------------

export async function saveCandidateAction(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const who = await household();
  if (!who) return { errors: ["Your account isn't part of a household yet."] };
  const tripId = formId(formData, "trip_id");
  if (!tripId) return { errors: ["This trip no longer exists."] };
  const parsed = parseCandidateForm(formData);
  if (!parsed.ok) return { errors: parsed.errors };
  const input = parsed.value;
  const supabase = await createClient();
  const row = {
    destination: input.destination,
    destination_airport: input.destinationAirport,
    destination_country: input.destinationCountry,
    outbound_date: input.outboundDate,
    return_date: input.returnDate,
    departure_airport: input.departureAirport,
    notes: input.notes,
    trade_offs: input.tradeOffs,
    status: input.status,
  };
  const candidateId = formId(formData, "candidate_id");
  if (candidateId) {
    const { data, error } = await supabase
      .from("trip_candidates")
      .update(row)
      .eq("id", candidateId)
      .eq("trip_id", tripId)
      .select("id")
      .maybeSingle();
    if (error) return { errors: [SAVE_FAILED] };
    if (!data) return { errors: ["This option no longer exists."] };
    revalidatePath(`/travel/${tripId}`);
    redirect(`/travel/${tripId}#option-${candidateId}`);
  }
  const { data, error } = await supabase
    .from("trip_candidates")
    .insert({ ...row, trip_id: tripId, household_id: who.householdId })
    .select("id")
    .single();
  if (error) return { errors: [SAVE_FAILED] };
  revalidatePath(`/travel/${tripId}`);
  // Straight on to the first price for this option.
  redirect(`/travel/${tripId}/candidates/${data.id}/components/new`);
}

export async function deleteCandidateAction(
  tripId: string,
  candidateId: string,
): Promise<void> {
  const who = await household();
  if (!who || !isUuid(tripId) || !isUuid(candidateId)) redirect("/travel");
  const supabase = await createClient();
  await supabase
    .from("trip_candidates")
    .delete()
    .eq("id", candidateId)
    .eq("trip_id", tripId);
  revalidatePath(`/travel/${tripId}`);
  redirect(`/travel/${tripId}`);
}

export async function setCandidateStatusAction(
  tripId: string,
  candidateId: string,
  status: CandidateStatus,
): Promise<void> {
  const who = await household();
  if (
    !who ||
    !isUuid(tripId) ||
    !isUuid(candidateId) ||
    !CANDIDATE_STATUSES.includes(status)
  )
    return;
  const supabase = await createClient();
  const { data } = await supabase
    .from("trip_candidates")
    .update({ status })
    .eq("id", candidateId)
    .eq("trip_id", tripId)
    .select("id");
  if (data && data.length > 0)
    await audit(
      supabase,
      who,
      `travel.option_${status}`,
      "trip_candidate",
      candidateId,
    );
  revalidatePath(`/travel/${tripId}`);
}

// Prices (components) ------------------------------------------------------------------------

export async function saveComponentAction(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const who = await household();
  if (!who) return { errors: ["Your account isn't part of a household yet."] };
  const tripId = formId(formData, "trip_id");
  const candidateId = formId(formData, "candidate_id");
  if (!tripId || !candidateId)
    return { errors: ["This option no longer exists."] };
  const parsed = parseComponentForm(formData, new Date());
  if (!parsed.ok) return { errors: parsed.errors };
  const input = parsed.value;
  const supabase = await createClient();

  const candidate = await supabase
    .from("trip_candidates")
    .select("id")
    .eq("id", candidateId)
    .eq("trip_id", tripId)
    .maybeSingle();
  if (candidate.error) return { errors: [SAVE_FAILED] };
  if (!candidate.data) return { errors: ["This option no longer exists."] };

  // Pin the ECB rate in force on the day the price was checked (latest on or before it).
  const rate =
    input.currency === "EUR"
      ? null
      : await latestRateOnOrBefore(
          supabase,
          input.currency,
          dublinDate(input.checkedAt),
        );
  const row = {
    kind: input.kind,
    provider: input.provider,
    description: input.description,
    price_minor: input.priceMinor,
    currency: input.currency,
    fx_rate_id: rate?.id ?? null,
    is_estimate: input.isEstimate,
    includes: input.includes,
    excludes: input.excludes,
    booking_url: input.bookingUrl,
    cancellation_terms: input.cancellationTerms,
    free_cancellation: input.freeCancellation,
    board_basis: input.boardBasis,
    stops: input.stops,
    duration_minutes: input.durationMinutes,
    checked_at: input.checkedAt.toISOString(),
  };
  const componentId = formId(formData, "component_id");
  if (componentId) {
    const { data, error } = await supabase
      .from("trip_components")
      .update(row)
      .eq("id", componentId)
      .eq("candidate_id", candidateId)
      .select("id")
      .maybeSingle();
    if (error) return { errors: [SAVE_FAILED] };
    if (!data) return { errors: ["This price no longer exists."] };
  } else {
    const { error } = await supabase.from("trip_components").insert({
      ...row,
      candidate_id: candidateId,
      household_id: who.householdId,
    });
    if (error) return { errors: [SAVE_FAILED] };
  }
  revalidatePath(`/travel/${tripId}`);
  if (formData.get("then") === "another")
    redirect(`/travel/${tripId}/candidates/${candidateId}/components/new`);
  redirect(`/travel/${tripId}#option-${candidateId}`);
}

export async function deleteComponentAction(
  tripId: string,
  candidateId: string,
  componentId: string,
): Promise<void> {
  const who = await household();
  if (!who || ![tripId, candidateId, componentId].every(isUuid))
    redirect("/travel");
  const supabase = await createClient();
  await supabase
    .from("trip_components")
    .delete()
    .eq("id", componentId)
    .eq("candidate_id", candidateId);
  revalidatePath(`/travel/${tripId}`);
  redirect(`/travel/${tripId}#option-${candidateId}`);
}
