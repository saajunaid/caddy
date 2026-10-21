import Link from "next/link";
import { notFound } from "next/navigation";
import { PageHeader } from "@/components/ui/page-header";
import { requireHousehold } from "@/server/auth";
import { briefDates } from "@/modules/travel/components/brief-summary";
import { CandidateForm } from "@/modules/travel/components/candidate-form";
import { linkClass } from "@/modules/travel/components/ui";
import { loadTrip } from "@/modules/travel/data";

export const metadata = { title: "Add option" };

export default async function NewCandidatePage({
  params,
}: PageProps<"/travel/[id]/candidates/new">) {
  const { id } = await params;
  const { profile } = await requireHousehold();
  if (!profile) notFound();
  const detail = await loadTrip(id);
  if (!detail) notFound();
  const { trip } = detail;
  const dates = briefDates(trip);
  return (
    <>
      <div>
        <Link href={`/travel/${trip.id}`} className={`${linkClass} text-sm`}>
          ← {trip.name}
        </Link>
      </div>
      <PageHeader eyebrow={trip.name} title="Add an option" />
      <p className="-mt-3 max-w-[65ch] text-muted">
        One option is one destination on one set of dates. Next you&apos;ll add
        its prices: flights, stay, transfers and extras.
      </p>
      <CandidateForm
        tripId={trip.id}
        airports={trip.departure_airports}
        defaults={{ outbound: dates.outbound, inbound: dates.inbound }}
      />
    </>
  );
}
