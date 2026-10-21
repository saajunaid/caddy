// The "ready to review" alert for a document. Pure; used by the upload action and the daily sweep job.
import { periodLabel } from "./review.ts";

export type ReadyDocument = {
  id: string;
  householdId: string;
  supplier: string | null;
  documentType: string | null;
  periodStart: string | null;
  periodEnd: string | null;
  documentDate: string | null;
  originalFilename: string;
};

export function readyToReviewNotification(
  doc: ReadyDocument,
  jobRunId?: string,
) {
  const what = doc.documentType === "receipt" ? "Receipt" : "Bill";
  const period = periodLabel(doc.periodStart, doc.periodEnd, doc.documentDate);
  const name =
    [doc.supplier, period].filter(Boolean).join(" ") || doc.originalFilename;
  return {
    householdId: doc.householdId,
    kind: "document.review",
    severity: "info" as const,
    title: `${what} ready to review: ${name}`,
    body: "Check the details Caddy read and choose what to use it for.",
    actionUrl: `/money/bills/${doc.id}`,
    // One alert per document, however many times it is read.
    dedupeKey: `document-ready:${doc.id}`,
    jobRunId,
  };
}
