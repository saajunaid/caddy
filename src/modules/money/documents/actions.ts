"use server";

// Server actions for bills and receipts. Every action re-checks the signed-in adult's household and
// talks to the database as that user (row-level security). The secret-key client is used only for
// the job ledger and notifications, after the household check. Document text is never logged or stored.

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import type { Json } from "@/lib/supabase/database.types";
import { requireHousehold } from "@/server/auth";
import { dublinDate } from "@/server/domain/dates";
import { runJob, type JobContext } from "@/server/jobs/runner";
import { notify } from "@/server/notifications/notify";
import { flushPendingPushes, vapidFromEnv } from "@/server/notifications/push";
import {
  FIELD_KEYS,
  isFieldKey,
  type FieldKey,
  type FieldValue,
} from "./fields";
import { readyToReviewNotification } from "./notifications";
import {
  applyProposals,
  crossFieldErrors,
  fromDocumentRow,
  parseFieldInput,
  toDocumentUpdate,
  type FieldValues,
} from "./review";
import {
  reviewPayloadSchema,
  type ReviewPayload,
  type ReviewState,
} from "./review-payload";
import { countFoundFields, parseDocumentText } from "./server/parsers/index";
import {
  DOCUMENTS_BUCKET,
  MAX_DOCUMENT_BYTES,
  MAX_EXTRACTED_TEXT_CHARS,
  resolveMimeType,
  storagePathFor,
} from "./storage";
import { percentToBasisPoints } from "../tax/domain/wfh";

const NO_HOUSEHOLD = "Your account isn't part of a household yet.";

// Upload: step 1 ------------------------------------------------------------------------------------

const startSchema = z.object({
  fileName: z.string().min(1).max(255),
  mimeType: z.string().max(100),
  sizeBytes: z.number().int().min(1).max(MAX_DOCUMENT_BYTES),
  sha256: z.string().regex(/^[0-9a-f]{64}$/),
});

export type StartUploadResult =
  | { ok: true; documentId: string; storagePath: string; mimeType: string }
  | { ok: false; error: string; duplicateId?: string };

/** Checks for a duplicate and reserves a document record; the browser then uploads the file. */
export async function startUploadAction(
  input: z.infer<typeof startSchema>,
): Promise<StartUploadResult> {
  const { user, profile } = await requireHousehold();
  if (!profile) return { ok: false, error: NO_HOUSEHOLD };
  const parsed = startSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: "That file can't be added (max 20 MB)." };
  }
  const mimeType = resolveMimeType(parsed.data.fileName, parsed.data.mimeType);
  if (!mimeType) {
    return {
      ok: false,
      error: "Choose a PDF or a photo (JPEG, PNG, HEIC or WebP).",
    };
  }

  const supabase = await createClient();
  const existing = await supabase
    .from("documents")
    .select("id")
    .eq("sha256", parsed.data.sha256)
    .maybeSingle();
  if (existing.error)
    return { ok: false, error: "Couldn't check for duplicates. Try again." };
  if (existing.data) {
    return {
      ok: false,
      error: "You've already added this file.",
      duplicateId: existing.data.id,
    };
  }

  const documentId = randomUUID();
  const storagePath = storagePathFor(
    profile.householdId,
    documentId,
    parsed.data.fileName,
  );
  const { error } = await supabase.from("documents").insert({
    id: documentId,
    household_id: profile.householdId,
    storage_path: storagePath,
    original_filename: parsed.data.fileName,
    mime_type: mimeType,
    size_bytes: parsed.data.sizeBytes,
    sha256: parsed.data.sha256,
    review_status: "processing",
    uploaded_by: user.id,
  });
  if (error) {
    if (error.code === "23505") {
      const again = await supabase
        .from("documents")
        .select("id")
        .eq("sha256", parsed.data.sha256)
        .maybeSingle();
      return {
        ok: false,
        error: "You've already added this file.",
        duplicateId: again.data?.id,
      };
    }
    return { ok: false, error: "Couldn't start the upload. Try again." };
  }
  revalidatePath("/money");
  return { ok: true, documentId, storagePath, mimeType };
}

/** Removes a reservation whose upload failed or was cancelled. */
export async function cancelUploadAction(documentId: string): Promise<void> {
  const { user, profile } = await requireHousehold();
  if (!profile || !z.uuid().safeParse(documentId).success) return;
  const supabase = await createClient();
  const { data } = await supabase
    .from("documents")
    .select("storage_path")
    .eq("id", documentId)
    .eq("review_status", "processing")
    .eq("uploaded_by", user.id)
    .maybeSingle();
  if (!data) return;
  await supabase.storage.from(DOCUMENTS_BUCKET).remove([data.storage_path]);
  await supabase.from("documents").delete().eq("id", documentId);
  revalidatePath("/money");
}

// Upload: step 2 ------------------------------------------------------------------------------------

const finishSchema = z.object({
  documentId: z.uuid(),
  text: z.string().max(MAX_EXTRACTED_TEXT_CHARS),
  textSource: z.enum(["text-layer", "ocr", "none"]),
});

export type FinishUploadResult =
  | { ok: true; documentId: string; found: number }
  | { ok: false; error: string };

/**
 * Runs the deterministic parsers on text the browser extracted, stores the proposed fields and
 * marks the document ready for review. Records a "bill-reader" job run and alerts the household.
 */
export async function finishUploadAction(
  input: z.infer<typeof finishSchema>,
): Promise<FinishUploadResult> {
  const { user, profile } = await requireHousehold();
  if (!profile) return { ok: false, error: NO_HOUSEHOLD };
  const parsed = finishSchema.safeParse(input);
  if (!parsed.success)
    return { ok: false, error: "That document couldn't be read." };
  const { documentId, textSource } = parsed.data;
  const text = textSource === "none" ? "" : parsed.data.text;

  const supabase = await createClient();
  const { data: doc, error } = await supabase
    .from("documents")
    .select("*")
    .eq("id", documentId)
    .maybeSingle();
  if (error || !doc)
    return { ok: false, error: "That document no longer exists." };
  if (doc.review_status !== "processing") {
    return { ok: true, documentId, found: 0 };
  }

  // The file must have arrived in storage before the record moves on.
  const folder = doc.storage_path.slice(0, doc.storage_path.lastIndexOf("/"));
  const fileName = doc.storage_path.slice(
    doc.storage_path.lastIndexOf("/") + 1,
  );
  const listed = await supabase.storage
    .from(DOCUMENTS_BUCKET)
    .list(folder, { limit: 10 });
  if (listed.error || !listed.data.some((o) => o.name === fileName)) {
    return { ok: false, error: "The file didn't finish uploading. Try again." };
  }

  const result = parseDocumentText(text);
  const found =
    countFoundFields(result.fields) - (result.fields.document_type ? 1 : 0);
  const values = applyProposals(
    fromDocumentRow(doc),
    doc.confirmed_fields,
    result.fields,
  );
  const { columns, details } = toDocumentUpdate(values);

  const proposed: Record<string, Json> = {};
  const confidence: Record<string, Json> = {};
  const snippets: Record<string, Json> = {};
  const candidates: Record<string, Json> = {};
  for (const [key, field] of Object.entries(result.fields)) {
    if (!field) continue;
    proposed[key] = field.value;
    confidence[key] = field.confidence;
    if (field.snippet) snippets[key] = field.snippet;
    if (field.candidates?.length) candidates[key] = field.candidates;
  }

  const outcome: { failure: string | null } = { failure: null };
  const work = async (ctx: JobContext | null) => {
    const extraction = await supabase.from("document_extractions").insert({
      household_id: profile.householdId,
      document_id: documentId,
      extractor: result.extractor,
      extractor_version: result.extractorVersion,
      text_source: textSource,
      text_chars: text.length,
      proposed,
      confidence,
      snippets,
      candidates,
      warnings: result.warnings,
      created_by: user.id,
    });
    if (extraction.error) {
      outcome.failure = "Couldn't save what Caddy read. Try again.";
      throw new Error(`extraction insert failed: ${extraction.error.code}`);
    }
    const update = await supabase
      .from("documents")
      .update({ ...columns, details, review_status: "needs_review" })
      .eq("id", documentId)
      .eq("review_status", "processing");
    if (update.error) {
      outcome.failure = "Couldn't save what Caddy read. Try again.";
      throw new Error(`document update failed: ${update.error.code}`);
    }
    if (!ctx) return;
    await ctx.recordSource({
      source: `text:${textSource}`,
      status: text.trim().length > 0 ? "ok" : "failed",
      itemsSeen: text.length,
      error:
        text.trim().length > 0 ? undefined : "No readable text in the file",
    });
    await ctx.recordSource({
      source: result.extractor,
      status: found > 0 ? "ok" : "failed",
      itemsSeen: found,
      error: found > 0 ? undefined : "No fields recognised; enter them by hand",
    });
    ctx.setStats({ fields: found, warnings: result.warnings.length });
    ctx.setSummary(
      found > 0
        ? `Read ${found} field${found === 1 ? "" : "s"} (${result.extractor})`
        : "Nothing recognised; waiting for manual entry",
    );
    await notify(ctx.admin, [
      readyToReviewNotification(
        {
          id: documentId,
          householdId: profile.householdId,
          supplier: columns.supplier,
          documentType: columns.document_type,
          periodStart: columns.period_start,
          periodEnd: columns.period_end,
          documentDate: columns.document_date,
          originalFilename: doc.original_filename,
        },
        ctx.runId,
      ),
    ]);
  };

  let admin: ReturnType<typeof createAdminClient> | null = null;
  try {
    admin = createAdminClient();
  } catch {
    admin = null; // No secret key (local development): save without the ledger and alert.
  }
  if (admin) {
    let status: string;
    try {
      const run = await runJob(
        admin,
        {
          jobType: "bill-reader",
          idempotencyKey: `bill-reader:${documentId}`,
          householdId: profile.householdId,
          trigger: "event",
        },
        work,
      );
      status = run.status;
    } catch {
      return { ok: false, error: "Couldn't record the reading. Try again." };
    }
    if (outcome.failure) return { ok: false, error: outcome.failure };
    if (status === "skipped") {
      return { ok: false, error: "This document is already being read." };
    }
    // Deliver the "ready to review" alert to phones now rather than at the next daily job.
    const vapid = vapidFromEnv();
    if (vapid) await flushPendingPushes(admin, vapid).catch(() => undefined);
  } else {
    try {
      await work(null);
    } catch {
      return {
        ok: false,
        error: outcome.failure ?? "Couldn't save what Caddy read.",
      };
    }
  }

  revalidatePath("/money", "layout");
  return { ok: true, documentId, found };
}

// Review ---------------------------------------------------------------------------------------------

type Supabase = Awaited<ReturnType<typeof createClient>>;

async function syncExpense(
  supabase: Supabase,
  householdId: string,
  userId: string,
  documentId: string,
  payload: ReviewPayload["expense"],
  values: FieldValues,
  currency: string,
): Promise<string | null> {
  const existing = await supabase
    .from("expenses")
    .select("id")
    .eq("document_id", documentId)
    .maybeSingle();
  if (existing.error) return "Couldn't load the linked expense.";

  if (!payload.enabled) {
    if (existing.data) {
      await supabase
        .from("document_links")
        .delete()
        .eq("document_id", documentId)
        .eq("entity_type", "expense");
      const removed = await supabase
        .from("expenses")
        .delete()
        .eq("id", existing.data.id);
      if (removed.error) return "Couldn't remove the linked expense.";
    }
    return null;
  }

  const amount = values.total_cents;
  const date = values.document_date ?? values.period_end ?? values.due_date;
  const merchant = values.supplier;
  if (typeof amount !== "number")
    return "Add the total before using this for household spending.";
  if (typeof date !== "string")
    return "Add the bill date before using this for household spending.";
  if (typeof merchant !== "string")
    return "Add the supplier before using this for household spending.";

  const row = {
    household_id: householdId,
    document_id: documentId,
    merchant,
    expense_date: date,
    category: payload.category,
    amount_cents: amount,
    currency,
    payment_status: payload.paymentStatus,
    is_recurring: payload.isRecurring,
    review_status: "confirmed",
  };
  const saved = existing.data
    ? await supabase
        .from("expenses")
        .update(row)
        .eq("id", existing.data.id)
        .select("id")
        .single()
    : await supabase
        .from("expenses")
        .insert({ ...row, created_by: userId })
        .select("id")
        .single();
  if (saved.error) return "Couldn't save the expense.";
  const link = await supabase.from("document_links").upsert(
    {
      household_id: householdId,
      document_id: documentId,
      entity_type: "expense",
      entity_id: saved.data.id,
      purpose: "household_spending",
      created_by: userId,
    },
    { onConflict: "document_id,entity_type,entity_id", ignoreDuplicates: true },
  );
  return link.error ? "Couldn't link the expense." : null;
}

async function syncTaxEvidence(
  supabase: Supabase,
  householdId: string,
  userId: string,
  documentId: string,
  payload: ReviewPayload["tax"],
  values: FieldValues,
): Promise<string | null> {
  const removeAll = async () => {
    await supabase
      .from("tax_evidence_items")
      .delete()
      .eq("document_id", documentId);
    await supabase
      .from("document_links")
      .delete()
      .eq("document_id", documentId)
      .eq("entity_type", "tax_year");
  };
  if (!payload.enabled || payload.members.length === 0) {
    await removeAll();
    return payload.enabled ? "Choose who this bill is evidence for." : null;
  }

  const amountInput = payload.amount.trim();
  let paidCents: number;
  if (amountInput) {
    const parsed = parseFieldInput("total_cents", amountInput);
    if (!parsed.ok || typeof parsed.value !== "number" || parsed.value < 0) {
      return "Enter the amount to count for the tax year, like 212.48.";
    }
    paidCents = parsed.value;
  } else if (
    typeof values.total_cents === "number" &&
    values.total_cents >= 0
  ) {
    paidCents = values.total_cents;
  } else {
    return "Add the total (or the amount to count) before using this as tax evidence.";
  }

  let shareTotal = 0;
  const members: { memberId: string; share: number }[] = [];
  for (const member of payload.members) {
    try {
      const bp = percentToBasisPoints(member.sharePercent.trim() || "100");
      shareTotal += bp;
      members.push({ memberId: member.memberId, share: bp / 100 });
    } catch {
      return "Each share must be above 0% and at most 100%.";
    }
  }
  if (shareTotal > 10000)
    return "Shares of one bill can't add up to more than 100%.";

  // Members must be adults in this household (RLS hides everyone else).
  const known = await supabase
    .from("household_members")
    .select("id")
    .in(
      "id",
      members.map((m) => m.memberId),
    );
  if (known.error || known.data.length !== members.length) {
    return "Choose people from your household.";
  }

  const year = await supabase
    .from("tax_years")
    .upsert(
      { household_id: householdId, jurisdiction: "IE", year: payload.year },
      { onConflict: "household_id,jurisdiction,year" },
    )
    .select("id")
    .single();
  if (year.error) return "Couldn't open that tax year.";

  await removeAll();
  const inserted = await supabase.from("tax_evidence_items").insert(
    members.map((m) => ({
      household_id: householdId,
      tax_year_id: year.data.id,
      document_id: documentId,
      member_id: m.memberId,
      category: payload.category,
      paid_cents: paidCents,
      share_percent: m.share,
      created_by: userId,
    })),
  );
  if (inserted.error) return "Couldn't save the tax evidence.";
  const link = await supabase.from("document_links").insert({
    household_id: householdId,
    document_id: documentId,
    entity_type: "tax_year",
    entity_id: year.data.id,
    purpose: "tax_evidence",
    created_by: userId,
  });
  return link.error ? "Couldn't link the tax year." : null;
}

/** Confirms the reviewed fields and links the document to spending and tax evidence. */
export async function saveReviewAction(
  _prev: ReviewState,
  formData: FormData,
): Promise<ReviewState> {
  const { user, profile } = await requireHousehold();
  if (!profile) return { error: NO_HOUSEHOLD };

  let payload: ReviewPayload;
  try {
    const parsed = reviewPayloadSchema.safeParse(
      JSON.parse(String(formData.get("payload") ?? "")),
    );
    if (!parsed.success)
      return {
        error: "Something in the form isn't valid. Reload and try again.",
      };
    payload = parsed.data;
  } catch {
    return {
      error: "Something in the form isn't valid. Reload and try again.",
    };
  }

  const supabase = await createClient();
  const { data: doc, error } = await supabase
    .from("documents")
    .select("id, currency, review_status")
    .eq("id", payload.documentId)
    .maybeSingle();
  if (error || !doc) return { error: "That document no longer exists." };
  if (doc.review_status === "processing")
    return { error: "Caddy is still reading this document." };

  const values: FieldValues = {};
  const fieldErrors: Record<string, string> = {};
  for (const [key, raw] of Object.entries(payload.fields)) {
    if (!isFieldKey(key)) continue;
    const parsed = parseFieldInput(key, raw);
    if (parsed.ok) values[key] = parsed.value;
    else fieldErrors[key] = parsed.error;
  }
  if (Object.keys(fieldErrors).length > 0) {
    return { error: "Check the highlighted fields.", fieldErrors };
  }
  const crossErrors = crossFieldErrors(values);
  if (crossErrors.length) return { error: crossErrors[0] };

  // Saving confirms every value the user reviewed: they become user-owned.
  const confirmed = FIELD_KEYS.filter(
    (key): key is FieldKey => values[key] !== null && values[key] !== undefined,
  );
  const { columns, details } = toDocumentUpdate(values);
  const updated = await supabase
    .from("documents")
    .update({
      ...columns,
      details: details as Record<string, FieldValue>,
      confirmed_fields: confirmed,
      review_status: "confirmed",
      confirmed_by: user.id,
      confirmed_at: new Date().toISOString(),
    })
    .eq("id", payload.documentId);
  if (updated.error) {
    return {
      error:
        updated.error.code === "23514"
          ? "Some details don't fit together (check the dates)."
          : "Couldn't save the document. Try again.",
    };
  }

  const expenseError = await syncExpense(
    supabase,
    profile.householdId,
    user.id,
    payload.documentId,
    payload.expense,
    values,
    doc.currency,
  );
  if (expenseError) return { error: `Details saved, but: ${expenseError}` };
  const taxError = await syncTaxEvidence(
    supabase,
    profile.householdId,
    user.id,
    payload.documentId,
    payload.tax,
    values,
  );
  if (taxError) return { error: `Details saved, but: ${taxError}` };

  await supabase.from("audit_events").insert({
    household_id: profile.householdId,
    actor_id: user.id,
    action: "document.confirmed",
    entity_type: "document",
    entity_id: payload.documentId,
    metadata: {
      expense: payload.expense.enabled,
      tax_year: payload.tax.enabled ? payload.tax.year : null,
    },
  });
  revalidatePath("/money", "layout");
  redirect(`/money?saved=${payload.documentId}`);
}

/** Deletes a document, its stored original and everything that only existed because of it. */
export async function deleteDocumentAction(formData: FormData): Promise<void> {
  const { user, profile } = await requireHousehold();
  if (!profile) return;
  const documentId = String(formData.get("documentId") ?? "");
  if (!z.uuid().safeParse(documentId).success) return;
  const supabase = await createClient();
  const { data: doc } = await supabase
    .from("documents")
    .select("id, storage_path")
    .eq("id", documentId)
    .maybeSingle();
  if (!doc) redirect("/money");
  await supabase.storage.from(DOCUMENTS_BUCKET).remove([doc.storage_path]);
  await supabase.from("document_links").delete().eq("document_id", documentId);
  await supabase.from("expenses").delete().eq("document_id", documentId);
  const { error } = await supabase
    .from("documents")
    .delete()
    .eq("id", documentId);
  if (error) throw new Error("Couldn't delete the document.");
  await supabase.from("audit_events").insert({
    household_id: profile.householdId,
    actor_id: user.id,
    action: "document.deleted",
    entity_type: "document",
    entity_id: documentId,
    metadata: { on: dublinDate(new Date()) },
  });
  revalidatePath("/money", "layout");
  redirect("/money?deleted=1");
}
