import { MapPinOff, TriangleAlert } from "lucide-react";
import { EmptyState } from "@/components/ui/empty-state";
import { requireHousehold } from "@/server/auth";
import { loadNearby, type NearbyData } from "../queries";
import { isValidLatLon } from "../server/geo";
import { NearbyView } from "./nearby-view";

export type NearbyAnchor = {
  /** Stable id for the location, e.g. listingAnchorKey(listing.id) → "housing:<id>". */
  key: string;
  label: string;
  latitude: number;
  longitude: number;
};

/**
 * Nearby childcare, schools, colleges, bus stops, mosques and halal food for one location.
 * Server component. Pages that render it should allow ~60 s for the on-demand lookup
 * (`export const maxDuration = 60`).
 */
export async function NearbyPanel({ anchor }: { anchor: NearbyAnchor | null }) {
  if (!anchor || !isValidLatLon(anchor)) {
    return (
      <EmptyState
        icon={MapPinOff}
        title="We couldn't place this home on a map yet."
      >
        Once its address can be found on the map, nearby childcare, schools,
        colleges, bus stops, mosques and halal food will show here.
      </EmptyState>
    );
  }
  const { profile } = await requireHousehold();
  if (!profile) {
    return (
      <EmptyState icon={MapPinOff} title="Nearby places need a household">
        Ask an adult in your household to add you, then nearby places will show
        here.
      </EmptyState>
    );
  }
  const now = new Date();
  let data: NearbyData;
  try {
    data = await loadNearby(anchor, now);
  } catch {
    return (
      <EmptyState icon={TriangleAlert} title="Couldn't load nearby places">
        Something went wrong reading saved places. Reload the page to try again.
      </EmptyState>
    );
  }
  return <NearbyView anchor={anchor} data={data} now={now.toISOString()} />;
}

/** Placeholder while NearbyPanel loads (use as a Suspense fallback). */
export function NearbyPanelSkeleton() {
  return (
    <div
      role="status"
      aria-label="Loading nearby places"
      className="grid gap-[22px] lg:grid-cols-2"
    >
      <div className="h-[280px] animate-pulse rounded-[10px] border border-line bg-sunk sm:h-[340px] lg:h-[380px]" />
      <div className="grid content-start gap-3">
        {[0, 1, 2].map((i) => (
          <div
            key={i}
            className="h-28 animate-pulse rounded-[10px] border border-line bg-surface"
          />
        ))}
      </div>
    </div>
  );
}
