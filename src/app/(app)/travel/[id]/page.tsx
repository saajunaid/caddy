import Link from "next/link";
import { notFound } from "next/navigation";
import { Pencil, Plane, Plus } from "lucide-react";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { Chip } from "@/components/ui/status";
import { requireHousehold } from "@/server/auth";
import {
  briefDates,
  briefLine,
  briefNeeds,
  tripStatusChip,
} from "@/modules/travel/components/brief-summary";
import {
  CandidateCard,
  type CandidateExtras,
} from "@/modules/travel/components/candidate-card";
import { SearchButtons } from "@/modules/travel/components/search-links";
import {
  buttonClass,
  inputClass,
  linkClass,
  Note,
  primaryButtonClass,
  smallButtonClass,
} from "@/modules/travel/components/ui";
import { loadTrip, type TripDetail } from "@/modules/travel/data";
import {
  MAX_WEIGHT,
  parseWeights,
  type RankedCandidate,
  type Weights,
} from "@/modules/travel/server/ranking";

export const metadata = { title: "Trip" };

function WeightsForm({
  weights,
  tripId,
}: {
  weights: Weights;
  tripId: string;
}) {
  const select = (name: string, label: string, value: number) => (
    <label className="grid gap-1 text-sm font-semibold">
      {label}
      <select name={name} defaultValue={value} className={inputClass}>
        {Array.from({ length: MAX_WEIGHT + 1 }, (_, i) => (
          <option key={i} value={i}>
            {i === 0 ? "0 (ignore)" : i}
          </option>
        ))}
      </select>
    </label>
  );
  return (
    <details className="rounded-[10px] border border-line bg-surface p-4">
      <summary className="cursor-pointer text-sm font-semibold">
        Score weights
      </summary>
      <form
        method="get"
        action={`/travel/${tripId}`}
        className="mt-3 grid gap-3 sm:grid-cols-[repeat(3,minmax(0,1fr))_auto] sm:items-end"
      >
        {select("wc", "Cost", weights.cost)}
        {select("wt", "Flight time", weights.time)}
        {select("wf", "Flexibility", weights.flexibility)}
        <button type="submit" className={buttonClass}>
          Re-score
        </button>
      </form>
      <p className="mt-2 text-xs text-muted">
        The score is shown on each card. Options are always listed cheapest
        first; a higher score never hides a cheaper option.
      </p>
    </details>
  );
}

function Grid({
  entries,
  detail,
  label,
}: {
  entries: RankedCandidate[];
  detail: TripDetail;
  label: (entry: RankedCandidate) => string;
}) {
  const extrasOf = (id: string): CandidateExtras => {
    const row = detail.candidates.find((c) => c.id === id);
    return {
      destinationAirport: row?.destination_airport ?? null,
      destinationCountry: row?.destination_country ?? null,
      departureAirport: row?.departure_airport ?? "DUB",
      notes: row?.notes ?? null,
      tradeOffs: row?.trade_offs ?? null,
    };
  };
  return (
    <div className="grid gap-3.5 lg:grid-cols-2 xl:grid-cols-3 [&>*]:min-w-0">
      {entries.map((entry) => (
        <CandidateCard
          key={entry.candidate.id}
          entry={entry}
          extras={extrasOf(entry.candidate.id)}
          tripId={detail.trip.id}
          party={detail.party}
          rankLabel={label(entry)}
        />
      ))}
    </div>
  );
}

export default async function TripPage({
  params,
  searchParams,
}: PageProps<"/travel/[id]">) {
  const { id } = await params;
  const weights = parseWeights(await searchParams);
  const { profile } = await requireHousehold();
  if (!profile) notFound();
  const detail = await loadTrip(id, weights);
  if (!detail) notFound();
  const { trip, party, ranking } = detail;
  const status = tripStatusChip(trip.status);
  const needs = briefNeeds(trip);
  const dates = briefDates(trip);
  const addOption = (
    <Link
      href={`/travel/${trip.id}/candidates/new`}
      className={primaryButtonClass}
    >
      <Plus aria-hidden="true" className="size-4" />
      Add option
    </Link>
  );
  const total =
    ranking.ranked.length +
    ranking.failing.length +
    ranking.unpriced.length +
    ranking.rejected.length;

  return (
    <>
      <div>
        <Link href="/travel" className={`${linkClass} text-sm`}>
          ← All trips
        </Link>
      </div>
      <PageHeader
        eyebrow="Trip brief"
        title={trip.name}
        actions={
          <>
            {addOption}
            <Link href={`/travel/${trip.id}/edit`} className={buttonClass}>
              <Pencil aria-hidden="true" className="size-4" />
              Edit brief
            </Link>
          </>
        }
      />
      <div className="-mt-3 grid gap-2">
        <p className="text-muted">{briefLine(trip, party)}</p>
        <div className="flex flex-wrap items-center gap-2">
          <Chip tone={status.tone} dot={false}>
            {status.label}
          </Chip>
          {needs.map((n) => (
            <Chip key={n} tone="neutral" dot={false}>
              {n}
            </Chip>
          ))}
        </div>
        {trip.destination_ideas ? (
          <p className="text-sm text-muted">Ideas: {trip.destination_ideas}</p>
        ) : null}
        {party.unconfirmedChildren > 0 ? (
          <p className="text-sm text-review">
            Confirm{" "}
            {party.unconfirmedChildren === 1 ? "a child's" : "children's"} age
            at travel in the brief: search links and prices depend on it.{" "}
            <Link href={`/travel/${trip.id}/edit`} className={linkClass}>
              Confirm ages
            </Link>
          </p>
        ) : null}
        {party.adults === 0 ? (
          <p className="text-sm text-review">
            No adults in the brief yet: search links assume 1 adult.
          </p>
        ) : null}
      </div>

      <section className="grid gap-2" aria-label="Search on">
        <div className="label">Search on</div>
        <SearchButtons
          target={{
            from: trip.departure_airports[0] ?? "DUB",
            flightsTo: null,
            stay: null,
            country: null,
            outbound: dates.outbound,
            inbound: dates.inbound,
            party,
          }}
        />
        {trip.departure_airports.length > 1 ? (
          <p className="text-xs text-muted">
            Searches start from {trip.departure_airports[0]}; each option&apos;s
            card searches from its own airport.
          </p>
        ) : null}
      </section>

      <Note>
        Prices here are options you entered, with the date you checked them.
        Caddy does not search live prices and never books anything.
      </Note>

      {total === 0 ? (
        <EmptyState icon={Plane} title="No options yet" footer={addOption}>
          Search with the buttons above, then add each option you like: its
          flights, stay, transfers and extras, with the price you saw and a
          link. Caddy totals the whole-family cost and ranks them.
        </EmptyState>
      ) : null}

      {ranking.ranked.length > 0 ? (
        <section className="grid gap-3" aria-labelledby="ranked-heading">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h2 id="ranked-heading" className="text-[1.05rem] font-semibold">
              Options that meet the brief, cheapest first
            </h2>
          </div>
          {ranking.scoreNote ? (
            <p className="text-sm">{ranking.scoreNote}</p>
          ) : null}
          <Grid
            entries={ranking.ranked}
            detail={detail}
            label={(e) => `#${e.rank} by total cost`}
          />
          {ranking.ranked.length > 1 ? (
            <WeightsForm weights={weights} tripId={trip.id} />
          ) : null}
        </section>
      ) : null}

      {ranking.failing.length > 0 ? (
        <section className="grid gap-3" aria-labelledby="failing-heading">
          <h2 id="failing-heading" className="text-[1.05rem] font-semibold">
            Don&apos;t meet the brief
          </h2>
          <Grid
            entries={ranking.failing}
            detail={detail}
            label={() => "Doesn't meet the brief"}
          />
        </section>
      ) : null}

      {ranking.unpriced.length > 0 ? (
        <section className="grid gap-3" aria-labelledby="unpriced-heading">
          <h2 id="unpriced-heading" className="text-[1.05rem] font-semibold">
            Not priced yet
          </h2>
          <Grid
            entries={ranking.unpriced}
            detail={detail}
            label={() => "No prices yet"}
          />
        </section>
      ) : null}

      {ranking.rejected.length > 0 ? (
        <details className="grid gap-3">
          <summary className="cursor-pointer text-sm font-semibold">
            Rejected ({ranking.rejected.length})
          </summary>
          <div className="mt-3">
            <Grid
              entries={ranking.rejected}
              detail={detail}
              label={() => "Rejected"}
            />
          </div>
        </details>
      ) : null}

      {total > 0 ? (
        <div>
          <Link
            href={`/travel/${trip.id}/candidates/new`}
            className={smallButtonClass}
          >
            <Plus aria-hidden="true" className="size-3.5" />
            Add another option
          </Link>
        </div>
      ) : null}

      {trip.notes ? (
        <section className="grid gap-1">
          <h2 className="label">Notes</h2>
          <p className="text-sm whitespace-pre-line">{trip.notes}</p>
        </section>
      ) : null}
    </>
  );
}
