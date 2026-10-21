import Link from "next/link";
import { Plane, Plus } from "lucide-react";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { Chip } from "@/components/ui/status";
import { requireHousehold } from "@/server/auth";
import {
  briefLine,
  tripStatusChip,
} from "@/modules/travel/components/brief-summary";
import { primaryButtonClass } from "@/modules/travel/components/ui";
import { loadTrips, type TripDetail } from "@/modules/travel/data";
import { formatEur, formatShortDate } from "@/modules/travel/server/currency";

export const metadata = { title: "Travel" };

function TripCard({ detail }: { detail: TripDetail }) {
  const { trip, party, ranking } = detail;
  const best = ranking.ranked[0];
  const status = tripStatusChip(trip.status);
  const options =
    ranking.ranked.length + ranking.failing.length + ranking.unpriced.length;
  return (
    <Link
      href={`/travel/${trip.id}`}
      className="grid gap-2 rounded-[10px] border border-line bg-surface p-4 shadow-sm hover:border-muted"
    >
      <div className="flex flex-wrap items-start justify-between gap-2">
        <h2 className="text-[1.05rem] font-semibold">{trip.name}</h2>
        <Chip tone={status.tone} dot={false}>
          {status.label}
        </Chip>
      </div>
      <p className="text-sm text-muted">{briefLine(trip, party)}</p>
      {best ? (
        <p className="text-sm">
          Best so far{" "}
          <span className="num font-semibold">
            {formatEur(best.candidate.total.totalCents)}
          </span>{" "}
          · {best.candidate.destination}
          {best.candidate.total.oldestCheck ? (
            <span className="text-muted">
              {" "}
              · checked {formatShortDate(best.candidate.total.oldestCheck)}
            </span>
          ) : null}
        </p>
      ) : (
        <p className="text-sm text-muted">
          {options === 0
            ? "No options yet"
            : "No priced option meets the brief yet"}
        </p>
      )}
      <p className="text-xs text-muted">
        {options} option{options === 1 ? "" : "s"}
        {party.unconfirmedChildren > 0 ? (
          <span className="text-review">
            {" "}
            · confirm{" "}
            {party.unconfirmedChildren === 1
              ? "a child's age"
              : "children's ages"}
          </span>
        ) : null}
      </p>
    </Link>
  );
}

export default async function TravelPage() {
  const { profile } = await requireHousehold();
  const trips = profile ? await loadTrips() : [];
  const active = trips.filter((t) => t.trip.status !== "archived");
  const archived = trips.filter((t) => t.trip.status === "archived");
  const plan = (
    <Link href="/travel/new" className={primaryButtonClass}>
      <Plus aria-hidden="true" className="size-4" />
      Plan a trip
    </Link>
  );

  return (
    <>
      <PageHeader
        eyebrow="Trip planner"
        title="Travel"
        actions={profile ? plan : undefined}
      />
      {!profile ? (
        <Card className="p-4 text-sm text-muted">
          Your account isn&apos;t part of a household yet.
        </Card>
      ) : trips.length === 0 ? (
        <EmptyState icon={Plane} title="No trips yet" footer={plan}>
          Create a trip brief, add the flight and hotel options you find, and
          Caddy totals the whole-family cost so you can compare like for like.
          It doesn&apos;t search live prices and never books anything.
        </EmptyState>
      ) : (
        <>
          <div className="grid gap-3.5 lg:grid-cols-2 [&>*]:min-w-0">
            {active.map((t) => (
              <TripCard key={t.trip.id} detail={t} />
            ))}
          </div>
          {active.length === 0 ? (
            <p className="text-sm text-muted">
              No trips being planned. Archived trips are below.
            </p>
          ) : null}
          {archived.length > 0 ? (
            <details className="grid gap-3">
              <summary className="cursor-pointer text-sm font-semibold">
                Archived ({archived.length})
              </summary>
              <div className="mt-3 grid gap-3.5 lg:grid-cols-2 [&>*]:min-w-0">
                {archived.map((t) => (
                  <TripCard key={t.trip.id} detail={t} />
                ))}
              </div>
            </details>
          ) : null}
        </>
      )}
    </>
  );
}
