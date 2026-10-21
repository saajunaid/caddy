import Link from "next/link";
import { Chip, ProvenanceTag, TONES } from "@/components/ui/status";
import { dublinDate } from "@/server/domain/dates";
import { formatMoney } from "@/server/domain/money";
import { DOCUMENT_TYPE_LABELS, isDocumentType } from "../fields";
import { formatDate, periodLabel } from "../review";
import type { DocumentListItem } from "../server/queries";

const STATUS = {
  processing: { label: "Reading…", tone: "info", stripe: TONES.info },
  needs_review: { label: "To review", tone: "review", stripe: TONES.review },
  confirmed: { label: "Confirmed", tone: "ok", stripe: "var(--line)" },
} as const;

/** One bill or receipt in a list: supplier, period, amount and review status. */
export function DocumentRow({ doc }: { doc: DocumentListItem }) {
  const status = STATUS[doc.reviewStatus];
  const period = periodLabel(doc.periodStart, doc.periodEnd, doc.documentDate);
  const type = isDocumentType(doc.documentType)
    ? DOCUMENT_TYPE_LABELS[doc.documentType].toLowerCase()
    : null;
  const subtitle =
    [period, type].filter(Boolean).join(" · ") ||
    `Added ${formatDate(dublinDate(new Date(doc.createdAt)))}`;

  return (
    <Link
      href={`/money/bills/${doc.id}`}
      className="flex min-w-0 items-center gap-3 px-4 py-3 hover:bg-fg/4"
    >
      <span
        aria-hidden="true"
        className="w-1 self-stretch rounded"
        style={{ background: status.stripe }}
      />
      <span className="min-w-0 flex-1">
        <span className="block truncate font-semibold">
          {doc.supplier ?? doc.originalFilename}
        </span>
        <span className="block truncate text-sm text-muted">{subtitle}</span>
      </span>
      <span className="grid shrink-0 justify-items-end gap-1">
        {doc.totalCents !== null ? (
          <span className="num font-semibold">
            {formatMoney(doc.totalCents, doc.currency)}
          </span>
        ) : (
          <span className="text-sm text-muted">Amount unknown</span>
        )}
        {doc.reviewStatus === "needs_review" && doc.totalCents !== null ? (
          <ProvenanceTag source="ocr-proposed" />
        ) : null}
      </span>
      <span className="shrink-0">
        <Chip tone={status.tone}>{status.label}</Chip>
      </span>
    </Link>
  );
}
