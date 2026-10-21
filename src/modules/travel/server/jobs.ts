// Travel background jobs. Run in GitHub Actions through src/server/jobs/registry.ts.
// Plain Node: relative imports with .ts, no Next.js APIs, no server-only.
// Neither job touches anything the family entered: fx-ecb writes only fx_rates, travel-weekly
// writes only notifications.
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "../../../lib/supabase/database.types.ts";
import { dublinDate } from "../../../server/domain/dates.ts";
import type { JobContext } from "../../../server/jobs/runner.ts";
import type { JobDefinition } from "../../../server/jobs/registry.ts";
import { notify } from "../../../server/notifications/notify.ts";
import {
  ECB_90_DAY_URL,
  ECB_DAILY_URL,
  parseEcbXml,
  type EcbRate,
} from "./ecb.ts";
import { isoWeek, planReminders } from "./reminders.ts";

type Admin = SupabaseClient<Database>;

export const USER_AGENT =
  "Caddy/1.0 (private household app; +https://caddy-beryl.vercel.app)";

/** Fewer stored rates than this means history is missing (first run): backfill 90 days once. */
const BACKFILL_BELOW_ROWS = 200;

type Fetch = typeof fetch;

async function fetchRates(
  ctx: JobContext,
  source: string,
  url: string,
  fetchImpl: Fetch,
): Promise<EcbRate[] | null> {
  let response: Response;
  try {
    response = await fetchImpl(url, {
      headers: { "user-agent": USER_AGENT, accept: "application/xml" },
    });
  } catch (error) {
    await ctx.recordSource({
      source,
      url,
      status: "failed",
      error: `Unreachable: ${(error as Error).message}`,
    });
    return null;
  }
  if (!response.ok) {
    await ctx.recordSource({
      source,
      url,
      status: "failed",
      httpStatus: response.status,
      error: `HTTP ${response.status}`,
    });
    return null;
  }
  const rates = parseEcbXml(await response.text());
  if (rates.length === 0) {
    // A page that loads but yields no rates is a failure, never "no rates today".
    await ctx.recordSource({
      source,
      url,
      status: "failed",
      httpStatus: response.status,
      itemsSeen: 0,
      error: "Parsed zero rates: the file format may have changed",
    });
    return null;
  }
  await ctx.recordSource({
    source,
    url,
    status: "ok",
    httpStatus: response.status,
    itemsSeen: rates.length,
  });
  return rates;
}

/** Insert rates not stored yet. Published ECB rates are final, so existing rows are kept. */
export async function saveRates(
  admin: Admin,
  rates: readonly EcbRate[],
  fetchedAt: Date,
): Promise<number> {
  let inserted = 0;
  for (let i = 0; i < rates.length; i += 500) {
    const batch = rates.slice(i, i + 500).map((r) => ({
      rate_date: r.date,
      currency: r.currency,
      // Sent as the exact decimal string; PostgREST stores it in numeric without a float.
      rate: r.rate as unknown as number,
      source: "ECB",
      fetched_at: fetchedAt.toISOString(),
    }));
    const { data, error } = await admin
      .from("fx_rates")
      .upsert(batch, {
        onConflict: "rate_date,currency",
        ignoreDuplicates: true,
      })
      .select("id");
    if (error)
      throw new Error(`Couldn't save exchange rates: ${error.message}`);
    inserted += data?.length ?? 0;
  }
  return inserted;
}

export async function runFxEcb(
  ctx: JobContext,
  admin: Admin,
  fetchImpl: Fetch = fetch,
): Promise<void> {
  const daily = await fetchRates(
    ctx,
    "ECB daily rates",
    ECB_DAILY_URL,
    fetchImpl,
  );
  const { count, error } = await admin
    .from("fx_rates")
    .select("id", { count: "exact", head: true });
  if (error) throw new Error(`Couldn't read exchange rates: ${error.message}`);
  let history: EcbRate[] | null = null;
  if ((count ?? 0) < BACKFILL_BELOW_ROWS) {
    await new Promise((resolve) => setTimeout(resolve, 1000)); // ~1 request per second
    history = await fetchRates(
      ctx,
      "ECB 90-day history",
      ECB_90_DAY_URL,
      fetchImpl,
    );
  }
  const all = [...(daily ?? []), ...(history ?? [])];
  if (all.length === 0) {
    ctx.setSummary("Couldn't get ECB rates");
    return;
  }
  const inserted = await saveRates(admin, all, ctx.now);
  const latest = all
    .map((r) => r.date)
    .sort()
    .at(-1);
  const currencies = new Set(all.map((r) => r.currency)).size;
  ctx.setStats({ parsed: all.length, inserted, latest: latest ?? null });
  ctx.setSummary(
    `ECB rates for ${latest} (${currencies} currencies, ${inserted} new)`,
  );
}

export async function runTravelWeekly(
  ctx: JobContext,
  admin: Admin,
): Promise<void> {
  const trips = await admin
    .from("trips")
    .select("id, household_id, name, status, date_from, date_to")
    .eq("status", "planning");
  if (trips.error) {
    await ctx.recordSource({
      source: "trips",
      status: "failed",
      error: trips.error.message,
    });
    return;
  }
  const tripIds = trips.data.map((t) => t.id);
  const candidates = tripIds.length
    ? await admin
        .from("trip_candidates")
        .select("id, trip_id, status")
        .in("trip_id", tripIds)
    : { data: [], error: null };
  if (candidates.error)
    throw new Error(`Couldn't read trip options: ${candidates.error.message}`);
  const candidateIds = candidates.data.map((c) => c.id);
  const components = candidateIds.length
    ? await admin
        .from("trip_components")
        .select("candidate_id, checked_at")
        .in("candidate_id", candidateIds)
    : { data: [], error: null };
  if (components.error)
    throw new Error(`Couldn't read trip prices: ${components.error.message}`);
  await ctx.recordSource({
    source: "trips",
    status: "ok",
    itemsSeen: trips.data.length,
  });

  const reminders = planReminders({
    today: dublinDate(ctx.now),
    trips: trips.data.map((t) => ({
      id: t.id,
      householdId: t.household_id,
      name: t.name,
      status: t.status,
      dateFrom: t.date_from,
      dateTo: t.date_to,
    })),
    candidates: candidates.data.map((c) => ({
      id: c.id,
      tripId: c.trip_id,
      status: c.status,
    })),
    components: components.data.map((c) => ({
      candidateId: c.candidate_id,
      checkedAt: c.checked_at,
    })),
  });
  const created = await notify(
    admin,
    reminders.map((r) => ({
      householdId: r.householdId,
      kind: "travel.recheck",
      severity: r.severity,
      title: r.title,
      body: r.body,
      actionUrl: `/travel/${r.tripId}`,
      dedupeKey: r.dedupeKey,
      jobRunId: ctx.runId,
    })),
  );
  ctx.setStats({
    trips: trips.data.length,
    reminders: reminders.length,
    created,
  });
  ctx.setSummary(
    reminders.length === 0
      ? `${trips.data.length} trip${trips.data.length === 1 ? "" : "s"} planned; none need a recheck`
      : `${created} reminder${created === 1 ? "" : "s"} for ${reminders.length} trip${reminders.length === 1 ? "" : "s"}`,
  );
}

export const fxEcbJob: JobDefinition = {
  type: "fx-ecb",
  group: "daily",
  description: "ECB euro reference rates for travel price conversion",
  idempotencyKey: (now) => `fx-ecb:${dublinDate(now)}`,
  run: (ctx, admin) => runFxEcb(ctx, admin),
};

export const travelWeeklyJob: JobDefinition = {
  type: "travel-weekly",
  group: "weekly",
  description: "Weekly reminder to recheck prices for upcoming trips",
  idempotencyKey: (now) => `travel-weekly:${isoWeek(dublinDate(now))}`,
  run: (ctx, admin) => runTravelWeekly(ctx, admin),
};
