// Daily "utilities-due" job: the 14-day comparison reminder, ended-contract and unknown-end prompts,
// plus a comparison snapshot when offers exist. Runs in GitHub Actions: relative .ts imports only.
// It reads contracts, usage and offers but only ever writes notifications and comparison snapshots.
import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  Database,
  Json,
} from "../../../../lib/supabase/database.types.ts";
import { dublinDate } from "../../../../server/domain/dates.ts";
import type { JobContext } from "../../../../server/jobs/runner.ts";
import type { JobDefinition } from "../../../../server/jobs/registry.ts";
import { notify } from "../../../../server/notifications/notify.ts";
import { comparisonSnapshot } from "./compare.ts";
import { dueAlert, dedupeKeys, type DueAlert } from "./due.ts";
import {
  asUtilityType,
  contractComparison,
  excludedSuppliers,
  tableOffers,
  type ContractRow,
} from "./rows.ts";

type Admin = SupabaseClient<Database>;

/** Snapshots hold only strings, numbers, booleans, nulls, arrays and plain objects. */
export function asJson(value: object): { [key: string]: Json | undefined } {
  return value as { [key: string]: Json | undefined };
}

export const UTILITIES_DUE_JOB = "utilities-due";

export function summarise(counts: {
  contracts: number;
  due: number;
  ended: number;
  unknownEnd: number;
}): string {
  const parts = [
    `${counts.contracts} contract${counts.contracts === 1 ? "" : "s"} checked`,
    `${counts.due} comparison${counts.due === 1 ? "" : "s"} due`,
  ];
  if (counts.ended > 0) parts.push(`${counts.ended} ended, needs review`);
  if (counts.unknownEnd > 0) {
    parts.push(`${counts.unknownEnd} without an end date`);
  }
  return parts.join(" · ");
}

export async function runUtilitiesDue(
  ctx: Pick<
    JobContext,
    "now" | "runId" | "recordSource" | "setSummary" | "setStats"
  >,
  admin: Admin,
): Promise<void> {
  const today = dublinDate(ctx.now);
  const contracts = await admin
    .from("utility_contracts")
    .select("*")
    .eq("status", "active");
  if (contracts.error) {
    await ctx.recordSource({
      source: "utility_contracts",
      status: "failed",
      error: contracts.error.message,
    });
    throw new Error(
      `Couldn't load utility contracts: ${contracts.error.message}`,
    );
  }
  const rows: ContractRow[] = contracts.data;
  await ctx.recordSource({
    source: "utility_contracts",
    status: "ok",
    itemsSeen: rows.length,
  });

  const alerts: DueAlert[] = [];
  for (const contract of rows) {
    const alert = dueAlert(
      {
        id: contract.id,
        householdId: contract.household_id,
        utilityType: asUtilityType(contract.utility_type),
        supplier: contract.supplier,
        contractEnd: contract.contract_end,
        status: contract.status,
      },
      today,
    );
    if (alert) alerts.push(alert);
  }
  const created = await notify(
    admin,
    alerts.map((a) => ({
      householdId: a.householdId,
      kind: a.kind,
      severity: a.severity,
      title: a.title,
      body: a.body,
      actionUrl: a.actionUrl,
      dedupeKey: a.dedupeKey,
      jobRunId: ctx.runId,
      push: a.push,
    })),
  );

  // Snapshot the comparison for contracts in their 14-day window that have offers.
  const dueContracts = rows.filter((c) =>
    alerts.some(
      (a) => a.contractId === c.id && (a.state === "due" || a.state === "late"),
    ),
  );
  let snapshots = 0;
  if (dueContracts.length > 0) {
    const ids = dueContracts.map((c) => c.id);
    const households = [...new Set(dueContracts.map((c) => c.household_id))];
    const [offers, usage, prefs] = await Promise.all([
      admin.from("tariff_offers").select("*").in("contract_id", ids),
      admin.from("utility_usage").select("*").in("contract_id", ids),
      admin
        .from("utility_preferences")
        .select("household_id, excluded_suppliers")
        .in("household_id", households),
    ]);
    if (offers.error || usage.error || prefs.error) {
      const message = (offers.error ?? usage.error ?? prefs.error)?.message;
      await ctx.recordSource({
        source: "utility_offers_and_usage",
        status: "failed",
        error: message,
      });
      throw new Error(`Couldn't load offers or usage: ${message}`);
    }
    const offerRows = offers.data;
    const usageRows = usage.data;
    const prefRows = prefs.data;
    await ctx.recordSource({
      source: "utility_offers_and_usage",
      status: "ok",
      itemsSeen: offerRows.length,
    });
    const inserts = [];
    for (const contract of dueContracts) {
      if (!contract.contract_end) continue;
      if (tableOffers(contract, offerRows).length === 0) continue;
      const comparison = contractComparison(
        contract,
        usageRows,
        offerRows,
        excludedSuppliers(
          prefRows.find((p) => p.household_id === contract.household_id),
        ),
      );
      const snapshot = comparisonSnapshot(comparison);
      inserts.push({
        household_id: contract.household_id,
        contract_id: contract.id,
        trigger: "due",
        contract_end: contract.contract_end,
        dedupe_key: dedupeKeys.due(contract.id, contract.contract_end),
        usage_basis: asJson(snapshot.usageBasis),
        results: asJson(snapshot.results),
      });
    }
    if (inserts.length > 0) {
      const saved = await admin
        .from("utility_comparisons")
        .upsert(inserts, {
          onConflict: "household_id,dedupe_key",
          ignoreDuplicates: true,
        })
        .select("id");
      if (saved.error) {
        throw new Error(`Couldn't save comparisons: ${saved.error.message}`);
      }
      snapshots = saved.data?.length ?? 0;
    }
  }

  const count = (state: DueAlert["state"]) =>
    alerts.filter((a) => a.state === state).length;
  const counts = {
    contracts: rows.length,
    due: count("due") + count("late"),
    ended: count("ended"),
    unknownEnd: count("unknown_end"),
  };
  ctx.setSummary(summarise(counts));
  ctx.setStats({
    ...counts,
    late: count("late"),
    notificationsNew: created,
    snapshots,
  });
}

export const utilitiesDueJob: JobDefinition = {
  type: UTILITIES_DUE_JOB,
  group: "daily",
  description:
    "Utility contracts: compare offers 14 days before each contract ends",
  idempotencyKey: (now) => `${UTILITIES_DUE_JOB}:${dublinDate(now)}`,
  run: (ctx, admin) => runUtilitiesDue(ctx, admin),
};
