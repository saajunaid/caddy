// Stores a validated research result: upsert by URL, a job_runs row of type "housing-news",
// and alerts for officially confirmed or Limerick items. Shared by the ingest route.
import type { SupabaseClient } from "@supabase/supabase-js";
import { createHash } from "node:crypto";
import type { Database } from "../../../lib/supabase/database.types.ts";
import { runJob, type RunJobResult } from "../../../server/jobs/runner.ts";
import {
  allHouseholdIds,
  notify,
} from "../../../server/notifications/notify.ts";
import {
  isAlertWorthy,
  researchItemHash,
  type ResearchResult,
} from "./research.ts";

export const NEWS_JOB_TYPE = "housing-news";

export type IngestOutcome = RunJobResult & {
  received: number;
  inserted: number;
  updated: number;
  notified: number;
};

export async function ingestResearch(
  admin: SupabaseClient<Database>,
  result: ResearchResult,
  now = new Date(),
): Promise<IngestOutcome> {
  const counts = { inserted: 0, updated: 0, notified: 0 };
  // One run per agent run: re-posting the same result is a no-op.
  const run = await runJob(
    admin,
    {
      jobType: NEWS_JOB_TYPE,
      idempotencyKey: `${NEWS_JOB_TYPE}:${result.agent}:${result.run_started_at}`,
      trigger: "event",
      now,
    },
    async (ctx) => {
      // The same URL may appear twice in one payload; the last one wins.
      const byUrl = new Map(result.items.map((item) => [item.url, item]));
      const items = [...byUrl.values()];
      const existing = new Map<string, string>();
      if (items.length > 0) {
        const { data, error } = await admin
          .from("research_items")
          .select("url, content_hash")
          .in(
            "url",
            items.map((i) => i.url),
          );
        if (error)
          throw new Error(`Couldn't read housing news: ${error.message}`);
        for (const row of data) existing.set(row.url, row.content_hash);
      }

      const rows = items.map((item) => ({
        topic: "housing",
        title: item.title,
        url: item.url,
        source_name: item.source_name,
        source_type: item.source_type,
        published_on: item.published_on,
        retrieved_at: result.run_started_at,
        summary: item.summary,
        locality: item.locality,
        provider: item.provider,
        cost_rental_confirmed: item.cost_rental_confirmed,
        verification: item.verification,
        agent: result.agent,
        content_hash: researchItemHash(item),
      }));
      const changed = rows.filter(
        (row) => existing.get(row.url) !== row.content_hash,
      );
      if (changed.length > 0) {
        const { error } = await admin
          .from("research_items")
          .upsert(changed, { onConflict: "url" });
        if (error)
          throw new Error(`Couldn't save housing news: ${error.message}`);
      }
      counts.inserted = changed.filter((row) => !existing.has(row.url)).length;
      counts.updated = changed.length - counts.inserted;

      const worthy = items.filter(isAlertWorthy);
      if (worthy.length > 0) {
        const households = await allHouseholdIds(admin);
        counts.notified = await notify(
          admin,
          households.flatMap((householdId) =>
            worthy.map((item) => ({
              householdId,
              kind: "housing.news",
              severity: "info" as const,
              title: `Housing news: ${item.title}`.slice(0, 160),
              body: [
                item.source_name,
                item.verification === "officially_confirmed"
                  ? "officially confirmed"
                  : item.verification.replace("_", " "),
              ].join(" · "),
              actionUrl: "/housing#news",
              dedupeKey: `research:${createHash("sha256").update(item.url).digest("hex").slice(0, 32)}`,
              jobRunId: ctx.runId,
            })),
          ),
        );
      }

      await ctx.recordSource({
        source: `research agent: ${result.agent}`,
        status: "ok",
        itemsSeen: items.length,
      });
      ctx.setSummary(
        `${items.length} item${items.length === 1 ? "" : "s"} from ${result.agent} · ${counts.inserted} new`,
      );
      ctx.setStats({ received: items.length, ...counts });
    },
  );
  return { ...run, received: result.items.length, ...counts };
}
