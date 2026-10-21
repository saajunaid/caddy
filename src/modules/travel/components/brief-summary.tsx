import { addDays } from "@/server/domain/dates";
import { formatEur } from "../server/currency";
import {
  BOARD_LABELS,
  formatDateRange,
  formatDuration,
  IRISH_AIRPORTS,
  type TripBoardBasis,
} from "../server/labels";
import { describeParty, type Party } from "../server/travellers";
import type { TripRow } from "../data";

export function airportName(code: string): string {
  return IRISH_AIRPORTS.find((a) => a.code === code)?.name ?? code;
}

/** "2 adults + 2 children (8 and 4 at travel) · from Dublin · 14–22 Feb 2027 · up to €3,200". */
export function briefLine(trip: TripRow, party: Party): string {
  return [
    describeParty(party),
    `from ${trip.departure_airports.map(airportName).join(", ")}`,
    formatDateRange(trip.date_from, trip.date_to),
    trip.budget_cents !== null ? `up to ${formatEur(trip.budget_cents)}` : null,
  ]
    .filter(Boolean)
    .join(" · ");
}

/** The brief's needs and hard constraints in short phrases. */
export function briefNeeds(trip: TripRow): string[] {
  const nights =
    trip.nights_min !== null && trip.nights_max !== null
      ? trip.nights_min === trip.nights_max
        ? `${trip.nights_min} nights`
        : `${trip.nights_min}–${trip.nights_max} nights`
      : trip.nights_min !== null
        ? `at least ${trip.nights_min} nights`
        : trip.nights_max !== null
          ? `up to ${trip.nights_max} nights`
          : null;
  const board = trip.board_basis as TripBoardBasis;
  return [
    nights,
    board !== "any" ? BOARD_LABELS[board] : null,
    trip.room_needs,
    trip.max_stops === 0
      ? "Direct flights only"
      : trip.max_stops !== null
        ? `Up to ${trip.max_stops} stop${trip.max_stops === 1 ? "" : "s"}`
        : null,
    trip.max_flight_minutes !== null
      ? `Flights up to ${formatDuration(trip.max_flight_minutes)}`
      : null,
    trip.require_free_cancellation ? "Free cancellation" : null,
  ].filter((x): x is string => !!x);
}

export function tripStatusChip(status: string): {
  tone: "info" | "ok" | "neutral";
  label: string;
} {
  if (status === "booked") return { tone: "ok", label: "Booked" };
  if (status === "archived") return { tone: "neutral", label: "Archived" };
  return { tone: "info", label: "Planning" };
}

/** Search dates for the brief: earliest departure, then the longest stay that fits the window. */
export function briefDates(trip: TripRow): {
  outbound: string;
  inbound: string;
} {
  const nights = trip.nights_max ?? trip.nights_min;
  const latest = nights ? addDays(trip.date_from, nights) : trip.date_to;
  const inbound = latest > trip.date_to ? trip.date_to : latest;
  return {
    outbound: trip.date_from,
    inbound: inbound <= trip.date_from ? addDays(trip.date_from, 1) : inbound,
  };
}
