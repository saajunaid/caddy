import Link from "next/link";
import { ReceiptText } from "lucide-react";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { DocumentRow } from "@/modules/money/documents/components/document-row";
import { Uploader } from "@/modules/money/documents/components/uploader";
import { listDocuments } from "@/modules/money/documents/server/queries";
import { link, note, sectionTitle } from "@/modules/money/ui";
import { requireHousehold } from "@/server/auth";

export const metadata = { title: "Bills" };

export default async function BillsPage({ searchParams }: PageProps<"/money">) {
  const { profile } = await requireHousehold();
  const params = await searchParams;

  if (!profile) {
    return (
      <EmptyState icon={ReceiptText} title="Not part of a household yet">
        Ask an adult in your household to add you from Settings, then your bills
        will show here.
      </EmptyState>
    );
  }

  const documents = await listDocuments();
  const queue = documents.filter((d) => d.reviewStatus !== "confirmed");
  const recent = documents.filter((d) => d.reviewStatus === "confirmed");

  return (
    <>
      <Uploader />

      {params.saved ? (
        <p role="status" className="text-sm text-ok">
          Saved. The bill is confirmed and linked.
        </p>
      ) : null}
      {params.deleted ? (
        <p role="status" className="text-sm text-ok">
          Deleted the document and its stored file.
        </p>
      ) : null}

      {documents.length === 0 ? (
        <EmptyState icon={ReceiptText} title="No bills yet">
          Add a bill or receipt as a PDF or a photo. Caddy reads it on your
          device, asks you to confirm the details, and uses it for household
          spending and your remote working relief evidence.
        </EmptyState>
      ) : null}

      {queue.length > 0 ? (
        <section className="grid gap-2.5" aria-labelledby="review-queue">
          <div className="flex items-baseline justify-between gap-3">
            <h2 id="review-queue" className={sectionTitle}>
              To review
            </h2>
            <span className="text-sm text-muted">{queue.length} waiting</span>
          </div>
          <Card className="divide-y divide-line overflow-hidden">
            {queue.map((doc) => (
              <DocumentRow key={doc.id} doc={doc} />
            ))}
          </Card>
        </section>
      ) : null}

      {recent.length > 0 ? (
        <section className="grid gap-2.5" aria-labelledby="recent-documents">
          <div className="flex items-baseline justify-between gap-3">
            <h2 id="recent-documents" className={sectionTitle}>
              Recent
            </h2>
            <Link href="/money/expenses" className={`${link} text-sm`}>
              Household spending →
            </Link>
          </div>
          <Card className="divide-y divide-line overflow-hidden">
            {recent.map((doc) => (
              <DocumentRow key={doc.id} doc={doc} />
            ))}
          </Card>
        </section>
      ) : (
        <p className="text-sm">
          <Link href="/money/expenses" className={link}>
            Household spending →
          </Link>
        </p>
      )}

      <p className={note}>
        Each file is stored once, privately. One bill can feed household
        spending and tax evidence without being copied. Caddy reads documents
        with open-source text extraction and OCR on your device; nothing is
        confirmed until you check it.
      </p>
    </>
  );
}
