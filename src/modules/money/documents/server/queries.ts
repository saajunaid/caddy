import "server-only";
import { createClient } from "@/lib/supabase/server";
import type { Confidence, FieldKey, FieldValue } from "../fields";
import { isFieldKey } from "../fields";
import { DOCUMENTS_BUCKET, SIGNED_URL_SECONDS } from "../storage";

export type DocumentListItem = {
  id: string;
  supplier: string | null;
  documentType: string | null;
  periodStart: string | null;
  periodEnd: string | null;
  documentDate: string | null;
  totalCents: number | null;
  currency: string;
  reviewStatus: "processing" | "needs_review" | "confirmed";
  originalFilename: string;
  createdAt: string;
};

/** Documents for the Bills tab, newest first (the page puts the review queue on top). */
export async function listDocuments(limit = 100): Promise<DocumentListItem[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("documents")
    .select(
      "id, supplier, document_type, period_start, period_end, document_date, total_cents, currency, review_status, original_filename, created_at",
    )
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) throw new Error(`Couldn't load your documents: ${error.message}`);
  return data.map((d) => ({
    id: d.id,
    supplier: d.supplier,
    documentType: d.document_type,
    periodStart: d.period_start,
    periodEnd: d.period_end,
    documentDate: d.document_date,
    totalCents: d.total_cents,
    currency: d.currency,
    reviewStatus: d.review_status as DocumentListItem["reviewStatus"],
    originalFilename: d.original_filename,
    createdAt: d.created_at,
  }));
}

export type Extraction = {
  extractor: string;
  extractorVersion: string;
  textSource: "text-layer" | "ocr" | "none";
  confidence: Partial<Record<FieldKey, Confidence>>;
  snippets: Partial<Record<FieldKey, string>>;
  candidates: Partial<Record<FieldKey, FieldValue[]>>;
  warnings: string[];
  createdAt: string;
};

function keyed<T>(
  json: unknown,
  check: (v: unknown) => v is T,
): Partial<Record<FieldKey, T>> {
  const out: Partial<Record<FieldKey, T>> = {};
  if (!json || typeof json !== "object" || Array.isArray(json)) return out;
  for (const [key, value] of Object.entries(json)) {
    if (isFieldKey(key) && check(value)) out[key] = value;
  }
  return out;
}
const isConfidence = (v: unknown): v is Confidence =>
  v === "high" || v === "medium" || v === "low";
const isString = (v: unknown): v is string => typeof v === "string";
const isValueList = (v: unknown): v is FieldValue[] =>
  Array.isArray(v) &&
  v.every((x) => typeof x === "string" || typeof x === "number");

export type ReviewData = {
  document: {
    id: string;
    householdId: string;
    supplier: string | null;
    documentType: string | null;
    documentDate: string | null;
    periodStart: string | null;
    periodEnd: string | null;
    dueDate: string | null;
    totalCents: number | null;
    vatCents: number | null;
    currency: string;
    details: unknown;
    confirmedFields: string[];
    reviewStatus: DocumentListItem["reviewStatus"];
    mimeType: string;
    originalFilename: string;
    sizeBytes: number;
    createdAt: string;
    confirmedAt: string | null;
  };
  extraction: Extraction | null;
  signedUrl: string | null;
  expense: {
    id: string;
    category: string;
    paymentStatus: string;
    isRecurring: boolean;
  } | null;
  evidence: {
    memberId: string;
    category: string;
    paidCents: number;
    sharePercent: number;
    taxYear: number | null;
  }[];
  adults: { id: string; name: string; userId: string | null }[];
};

/** Everything the review screen needs, or null if the document isn't visible to this user. */
export async function loadReview(
  documentId: string,
): Promise<ReviewData | null> {
  const supabase = await createClient();
  const { data: doc, error } = await supabase
    .from("documents")
    .select("*")
    .eq("id", documentId)
    .maybeSingle();
  if (error) throw new Error(`Couldn't load the document: ${error.message}`);
  if (!doc) return null;

  const [extractionRes, expenseRes, evidenceRes, adultsRes, yearsRes, signed] =
    await Promise.all([
      supabase
        .from("document_extractions")
        .select(
          "extractor, extractor_version, text_source, confidence, snippets, candidates, warnings, created_at",
        )
        .eq("document_id", documentId)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle(),
      supabase
        .from("expenses")
        .select("id, category, payment_status, is_recurring")
        .eq("document_id", documentId)
        .maybeSingle(),
      supabase
        .from("tax_evidence_items")
        .select("member_id, category, paid_cents, share_percent, tax_year_id")
        .eq("document_id", documentId),
      supabase
        .from("household_members")
        .select("id, display_name, user_id")
        .eq("relationship", "adult")
        .eq("is_active", true)
        .order("created_at"),
      supabase.from("tax_years").select("id, year"),
      supabase.storage
        .from(DOCUMENTS_BUCKET)
        .createSignedUrl(doc.storage_path, SIGNED_URL_SECONDS),
    ]);
  for (const res of [
    extractionRes,
    expenseRes,
    evidenceRes,
    adultsRes,
    yearsRes,
  ]) {
    if (res.error)
      throw new Error(`Couldn't load the review: ${res.error.message}`);
  }
  const years = new Map(yearsRes.data!.map((y) => [y.id, y.year]));
  const e = extractionRes.data;

  return {
    document: {
      id: doc.id,
      householdId: doc.household_id,
      supplier: doc.supplier,
      documentType: doc.document_type,
      documentDate: doc.document_date,
      periodStart: doc.period_start,
      periodEnd: doc.period_end,
      dueDate: doc.due_date,
      totalCents: doc.total_cents,
      vatCents: doc.vat_cents,
      currency: doc.currency,
      details: doc.details,
      confirmedFields: doc.confirmed_fields,
      reviewStatus: doc.review_status as DocumentListItem["reviewStatus"],
      mimeType: doc.mime_type,
      originalFilename: doc.original_filename,
      sizeBytes: doc.size_bytes,
      createdAt: doc.created_at,
      confirmedAt: doc.confirmed_at,
    },
    extraction: e
      ? {
          extractor: e.extractor,
          extractorVersion: e.extractor_version,
          textSource: e.text_source as Extraction["textSource"],
          confidence: keyed(e.confidence, isConfidence),
          snippets: keyed(e.snippets, isString),
          candidates: keyed(e.candidates, isValueList),
          warnings: e.warnings,
          createdAt: e.created_at,
        }
      : null,
    // A missing file or expired session shows a "can't preview" message rather than an error page.
    signedUrl: signed.error ? null : signed.data.signedUrl,
    expense: expenseRes.data
      ? {
          id: expenseRes.data.id,
          category: expenseRes.data.category,
          paymentStatus: expenseRes.data.payment_status,
          isRecurring: expenseRes.data.is_recurring,
        }
      : null,
    evidence: evidenceRes.data!.map((i) => ({
      memberId: i.member_id,
      category: i.category,
      paidCents: i.paid_cents,
      sharePercent: Number(i.share_percent),
      taxYear: years.get(i.tax_year_id) ?? null,
    })),
    adults: adultsRes.data!.map((m) => ({
      id: m.id,
      name: m.display_name,
      userId: m.user_id,
    })),
  };
}

export type ExpenseRow = {
  id: string;
  documentId: string | null;
  merchant: string;
  expenseDate: string;
  category: string;
  amountCents: number;
  currency: string;
  paymentStatus: string;
  isRecurring: boolean;
  reviewStatus: string;
};

export async function listExpenses(
  category: string | null,
): Promise<ExpenseRow[]> {
  const supabase = await createClient();
  let query = supabase
    .from("expenses")
    .select(
      "id, document_id, merchant, expense_date, category, amount_cents, currency, payment_status, is_recurring, review_status",
    )
    .order("expense_date", { ascending: false })
    .limit(1000);
  if (category) query = query.eq("category", category);
  const { data, error } = await query;
  if (error) throw new Error(`Couldn't load expenses: ${error.message}`);
  return data.map((e) => ({
    id: e.id,
    documentId: e.document_id,
    merchant: e.merchant,
    expenseDate: e.expense_date,
    category: e.category,
    amountCents: e.amount_cents,
    currency: e.currency,
    paymentStatus: e.payment_status,
    isRecurring: e.is_recurring,
    reviewStatus: e.review_status,
  }));
}
