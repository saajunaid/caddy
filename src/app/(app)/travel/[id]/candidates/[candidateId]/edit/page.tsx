import Link from "next/link";
import { notFound } from "next/navigation";
import { PageHeader } from "@/components/ui/page-header";
import { requireHousehold } from "@/server/auth";
import { deleteCandidateAction } from "@/modules/travel/actions";
import { CandidateForm } from "@/modules/travel/components/candidate-form";
import { ConfirmDelete } from "@/modules/travel/components/confirm-delete";
import { linkClass } from "@/modules/travel/components/ui";
import { loadTrip } from "@/modules/travel/data";

export const metadata = { title: "Edit option" };

export default async function EditCandidatePage({
  params,
}: PageProps<"/travel/[id]/candidates/[candidateId]/edit">) {
  const { id, candidateId } = await params;
  const { profile } = await requireHousehold();
  if (!profile) notFound();
  const detail = await loadTrip(id);
  const candidate = detail?.candidates.find((c) => c.id === candidateId);
  if (!detail || !candidate) notFound();
  const { trip } = detail;
  return (
    <>
      <div>
        <Link
          href={`/travel/${trip.id}#option-${candidate.id}`}
          className={`${linkClass} text-sm`}
        >
          ← {trip.name}
        </Link>
      </div>
      <PageHeader
        eyebrow={trip.name}
        title={`Edit ${candidate.destination}`}
        actions={
          <ConfirmDelete
            action={deleteCandidateAction.bind(null, trip.id, candidate.id)}
            label="Delete option"
            question={`Delete ${candidate.destination} and its ${candidate.components.length} price(s)?`}
          />
        }
      />
      <CandidateForm
        tripId={trip.id}
        airports={trip.departure_airports}
        defaults={{
          outbound: candidate.outbound_date,
          inbound: candidate.return_date,
        }}
        candidate={candidate}
      />
    </>
  );
}
