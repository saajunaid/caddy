import { MapPin } from "lucide-react";
import { Card } from "@/components/ui/card";

/**
 * PLACEHOLDER — the Nearby/places panel is built by another module (PLAN PR-6).
 * The integrator replaces this component's body with the real panel; keep the props.
 */
export function ListingNearby({
  latitude,
  longitude,
  label,
}: {
  latitude: number | null;
  longitude: number | null;
  label: string;
}) {
  const located = latitude !== null && longitude !== null;
  return (
    <Card
      className="grid justify-items-start gap-3 p-5"
      data-placeholder="listing-nearby"
      aria-label={`Nearby places for ${label}`}
    >
      <span className="grid size-10 place-items-center rounded-[10px] bg-sunk text-muted">
        <MapPin aria-hidden="true" className="size-5" />
      </span>
      <h2 className="text-[1.05rem] font-semibold">
        {located ? "Nearby places will appear here" : "Location not found yet"}
      </h2>
      <p className="max-w-[60ch] text-muted">
        {located
          ? "Childcare and ECCE, schools, colleges, bus stops, mosques and halal food near this listing."
          : "The listing page has no map pin and the address hasn't been geocoded yet. The next daily check will try again."}
      </p>
    </Card>
  );
}
