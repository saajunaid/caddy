"use server";

// Mutations for the Utilities screens. Every action re-checks the signed-in household and
// writes through row-level security. Nothing here contacts a supplier: Caddy never switches.
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { requireHousehold } from "@/server/auth";
import { dublinDate } from "@/server/domain/dates";
import { comparisonSnapshot } from "./server/compare";
import {
  formInput,
  overlapsExisting,
  parseContract,
  parseOffer,
  parseSupplierName,
  parseUsage,
} from "./server/forms";
import { asJson } from "./server/job";
import {
  asUtilityType,
  contractComparison,
  excludedSuppliers,
} from "./server/rows";
import { DECISIONS, DEFAULT_EXCLUDED_SUPPLIERS } from "./server/types";

export type FormState = {
  error?: string;
  notice?: string;
  /** Submitted values, so a rejected form keeps what the user typed. */
  values?: Record<string, string | undefined>;
};

const BASE = "/money/utilities";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function household() {
  const { user, profile } = await requireHousehold();
  if (!profile) return null;
  return { userId: user.id, householdId: profile.householdId };
}

const NO_HOUSEHOLD: FormState = {
  error: "Your account isn't part of a household yet.",
};

async function audit(
  ctx: { userId: string; householdId: string },
  action: string,
  entityType: string,
  entityId: string,
) {
  const supabase = await createClient();
  // Best effort: the change itself has already been saved.
  await supabase.from("audit_events").insert({
    household_id: ctx.householdId,
    actor_id: ctx.userId,
    action,
    entity_type: entityType,
    entity_id: entityId,
  });
}

async function loadContract(id: string) {
  if (!UUID.test(id)) return null;
  const supabase = await createClient();
  const { data } = await supabase
    .from("utility_contracts")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  return data;
}

// Contracts ------------------------------------------------------------------------------------

export async function createContractAction(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const ctx = await household();
  if (!ctx) return NO_HOUSEHOLD;
  const input = formInput(formData);
  const parsed = parseContract(input);
  if (!parsed.ok) return { error: parsed.error, values: input };
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("utility_contracts")
    .insert({ ...parsed.value, household_id: ctx.householdId })
    .select("id")
    .single();
  if (error) {
    return { error: "Couldn't save the contract. Try again.", values: input };
  }
  await audit(ctx, "utilities.contract.created", "utility_contract", data.id);
  revalidatePath(BASE);
  redirect(`${BASE}/${data.id}`);
}

export async function updateContractAction(
  contractId: string,
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const ctx = await household();
  if (!ctx) return NO_HOUSEHOLD;
  const input = formInput(formData);
  const parsed = parseContract(input);
  if (!parsed.ok) return { error: parsed.error, values: input };
  if (!(await loadContract(contractId))) {
    return { error: "This contract no longer exists." };
  }
  const supabase = await createClient();
  const { error } = await supabase
    .from("utility_contracts")
    .update(parsed.value)
    .eq("id", contractId);
  if (error) {
    return { error: "Couldn't save the contract. Try again.", values: input };
  }
  await audit(
    ctx,
    "utilities.contract.updated",
    "utility_contract",
    contractId,
  );
  revalidatePath(BASE, "layout");
  return {
    notice: parsed.value.contract_end
      ? "Saved. The reminder follows the new end date."
      : "Saved. Add the end date when you find it.",
  };
}

export async function deleteContractAction(contractId: string): Promise<void> {
  const ctx = await household();
  if (!ctx || !UUID.test(contractId)) return;
  const supabase = await createClient();
  const { error } = await supabase
    .from("utility_contracts")
    .delete()
    .eq("id", contractId);
  if (error) throw new Error("Couldn't delete the contract.");
  await audit(
    ctx,
    "utilities.contract.deleted",
    "utility_contract",
    contractId,
  );
  revalidatePath(BASE);
  redirect(BASE);
}

// Usage ----------------------------------------------------------------------------------------

export async function addUsageAction(
  contractId: string,
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const ctx = await household();
  if (!ctx) return NO_HOUSEHOLD;
  const input = formInput(formData);
  const parsed = parseUsage(input);
  if (!parsed.ok) return { error: parsed.error, values: input };
  if (!(await loadContract(contractId))) {
    return { error: "This contract no longer exists." };
  }
  const supabase = await createClient();
  const existing = await supabase
    .from("utility_usage")
    .select("period_start, period_end")
    .eq("contract_id", contractId);
  if (existing.error) return { error: "Couldn't check existing bills." };
  if (overlapsExisting(parsed.value, existing.data)) {
    return {
      error:
        "This period overlaps a bill you've already entered. Delete that one first, or check the dates.",
      values: input,
    };
  }
  const { error } = await supabase.from("utility_usage").insert({
    ...parsed.value,
    household_id: ctx.householdId,
    contract_id: contractId,
    source: "manual",
  });
  if (error)
    return { error: "Couldn't save the usage. Try again.", values: input };
  revalidatePath(`${BASE}/${contractId}`);
  return { notice: "Usage added. The comparison has been recalculated." };
}

export async function deleteUsageAction(
  contractId: string,
  usageId: string,
): Promise<void> {
  const ctx = await household();
  if (!ctx || !UUID.test(usageId)) return;
  const supabase = await createClient();
  await supabase.from("utility_usage").delete().eq("id", usageId);
  revalidatePath(`${BASE}/${contractId}`);
}

// Offers ---------------------------------------------------------------------------------------

export async function saveOfferAction(
  contractId: string,
  offerId: string | null,
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const ctx = await household();
  if (!ctx) return NO_HOUSEHOLD;
  const contract = await loadContract(contractId);
  if (!contract) return { error: "This contract no longer exists." };
  const input = formInput(formData);
  const parsed = parseOffer(
    input,
    asUtilityType(contract.utility_type),
    dublinDate(new Date()),
  );
  if (!parsed.ok) return { error: parsed.error, values: input };
  const supabase = await createClient();
  if (parsed.value.is_current_renewal) {
    // One renewal price per contract: this one replaces any other.
    let clear = supabase
      .from("tariff_offers")
      .update({ is_current_renewal: false })
      .eq("contract_id", contractId)
      .eq("is_current_renewal", true);
    if (offerId) clear = clear.neq("id", offerId);
    const cleared = await clear;
    if (cleared.error) return { error: "Couldn't save the offer. Try again." };
  }
  const result =
    offerId && UUID.test(offerId)
      ? await supabase
          .from("tariff_offers")
          .update(parsed.value)
          .eq("id", offerId)
          .eq("contract_id", contractId)
      : await supabase.from("tariff_offers").insert({
          ...parsed.value,
          household_id: ctx.householdId,
          contract_id: contractId,
        });
  if (result.error) {
    return { error: "Couldn't save the offer. Try again.", values: input };
  }
  revalidatePath(`${BASE}/${contractId}`);
  if (offerId) redirect(`${BASE}/${contractId}#offers`);
  return { notice: `${parsed.value.supplier} added to the comparison.` };
}

export async function deleteOfferAction(
  contractId: string,
  offerId: string,
): Promise<void> {
  const ctx = await household();
  if (!ctx || !UUID.test(offerId)) return;
  const supabase = await createClient();
  await supabase.from("tariff_offers").delete().eq("id", offerId);
  revalidatePath(`${BASE}/${contractId}`);
}

/** Records the household's decision on an offer. Caddy never acts on it. */
export async function setDecisionAction(
  contractId: string,
  offerId: string,
  formData: FormData,
): Promise<void> {
  const ctx = await household();
  if (!ctx || !UUID.test(offerId)) return;
  const raw = String(formData.get("decision") ?? "");
  const decision = (DECISIONS as readonly string[]).includes(raw) ? raw : null;
  const supabase = await createClient();
  const { error } = await supabase
    .from("tariff_offers")
    .update({ decision })
    .eq("id", offerId);
  if (error) throw new Error("Couldn't save the decision.");
  await audit(
    ctx,
    `utilities.offer.${decision ?? "cleared"}`,
    "tariff_offer",
    offerId,
  );
  revalidatePath(`${BASE}/${contractId}`);
}

/** Saves today's comparison table as a snapshot, to check against later bills. */
export async function saveComparisonAction(
  contractId: string,
  switchDate: string | null,
): Promise<void> {
  const ctx = await household();
  if (!ctx) return;
  const contract = await loadContract(contractId);
  if (!contract) return;
  const supabase = await createClient();
  const [usage, offers, prefs] = await Promise.all([
    supabase.from("utility_usage").select("*").eq("contract_id", contractId),
    supabase.from("tariff_offers").select("*").eq("contract_id", contractId),
    supabase
      .from("utility_preferences")
      .select("excluded_suppliers")
      .maybeSingle(),
  ]);
  if (usage.error || offers.error || prefs.error) {
    throw new Error("Couldn't load the comparison.");
  }
  const validSwitch =
    switchDate && /^\d{4}-\d{2}-\d{2}$/.test(switchDate) ? switchDate : null;
  const comparison = contractComparison(
    contract,
    usage.data,
    offers.data,
    excludedSuppliers(prefs.data),
    validSwitch,
  );
  const snapshot = comparisonSnapshot(comparison);
  const { error } = await supabase.from("utility_comparisons").insert({
    household_id: ctx.householdId,
    contract_id: contractId,
    trigger: "manual",
    contract_end: contract.contract_end,
    usage_basis: asJson(snapshot.usageBasis),
    results: asJson(snapshot.results),
    created_by: ctx.userId,
  });
  if (error) throw new Error("Couldn't save the comparison.");
  revalidatePath(`${BASE}/${contractId}`);
}

// Supplier exclusions --------------------------------------------------------------------------

async function saveExclusions(
  householdId: string,
  update: (current: string[]) => string[],
): Promise<string | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("utility_preferences")
    .select("excluded_suppliers")
    .maybeSingle();
  if (error) return "Couldn't load your preferences.";
  const next = update(
    data ? data.excluded_suppliers : [...DEFAULT_EXCLUDED_SUPPLIERS],
  );
  if (next.length > 30) return "That's a lot of exclusions. Remove some first.";
  const saved = data
    ? await supabase
        .from("utility_preferences")
        .update({ excluded_suppliers: next })
        .eq("household_id", householdId)
    : await supabase
        .from("utility_preferences")
        .insert({ household_id: householdId, excluded_suppliers: next });
  return saved.error ? "Couldn't save your preferences. Try again." : null;
}

export async function addExclusionAction(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const ctx = await household();
  if (!ctx) return NO_HOUSEHOLD;
  const parsed = parseSupplierName(formInput(formData));
  if (!parsed.ok) return { error: parsed.error };
  const name = parsed.value;
  const error = await saveExclusions(ctx.householdId, (current) =>
    current.some((s) => s.toLowerCase() === name.toLowerCase())
      ? current
      : [...current, name],
  );
  if (error) return { error };
  revalidatePath(BASE, "layout");
  return { notice: `${name} won't be ranked or recommended.` };
}

export async function removeExclusionAction(name: string): Promise<void> {
  const ctx = await household();
  if (!ctx) return;
  const error = await saveExclusions(ctx.householdId, (current) =>
    current.filter((s) => s !== name),
  );
  if (error) throw new Error(error);
  revalidatePath(BASE, "layout");
}
