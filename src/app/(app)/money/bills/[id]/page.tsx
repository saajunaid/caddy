import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronLeft, ExternalLink } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Chip } from "@/components/ui/status";
import { DeleteDocument } from "@/modules/money/documents/components/delete-document";
import {
  ReviewForm,
  type ReviewField,
  type ReviewFormProps,
} from "@/modules/money/documents/components/review-form";
import {
  expenseCategoryFor,
  isExpenseCategory,
  isPaymentStatus,
} from "@/modules/money/documents/categories";
import {
  FIELD_KEYS,
  fieldsForType,
  isDocumentType,
  type FieldKey,
} from "@/modules/money/documents/fields";
import {
  fromDocumentRow,
  inputValue,
  periodLabel,
} from "@/modules/money/documents/review";
import {
  loadReview,
  type ReviewData,
} from "@/modules/money/documents/server/queries";
import {
  BILL_TAX_CATEGORIES,
  taxCategoryFor,
} from "@/modules/money/tax/categories";
import {
  currentTaxYear,
  FIRST_TAX_YEAR,
} from "@/modules/money/tax/server/queries";
import { link, note } from "@/modules/money/ui";
import { requireHousehold } from "@/server/auth";

export const metadata = { title: "Review bill" };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function readingNote(data: ReviewData): string {
  const e = data.extraction;
  if (!e) return "Not read yet.";
  const how =
    e.textSource === "text-layer"
      ? "Read from the PDF's text layer"
      : e.textSource === "ocr"
        ? "Read with text recognition (OCR) on your device"
        : "The text couldn't be read; enter the details yourself";
  const rules =
    e.extractor === "rules:generic"
      ? "generic rules"
      : `${e.extractor.replace("rules:", "")} parser`;
  return `${how} · ${rules} v${e.extractorVersion} · no AI used`;
}

function Preview({ data }: { data: ReviewData }) {
  const { signedUrl, document: doc } = data;
  if (!signedUrl) {
    return (
      <Card className="p-4 text-sm text-muted">
        The original can&apos;t be shown right now. Reload the page to try
        again.
      </Card>
    );
  }
  const openLink = (
    <a
      href={signedUrl}
      target="_blank"
      rel="noopener noreferrer"
      className={`${link} inline-flex items-center gap-1 text-sm`}
    >
      Open the original <ExternalLink aria-hidden="true" className="size-3.5" />
    </a>
  );
  if (doc.mimeType === "application/pdf") {
    return (
      <div className="grid gap-2">
        <object
          data={signedUrl}
          type="application/pdf"
          aria-label={`Original: ${doc.originalFilename}`}
          className="h-[60vh] min-h-80 w-full rounded-[10px] border border-line bg-white lg:h-[75vh]"
        >
          <Card className="p-4 text-sm">
            This browser can&apos;t show PDFs inline. {openLink}
          </Card>
        </object>
        <div className="flex flex-wrap items-center justify-between gap-2">
          {openLink}
          <span className="text-xs text-muted">
            Private link, valid for 5 minutes
          </span>
        </div>
      </div>
    );
  }
  if (doc.mimeType === "image/heic" || doc.mimeType === "image/heif") {
    return (
      <Card className="grid gap-2 p-4 text-sm">
        <span>HEIC photos can only be previewed in some browsers.</span>
        {openLink}
      </Card>
    );
  }
  return (
    <div className="grid gap-2">
      {/* eslint-disable-next-line @next/next/no-img-element -- private signed URL, not optimisable */}
      <img
        src={signedUrl}
        alt={`Original: ${doc.originalFilename}`}
        className="max-h-[75vh] w-full rounded-[10px] border border-line bg-white object-contain"
      />
      {openLink}
    </div>
  );
}

export default async function BillReviewPage({
  params,
  searchParams,
}: PageProps<"/money/bills/[id]">) {
  const { id } = await params;
  const query = await searchParams;
  const { user, profile } = await requireHousehold();
  if (!profile || !UUID.test(id)) notFound();
  const data = await loadReview(id);
  if (!data) notFound();
  const doc = data.document;

  const values = fromDocumentRow({
    supplier: doc.supplier,
    document_type: doc.documentType,
    document_date: doc.documentDate,
    period_start: doc.periodStart,
    period_end: doc.periodEnd,
    due_date: doc.dueDate,
    total_cents: doc.totalCents,
    vat_cents: doc.vatCents,
    details: doc.details,
  });
  const type = isDocumentType(doc.documentType) ? doc.documentType : null;
  const extraction = data.extraction;
  const keys = new Set<FieldKey>(fieldsForType(type));
  for (const key of FIELD_KEYS) {
    if (values[key] != null || extraction?.candidates[key]?.length)
      keys.add(key);
  }
  const confirmed = new Set(doc.confirmedFields);
  const fields: ReviewField[] = [...keys].map((key) => ({
    key,
    value: values[key] ?? null,
    confirmed: confirmed.has(key),
    confidence: extraction?.confidence[key],
    snippet: extraction?.snippets[key],
    candidates: extraction?.candidates[key],
  }));

  const thisYear = currentTaxYear();
  const years = Array.from(
    { length: thisYear + 2 - FIRST_TAX_YEAR },
    (_, i) => thisYear + 1 - i,
  );
  const isConfirmed = doc.reviewStatus === "confirmed";
  const utilityBill = type !== null && type !== "receipt" && type !== "other";
  const dateYear = Number(
    (doc.periodEnd ?? doc.documentDate ?? "").slice(0, 4),
  );
  const existingYear = data.evidence[0]?.taxYear ?? null;
  const defaultCategory = taxCategoryFor(type);
  const existingCategory = data.evidence[0]?.category;
  const ownMember = data.adults.find((a) => a.userId === user.id)?.id;

  const form: ReviewFormProps = {
    documentId: doc.id,
    currency: doc.currency,
    fields,
    alreadyConfirmed: isConfirmed,
    expense: {
      enabled: data.expense ? true : !isConfirmed,
      category:
        data.expense && isExpenseCategory(data.expense.category)
          ? data.expense.category
          : expenseCategoryFor(type),
      paymentStatus:
        data.expense && isPaymentStatus(data.expense.paymentStatus)
          ? data.expense.paymentStatus
          : "unknown",
      isRecurring: data.expense?.isRecurring ?? utilityBill,
    },
    tax: {
      enabled: data.evidence.length > 0 || (!isConfirmed && utilityBill),
      year:
        existingYear ??
        (dateYear >= FIRST_TAX_YEAR && dateYear <= thisYear + 1
          ? dateYear
          : thisYear),
      years,
      category: (BILL_TAX_CATEGORIES as readonly string[]).includes(
        existingCategory ?? "",
      )
        ? (existingCategory as (typeof BILL_TAX_CATEGORIES)[number])
        : (BILL_TAX_CATEGORIES as readonly string[]).includes(defaultCategory)
          ? (defaultCategory as (typeof BILL_TAX_CATEGORIES)[number])
          : "other",
      amount:
        data.evidence[0] && data.evidence[0].paidCents !== doc.totalCents
          ? inputValue("total_cents", data.evidence[0].paidCents)
          : "",
      members: data.adults.map((adult) => {
        const existing = data.evidence.find((e) => e.memberId === adult.id);
        return {
          id: adult.id,
          name: adult.name,
          checked: existing
            ? true
            : data.evidence.length === 0 && adult.id === ownMember,
          share: existing ? String(existing.sharePercent) : "100",
        };
      }),
    },
  };

  const period = periodLabel(doc.periodStart, doc.periodEnd, doc.documentDate);
  const title =
    [doc.supplier, period].filter(Boolean).join(" · ") || doc.originalFilename;
  const unread = query.unread === "1" || extraction?.textSource === "none";

  return (
    <>
      <div className="grid gap-2">
        <Link
          href="/money"
          className={`${link} inline-flex w-fit items-center gap-1 text-sm`}
        >
          <ChevronLeft aria-hidden="true" className="size-4" />
          Bills
        </Link>
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div className="min-w-0">
            <div className="label">{isConfirmed ? "Bill" : "Review bill"}</div>
            <h2 className="text-[1.35rem] leading-tight font-bold break-words">
              {title}
            </h2>
          </div>
          {isConfirmed ? (
            <Chip tone="ok">Confirmed</Chip>
          ) : doc.reviewStatus === "processing" ? (
            <Chip tone="info">Reading…</Chip>
          ) : (
            <Chip tone="review">Needs review</Chip>
          )}
        </div>
      </div>

      {unread && !isConfirmed ? (
        <p className={note}>
          Caddy couldn&apos;t read the text of this file (photo quality, a scan,
          or a HEIC photo this browser can&apos;t open). Use the original on
          this page to add the details yourself.
        </p>
      ) : null}

      <div className="grid gap-[22px] lg:grid-cols-2 [&>*]:min-w-0">
        <section
          className="grid content-start gap-2"
          aria-label="Original document"
        >
          <Preview data={data} />
          <p className="text-xs text-muted">{readingNote(data)}</p>
        </section>
        {doc.reviewStatus === "processing" ? (
          <Card className="grid gap-2 p-4">
            <h2 className="text-[1.05rem] font-semibold">Still reading</h2>
            <p className="text-sm text-muted">
              This document is being read on the device that added it. It will
              appear in the review queue when that finishes. If the upload was
              interrupted, Caddy releases it for manual review within a day.
            </p>
          </Card>
        ) : (
          <ReviewForm {...form} />
        )}
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line pt-4">
        <span className="text-xs text-muted">
          {doc.originalFilename} · stored privately · account and meter numbers
          are kept as the last four characters only
        </span>
        <DeleteDocument documentId={doc.id} />
      </div>
    </>
  );
}
