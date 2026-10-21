import Link from "next/link";
import { notFound } from "next/navigation";
import { PageHeader } from "@/components/ui/page-header";
import { requireHousehold } from "@/server/auth";
import { deleteTripAction } from "@/modules/travel/actions";
import { ConfirmDelete } from "@/modules/travel/components/confirm-delete";
import { TripForm } from "@/modules/travel/components/trip-form";
import { linkClass } from "@/modules/travel/components/ui";
import { loadMembers, loadTrip } from "@/modules/travel/data";

export const metadata = { title: "Edit trip" };

export default async function EditTripPage({
  params,
}: PageProps<"/travel/[id]/edit">) {
  const { id } = await params;
  const { profile } = await requireHousehold();
  if (!profile) notFound();
  const [detail, members] = await Promise.all([loadTrip(id), loadMembers()]);
  if (!detail) notFound();
  const { trip, travellers } = detail;
  return (
    <>
      <div>
        <Link href={`/travel/${trip.id}`} className={`${linkClass} text-sm`}>
          ← {trip.name}
        </Link>
      </div>
      <PageHeader
        eyebrow="Trip brief"
        title="Edit trip"
        actions={
          <ConfirmDelete
            action={deleteTripAction.bind(null, trip.id)}
            label="Delete trip"
            question={`Delete “${trip.name}” with all its options and prices? This can't be undone.`}
          />
        }
      />
      <TripForm trip={trip} travellers={travellers} members={members} />
    </>
  );
}
