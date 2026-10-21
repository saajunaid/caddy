import Link from "next/link";
import { notFound } from "next/navigation";
import { PageHeader } from "@/components/ui/page-header";
import { requireHousehold } from "@/server/auth";
import { deleteComponentAction } from "@/modules/travel/actions";
import { ComponentForm } from "@/modules/travel/components/component-form";
import { ConfirmDelete } from "@/modules/travel/components/confirm-delete";
import { linkClass } from "@/modules/travel/components/ui";
import {
  loadComponent,
  loadLatestRates,
  loadTrip,
} from "@/modules/travel/data";
import { toDublinLocal } from "@/modules/travel/server/dublin-time";
import { KIND_LABELS } from "@/modules/travel/server/labels";

export const metadata = { title: "Edit price" };

export default async function EditComponentPage({
  params,
}: PageProps<"/travel/[id]/candidates/[candidateId]/components/[componentId]/edit">) {
  const { id, candidateId, componentId } = await params;
  const { profile } = await requireHousehold();
  if (!profile) notFound();
  const [detail, component, latest] = await Promise.all([
    loadTrip(id),
    loadComponent(id, candidateId, componentId),
    loadLatestRates(),
  ]);
  const candidate = detail?.candidates.find((c) => c.id === candidateId);
  if (!detail || !candidate || !component) notFound();
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
        eyebrow={`${detail.trip.name} · ${candidate.destination}`}
        title={`Edit ${KIND_LABELS[component.kind].toLowerCase()} price`}
        actions={
          <ConfirmDelete
            action={deleteComponentAction.bind(
              null,
              detail.trip.id,
              candidate.id,
              component.id,
            )}
            label="Delete price"
            question="Delete this price?"
          />
        }
      />
      <p className="-mt-3 max-w-[65ch] text-sm text-muted">
        If you rechecked the price, update it and the checked time. Caddy
        converts it with the ECB rate for that day.
      </p>
      <ComponentForm
        tripId={detail.trip.id}
        candidateId={candidate.id}
        destination={candidate.destination}
        latest={latest}
        component={component}
        nowLocal={toDublinLocal(new Date())}
        checkedLocal={toDublinLocal(new Date(component.checkedAt))}
      />
    </>
  );
}
