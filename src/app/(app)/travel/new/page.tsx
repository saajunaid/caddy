import Link from "next/link";
import { redirect } from "next/navigation";
import { PageHeader } from "@/components/ui/page-header";
import { requireHousehold } from "@/server/auth";
import { TripForm } from "@/modules/travel/components/trip-form";
import { linkClass } from "@/modules/travel/components/ui";
import { loadMembers } from "@/modules/travel/data";

export const metadata = { title: "Plan a trip" };

export default async function NewTripPage() {
  const { profile } = await requireHousehold();
  if (!profile) redirect("/travel");
  const members = await loadMembers();
  return (
    <>
      <div>
        <Link href="/travel" className={`${linkClass} text-sm`}>
          ← All trips
        </Link>
      </div>
      <PageHeader eyebrow="Trip brief" title="Plan a trip" />
      <p className="-mt-3 max-w-[65ch] text-muted">
        Describe the trip once. Caddy uses it to prefill searches on Skyscanner,
        Google Flights and Booking.com, and to check each option you add against
        your dates, nights and must-haves.
      </p>
      <TripForm members={members} />
    </>
  );
}
