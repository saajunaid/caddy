import { MapPin, SearchX, TriangleAlert } from "lucide-react";
import { Suspense } from "react";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import {
  NearbyPanel,
  NearbyPanelSkeleton,
} from "@/modules/places/components/nearby-panel";
import { EIRCODE, GeocodeError, geocode } from "@/modules/places/nominatim";
import { locationKey } from "@/modules/places/server/geo";
import { requireHousehold } from "@/server/auth";

export const metadata = { title: "Check an area" };
// The on-demand lookup can wait on OpenStreetMap for a while.
export const maxDuration = 60;

async function Area({ query }: { query: string }) {
  let found: Awaited<ReturnType<typeof geocode>>;
  try {
    found = await geocode(query);
  } catch (error) {
    return (
      <EmptyState icon={TriangleAlert} title="Address search failed">
        {error instanceof GeocodeError
          ? error.message
          : "Something went wrong. Try again in a minute."}
      </EmptyState>
    );
  }
  if (!found) {
    return (
      <EmptyState icon={SearchX} title="We couldn't find that in Ireland">
        {EIRCODE.test(query)
          ? "OpenStreetMap doesn't know most Eircodes. Try the street and town instead."
          : "Try the street and town, e.g. “Dublin Road, Castletroy, Limerick”."}
      </EmptyState>
    );
  }
  return (
    <>
      <p className="text-sm text-muted">
        Showing places near <strong className="text-fg">{found.label}</strong>
        {found.approximate ? " (an area, not an exact address)" : ""}.
      </p>
      <NearbyPanel
        anchor={{
          key: locationKey(found),
          label: found.label,
          latitude: found.latitude,
          longitude: found.longitude,
        }}
      />
    </>
  );
}

export default async function PlacesPage({
  searchParams,
}: PageProps<"/places">) {
  await requireHousehold();
  const { q } = await searchParams;
  const query = typeof q === "string" ? q.trim().slice(0, 200) : "";

  return (
    <>
      <PageHeader eyebrow="Nearby places" title="Check an area" />
      <form
        action="/places"
        method="get"
        role="search"
        className="flex max-w-xl gap-2"
      >
        <label htmlFor="area-query" className="sr-only">
          Address or area
        </label>
        <input
          id="area-query"
          name="q"
          defaultValue={query}
          required
          minLength={3}
          maxLength={200}
          placeholder="Street and town, e.g. Castletroy, Limerick"
          className="min-h-10 w-full min-w-0 rounded-lg border border-line bg-bg px-3 text-fg"
        />
        <button
          type="submit"
          className="inline-flex min-h-10 shrink-0 items-center rounded-[9px] border border-accent bg-accent px-3.5 text-sm font-semibold text-on-accent hover:brightness-110"
        >
          Search
        </button>
      </form>
      {query ? (
        <Suspense key={query} fallback={<NearbyPanelSkeleton />}>
          <Area query={query} />
        </Suspense>
      ) : (
        <EmptyState icon={MapPin} title="Check any area">
          Type an address or town to see childcare, schools, colleges, bus
          stops, mosques and halal food around it. Addresses are looked up with
          OpenStreetMap; most Eircodes aren&apos;t known there yet.
        </EmptyState>
      )}
    </>
  );
}
