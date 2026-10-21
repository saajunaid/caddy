import "server-only";
import { createClient } from "@/lib/supabase/server";
import type {
  ComparisonRecord,
  ContractRow,
  OfferRow,
  UsageRow,
} from "./server/rows";
import { UTILITIES_DUE_JOB } from "./server/job";

export type UtilitiesData = {
  contracts: ContractRow[];
  usage: UsageRow[];
  offers: OfferRow[];
  /** Null when the household hasn't changed the defaults yet. */
  preferences: { excluded_suppliers: string[] } | null;
  lastCheck: {
    status: string;
    summary: string | null;
    error: string | null;
    startedAt: Date;
  } | null;
};

/** Everything the Utilities screens need, read with the signed-in user's row-level security. */
export async function loadUtilities(): Promise<UtilitiesData> {
  const supabase = await createClient();
  const [contracts, usage, offers, preferences, lastRun] = await Promise.all([
    supabase
      .from("utility_contracts")
      .select("*")
      .order("contract_end", { ascending: true, nullsFirst: false })
      .order("created_at"),
    supabase.from("utility_usage").select("*").order("period_start"),
    supabase.from("tariff_offers").select("*").order("created_at"),
    supabase
      .from("utility_preferences")
      .select("excluded_suppliers")
      .maybeSingle(),
    supabase
      .from("job_runs")
      .select("status, summary, error, started_at")
      .eq("job_type", UTILITIES_DUE_JOB)
      .order("started_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);
  const failed =
    contracts.error ?? usage.error ?? offers.error ?? preferences.error;
  if (failed) throw new Error(`Couldn't load utilities: ${failed.message}`);
  return {
    contracts: contracts.data ?? [],
    usage: usage.data ?? [],
    offers: offers.data ?? [],
    preferences: preferences.data,
    lastCheck: lastRun.data
      ? {
          status: lastRun.data.status,
          summary: lastRun.data.summary,
          error: lastRun.data.error,
          startedAt: new Date(lastRun.data.started_at),
        }
      : null,
  };
}

/** Saved comparison snapshots for one contract, newest first. */
export async function loadComparisons(
  contractId: string,
): Promise<ComparisonRecord[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("utility_comparisons")
    .select("*")
    .eq("contract_id", contractId)
    .order("created_at", { ascending: false })
    .limit(10);
  if (error) throw new Error(`Couldn't load comparisons: ${error.message}`);
  return data;
}
