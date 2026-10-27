// "daily-digest": one morning push per household summarising what needs them, which checks
// failed and what the Cost Rental check found. Runs after the morning daily jobs (own group).
// Shared with GitHub Actions scripts: relative imports with .ts, no Next.js APIs.
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "../../../lib/supabase/database.types.ts";
import { dublinDate, type IsoDate } from "../../../server/domain/dates.ts";
import { jobLabel } from "../../../server/jobs/labels.ts";
import type { JobDefinition } from "../../../server/jobs/registry.ts";
import type { JobContext } from "../../../server/jobs/runner.ts";
import {
  allHouseholdIds,
  notify,
} from "../../../server/notifications/notify.ts";
import { buildDigest } from "../digest.ts";
import {
  applicationItems,
  contractItems,
  listingItems,
  taskItems,
  tripItems,
  type TodayItem,
} from "../needs-you.ts";

type Admin = SupabaseClient<Database>;

export const DAILY_DIGEST_JOB = "daily-digest";

function check<T>(
  result: { data: T | null; error: { message: string } | null },
  what: string,
): T {
  if (result.error)
    throw new Error(`Couldn't read ${what}: ${result.error.message}`);
  return result.data as T;
}

/** What needs one household today, from the same rules as the Today screen. */
async function householdItems(
  admin: Admin,
  householdId: string,
  today: IsoDate,
): Promise<TodayItem[]> {
  const [tasks, contracts, trips, listings, applications] = await Promise.all([
    admin
      .from("tasks")
      .select("id, title, due_on")
      .eq("household_id", householdId)
      .eq("status", "open")
      .not("due_on", "is", null)
      .limit(500),
    admin
      .from("utility_contracts")
      .select("id, supplier, utility_type, contract_end, status")
      .eq("household_id", householdId)
      .limit(100),
    admin
      .from("trips")
      .select("id, name, date_from, date_to, status")
      .eq("household_id", householdId)
      .in("status", ["planning", "booked"])
      .gte("date_to", today)
      .limit(100),
    admin
      .from("housing_listings")
      .select("id, title, status, matches, closing_date, first_seen_at")
      .in("status", ["open", "closing_soon", "coming_soon"])
      .neq("matches", "none")
      .limit(200),
    admin
      .from("housing_applications")
      .select(
        "listing_id, status, next_action, next_action_due, housing_listings(title)",
      )
      .eq("household_id", householdId)
      .limit(200),
  ]);
  const taskRows = check(tasks, "tasks");
  const contractRows = check(contracts, "utility contracts");
  const tripRows = check(trips, "trips");
  const listingRows = check(listings, "housing listings");
  const applicationRows = check(applications, "housing applications");

  const applied = new Set(
    applicationRows
      .filter((a) => a.status !== "not_applied")
      .map((a) => a.listing_id),
  );
  const active = new Set([
    "not_applied",
    "applied",
    "lottery_entered",
    "offered",
  ]);
  return [
    ...taskItems(
      taskRows.map((t) => ({ id: t.id, title: t.title, dueOn: t.due_on })),
      today,
    ),
    ...contractItems(
      contractRows.map((c) => ({
        id: c.id,
        supplier: c.supplier,
        utilityType: c.utility_type,
        contractEnd: c.contract_end,
        status: c.status,
      })),
      today,
    ),
    ...tripItems(
      tripRows.map((t) => ({
        id: t.id,
        name: t.name,
        dateFrom: t.date_from,
        dateTo: t.date_to,
        status: t.status,
      })),
      today,
    ),
    ...listingItems(
      listingRows.map((l) => ({
        id: l.id,
        title: l.title,
        status: l.status,
        matches: l.matches,
        closingDate: l.closing_date,
        firstSeenOn: dublinDate(new Date(l.first_seen_at)),
        applied: applied.has(l.id),
      })),
      today,
    ),
    ...applicationItems(
      applicationRows
        .filter((a) => active.has(a.status))
        .map((a) => ({
          listingId: a.listing_id,
          listingTitle: a.housing_listings?.title ?? "this home",
          nextAction: a.next_action,
          nextActionDue: a.next_action_due,
        })),
      today,
    ),
  ];
}

type RunRow = {
  job_type: string;
  status: string;
  summary: string | null;
  household_id: string | null;
  started_at: string;
};

/** The latest run of each job today (Dublin), for one household plus system-wide runs. */
export function todaysChecks(
  runs: readonly RunRow[],
  householdId: string,
  today: IsoDate,
): { failed: string[]; housingSummary: string | null } {
  const latest = new Map<string, RunRow>();
  for (const run of runs) {
    if (run.job_type === DAILY_DIGEST_JOB) continue;
    if (run.household_id !== null && run.household_id !== householdId) continue;
    if (dublinDate(new Date(run.started_at)) !== today) continue;
    if (run.status === "skipped" || run.status === "running") continue;
    const seen = latest.get(run.job_type);
    if (!seen || run.started_at > seen.started_at)
      latest.set(run.job_type, run);
  }
  const failed = [...latest.values()]
    .filter((r) => r.status === "failed" || r.status === "partial")
    .map((r) => jobLabel(r.job_type))
    .sort();
  const housing = latest.get("housing-daily");
  return {
    failed,
    housingSummary:
      housing && housing.status !== "failed" ? housing.summary : null,
  };
}

export const dailyDigestJob: JobDefinition = {
  type: DAILY_DIGEST_JOB,
  group: "digest",
  description:
    "Morning summary notification: what needs you and how the checks went",
  idempotencyKey: (now) => `${DAILY_DIGEST_JOB}:${dublinDate(now)}`,
  async run(ctx: JobContext, admin: Admin) {
    const today = dublinDate(ctx.now);
    const since = new Date(
      ctx.now.getTime() - 26 * 60 * 60 * 1000,
    ).toISOString();
    const runs = check(
      await admin
        .from("job_runs")
        .select("job_type, status, summary, household_id, started_at")
        .gte("started_at", since)
        .limit(500),
      "background checks",
    );
    const households = await allHouseholdIds(admin);
    let sent = 0;
    for (const householdId of households) {
      try {
        const items = await householdItems(admin, householdId, today);
        const checks = todaysChecks(runs, householdId, today);
        const digest = buildDigest({
          items,
          failedChecks: checks.failed,
          housingSummary: checks.housingSummary,
        });
        sent += await notify(admin, [
          {
            householdId,
            kind: "digest",
            severity: digest.severity,
            title: digest.title,
            body: digest.body,
            actionUrl: "/",
            dedupeKey: `${DAILY_DIGEST_JOB}:${today}`,
            jobRunId: ctx.runId,
          },
        ]);
        await ctx.recordSource({
          source: "household summary",
          status: "ok",
          itemsSeen: items.length,
        });
      } catch (error) {
        await ctx.recordSource({
          source: "household summary",
          status: "failed",
          error: (error as Error).message,
        });
      }
    }
    ctx.setSummary(
      households.length === 0
        ? "No households yet"
        : `${sent} summar${sent === 1 ? "y" : "ies"} sent`,
    );
  },
};
