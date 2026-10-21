import Link from "next/link";
import { notFound } from "next/navigation";
import { PageHeader } from "@/components/ui/page-header";
import { requireHousehold } from "@/server/auth";
import { ComponentForm } from "@/modules/travel/components/component-form";
import { linkClass } from "@/modules/travel/components/ui";
import { loadLatestRates, loadTrip } from "@/modules/travel/data";
import { formatEur } from "@/modules/travel/server/currency";
import { toDublinLocal } from "@/modules/travel/server/dublin-time";
import { KIND_LABELS } from "@/modules/travel/server/labels";
import { lineFor } from "@/modules/travel/server/totals";

export const metadata = { title: "Add price" };

export default async function NewComponentPage({
  params,
}: PageProps<"/travel/[id]/candidates/[candidateId]/components/new">) {
  const { id, candidateId } = await params;
  const { profile } = await requireHousehold();
  if (!profile) notFound();
  const [detail, latest] = await Promise.all([loadTrip(id), loadLatestRates()]);
  const candidate = detail?.candidates.find((c) => c.id === candidateId);
  if (!detail || !candidate) notFound();
  const now = toDublinLocal(new Date());
  return (
    <>
      <div>
        <Link
          href={`/travel/${detail.trip.id}#option-${candidate.id}`}
          className={`${linkClass} text-sm`}
        >
          ← {detail.trip.name}
        </Link>
      </div>
      <PageHeader
        eyebrow={detail.trip.name}
        title={`Add a price: ${candidate.destination}`}
      />
      {candidate.components.length > 0 ? (
        <p className="-mt-3 text-sm text-muted">
          Already added:{" "}
          {candidate.components
            .map((c) => {
              const line = lineFor(c, []);
              return `${KIND_LABELS[c.kind]}${line.eurCents !== null ? ` ${formatEur(line.eurCents)}` : ""}`;
            })
            .join(" · ")}
        </p>
      ) : (
        <p className="-mt-3 max-w-[65ch] text-sm text-muted">
          Enter each part separately, at the total price for the whole family,
          in the currency the site showed. Mark guesses as estimates.
        </p>
      )}
      <ComponentForm
        // A fresh, empty form after "Save and add another".
        key={candidate.components.length}
        tripId={detail.trip.id}
        candidateId={candidate.id}
        destination={candidate.destination}
        latest={latest}
        nowLocal={now}
        checkedLocal={now}
      />
    </>
  );
}
