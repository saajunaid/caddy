// Daily job: finds uploads that stopped half-way (the browser closed while reading a bill) and
// either hands them to the review queue or removes the empty record. Never touches reviewed fields.
// Runs in GitHub Actions: relative imports with .ts, no Next.js APIs.
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "../../../../lib/supabase/database.types.ts";
import { dublinDate } from "../../../../server/domain/dates.ts";
import type { JobDefinition } from "../../../../server/jobs/registry.ts";
import { notify } from "../../../../server/notifications/notify.ts";
import { readyToReviewNotification } from "../notifications.ts";
import { ENGINE_VERSION } from "../server/parsers/index.ts";
import { DOCUMENTS_BUCKET } from "../storage.ts";

type Admin = SupabaseClient<Database>;

/** Signed upload links last two hours; anything still "processing" after that has stopped. */
export const STUCK_AFTER_MS = 2 * 60 * 60 * 1000;

export type StuckDecision = "wait" | "release" | "remove";

/** Release to review if the file arrived; remove the record if it never did. Pure. */
export function decideStuck(
  createdAt: Date,
  now: Date,
  hasFile: boolean,
): StuckDecision {
  if (now.getTime() - createdAt.getTime() < STUCK_AFTER_MS) return "wait";
  return hasFile ? "release" : "remove";
}

async function fileExists(admin: Admin, storagePath: string): Promise<boolean> {
  const folder = storagePath.slice(0, storagePath.lastIndexOf("/"));
  const name = storagePath.slice(storagePath.lastIndexOf("/") + 1);
  const { data, error } = await admin.storage
    .from(DOCUMENTS_BUCKET)
    .list(folder, { limit: 10, search: name });
  if (error) throw new Error(`storage list failed: ${error.message}`);
  return data.some((object) => object.name === name);
}

export const documentsSweepJob: JobDefinition = {
  type: "documents-sweep",
  group: "daily",
  description: "Hands half-finished uploads to the review queue",
  idempotencyKey: (now) => `documents-sweep:${dublinDate(now)}`,
  async run(ctx, admin) {
    const cutoff = new Date(ctx.now.getTime() - STUCK_AFTER_MS).toISOString();
    const { data: stuck, error } = await admin
      .from("documents")
      .select(
        "id, household_id, storage_path, original_filename, supplier, document_type, period_start, period_end, document_date, created_at",
      )
      .eq("review_status", "processing")
      .lt("created_at", cutoff)
      .limit(100);
    if (error) {
      await ctx.recordSource({
        source: "documents",
        status: "failed",
        error: error.message,
      });
      return;
    }
    await ctx.recordSource({
      source: "documents",
      status: "ok",
      itemsSeen: stuck.length,
    });

    let released = 0;
    let removed = 0;
    const storageErrors: string[] = [];
    for (const doc of stuck) {
      let hasFile: boolean;
      try {
        hasFile = await fileExists(admin, doc.storage_path);
      } catch (e) {
        storageErrors.push((e as Error).message);
        continue;
      }
      const decision = decideStuck(new Date(doc.created_at), ctx.now, hasFile);
      if (decision === "release") {
        const { data: updated, error: updateError } = await admin
          .from("documents")
          .update({ review_status: "needs_review" })
          .eq("id", doc.id)
          .eq("review_status", "processing")
          .select("id");
        if (updateError)
          throw new Error(
            `Couldn't release a document: ${updateError.message}`,
          );
        if (!updated?.length) continue;
        await admin.from("document_extractions").insert({
          household_id: doc.household_id,
          document_id: doc.id,
          extractor: "rules:none",
          extractor_version: ENGINE_VERSION,
          text_source: "none",
          warnings: ["not-read"],
        });
        await notify(admin, [
          readyToReviewNotification(
            {
              id: doc.id,
              householdId: doc.household_id,
              supplier: doc.supplier,
              documentType: doc.document_type,
              periodStart: doc.period_start,
              periodEnd: doc.period_end,
              documentDate: doc.document_date,
              originalFilename: doc.original_filename,
            },
            ctx.runId,
          ),
        ]);
        released += 1;
      } else if (decision === "remove") {
        const { error: deleteError } = await admin
          .from("documents")
          .delete()
          .eq("id", doc.id)
          .eq("review_status", "processing");
        if (deleteError)
          throw new Error(
            `Couldn't remove an empty upload: ${deleteError.message}`,
          );
        removed += 1;
      }
    }

    if (stuck.length > 0) {
      await ctx.recordSource({
        source: "storage",
        status: storageErrors.length ? "failed" : "ok",
        itemsSeen: stuck.length - storageErrors.length,
        error: storageErrors[0],
      });
    }
    ctx.setStats({ stuck: stuck.length, released, removed });
    ctx.setSummary(
      stuck.length === 0
        ? "No unfinished uploads"
        : `${released} sent to review, ${removed} empty removed`,
    );
  },
};
