import "server-only";
import { createClient } from "@/lib/supabase/server";
import type { Database } from "@/lib/supabase/database.types";
import { dublinDate } from "@/server/domain/dates";
import type { FxRate } from "./server/currency";
import { isUuid } from "./server/forms";
import type {
  BoardBasis,
  CandidateStatus,
  ComponentKind,
  TripBoardBasis,
} from "./server/labels";
import {
  rankCandidates,
  type Brief,
  type CandidateInput,
  type Ranking,
  type Weights,
} from "./server/ranking";
import { candidateTotal, type Component } from "./server/totals";
import { partyOf, type Party, type Traveller } from "./server/travellers";

type Tables = Database["public"]["Tables"];
export type TripRow = Tables["trips"]["Row"];
export type TravellerRow = Tables["trip_travellers"]["Row"];
export type CandidateRow = Tables["trip_candidates"]["Row"];
type ComponentRow = Tables["trip_components"]["Row"];
type Supabase = Awaited<ReturnType<typeof createClient>>;

type RateRow = {
  id: string;
  currency: string;
  rate_date: string;
  rate: string;
};

const RATE_COLUMNS = "id, currency, rate_date, rate::text";
const COMPONENT_SELECT = `*, fx_rates(${RATE_COLUMNS})`;

const toRate = (row: RateRow): FxRate => ({
  id: row.id,
  currency: row.currency,
  rateDate: row.rate_date,
  rate: row.rate,
});

const KIND_ORDER: Record<ComponentKind, number> = {
  flight: 0,
  accommodation: 1,
  transfer: 2,
  car_hire: 3,
  insurance: 4,
  meals: 5,
  activities: 6,
  other: 7,
};

export function toComponent(
  row: ComponentRow & { fx_rates?: RateRow | null },
): Component {
  return {
    id: row.id,
    kind: row.kind as ComponentKind,
    provider: row.provider,
    description: row.description,
    priceMinor: row.price_minor,
    currency: row.currency,
    fxRate: row.fx_rates ? toRate(row.fx_rates) : null,
    isEstimate: row.is_estimate,
    includes: row.includes,
    excludes: row.excludes,
    bookingUrl: row.booking_url,
    cancellationTerms: row.cancellation_terms,
    freeCancellation: row.free_cancellation,
    boardBasis: row.board_basis as BoardBasis | null,
    stops: row.stops,
    durationMinutes: row.duration_minutes,
    checkedAt: row.checked_at,
  };
}

const byKind = (a: Component, b: Component) =>
  KIND_ORDER[a.kind] - KIND_ORDER[b.kind] ||
  a.checkedAt.localeCompare(b.checkedAt);

/** The latest rate on or before a date for one currency (null if there is none). */
export async function latestRateOnOrBefore(
  supabase: Supabase,
  currency: string,
  date: string,
): Promise<FxRate | null> {
  const { data, error } = await supabase
    .from("fx_rates")
    .select(RATE_COLUMNS)
    .eq("currency", currency)
    .lte("rate_date", date)
    .order("rate_date", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw new Error(`Couldn't load exchange rates: ${error.message}`);
  return data ? toRate(data as RateRow) : null;
}

/** Rates for non-euro components that don't have a pinned rate yet. */
async function ratesFor(
  supabase: Supabase,
  components: readonly Component[],
): Promise<FxRate[]> {
  const needs = new Map<string, { currency: string; date: string }>();
  for (const c of components) {
    if (c.currency === "EUR" || c.fxRate) continue;
    const date = dublinDate(new Date(c.checkedAt));
    needs.set(`${c.currency}:${date}`, { currency: c.currency, date });
  }
  const found = await Promise.all(
    [...needs.values()].map((n) =>
      latestRateOnOrBefore(supabase, n.currency, n.date),
    ),
  );
  return found.filter((r): r is FxRate => r !== null);
}

export function briefOf(trip: TripRow): Brief {
  return {
    dateFrom: trip.date_from,
    dateTo: trip.date_to,
    nightsMin: trip.nights_min,
    nightsMax: trip.nights_max,
    boardBasis: trip.board_basis as TripBoardBasis,
    maxStops: trip.max_stops,
    maxFlightMinutes: trip.max_flight_minutes,
    requireFreeCancellation: trip.require_free_cancellation,
  };
}

const toTraveller = (t: TravellerRow): Traveller => ({
  name: t.name,
  isChild: t.is_child,
  ageAtTravel: t.age_at_travel,
  confirmed: t.confirmed,
});

const travellerOrder = (a: TravellerRow, b: TravellerRow) =>
  Number(a.is_child) - Number(b.is_child) ||
  a.created_at.localeCompare(b.created_at);

export type TripDetail = {
  trip: TripRow;
  travellers: TravellerRow[];
  party: Party;
  candidates: (CandidateRow & { components: Component[] })[];
  ranking: Ranking;
};

type TripWithChildren = TripRow & {
  trip_travellers: TravellerRow[];
  trip_candidates: (CandidateRow & {
    trip_components: (ComponentRow & { fx_rates: RateRow | null })[];
  })[];
};

async function buildDetail(
  supabase: Supabase,
  trip: TripWithChildren,
  weights?: Weights,
): Promise<TripDetail> {
  const { trip_travellers, trip_candidates, ...row } = trip;
  const travellers = [...trip_travellers].sort(travellerOrder);
  const party = partyOf(travellers.map(toTraveller));
  const candidates = [...trip_candidates]
    .sort((a, b) => a.created_at.localeCompare(b.created_at))
    .map(({ trip_components, ...c }) => ({
      ...c,
      components: trip_components.map(toComponent).sort(byKind),
    }));
  const rates = await ratesFor(
    supabase,
    candidates.flatMap((c) => c.components),
  );
  const inputs: CandidateInput[] = candidates.map((c) => ({
    id: c.id,
    destination: c.destination,
    outboundDate: c.outbound_date,
    returnDate: c.return_date,
    nights: c.nights ?? 0,
    status: c.status as CandidateStatus,
    components: c.components,
    total: candidateTotal(c.components, rates, {
      travellers: travellers.length,
      budgetCents: row.budget_cents,
    }),
  }));
  return {
    trip: row,
    travellers,
    party,
    candidates,
    ranking: rankCandidates(briefOf(row), inputs, weights),
  };
}

const TRIP_SELECT = `*, trip_travellers(*), trip_candidates(*, trip_components(${COMPONENT_SELECT}))`;

/** One trip with everything needed to compare its options, or null if it isn't visible. */
export async function loadTrip(
  id: string,
  weights?: Weights,
): Promise<TripDetail | null> {
  if (!isUuid(id)) return null;
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("trips")
    .select(TRIP_SELECT)
    .eq("id", id)
    .maybeSingle();
  if (error) throw new Error(`Couldn't load this trip: ${error.message}`);
  if (!data) return null;
  return buildDetail(supabase, data as unknown as TripWithChildren, weights);
}

/** Every trip with its best option so far, soonest first. */
export async function loadTrips(): Promise<TripDetail[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("trips")
    .select(TRIP_SELECT)
    .order("date_from", { ascending: true });
  if (error) throw new Error(`Couldn't load trips: ${error.message}`);
  return Promise.all(
    (data as unknown as TripWithChildren[]).map((trip) =>
      buildDetail(supabase, trip),
    ),
  );
}

export type MemberOption = {
  id: string;
  name: string;
  isChild: boolean;
  dateOfBirth: string | null;
};

export async function loadMembers(): Promise<MemberOption[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("household_members")
    .select("id, display_name, relationship, date_of_birth")
    .eq("is_active", true)
    .order("created_at");
  if (error)
    throw new Error(`Couldn't load household members: ${error.message}`);
  return data.map((m) => ({
    id: m.id,
    name: m.display_name,
    isChild: m.relationship === "child",
    dateOfBirth: m.date_of_birth,
  }));
}

export type LatestRates = {
  /** Most recent ECB date stored, if any. */
  date: string | null;
  rates: Record<string, string>;
};

/** The newest day of ECB rates, for the live preview in the price form. */
export async function loadLatestRates(): Promise<LatestRates> {
  const supabase = await createClient();
  const latest = await supabase
    .from("fx_rates")
    .select("rate_date")
    .order("rate_date", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (latest.error)
    throw new Error(`Couldn't load exchange rates: ${latest.error.message}`);
  if (!latest.data) return { date: null, rates: {} };
  const { data, error } = await supabase
    .from("fx_rates")
    .select("currency, rate::text")
    .eq("rate_date", latest.data.rate_date);
  if (error) throw new Error(`Couldn't load exchange rates: ${error.message}`);
  return {
    date: latest.data.rate_date,
    rates: Object.fromEntries(
      (data as unknown as { currency: string; rate: string }[]).map((r) => [
        r.currency,
        r.rate,
      ]),
    ),
  };
}

/** One component row (for the edit form), checked against its candidate and trip. */
export async function loadComponent(
  tripId: string,
  candidateId: string,
  componentId: string,
): Promise<Component | null> {
  if (![tripId, candidateId, componentId].every(isUuid)) return null;
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("trip_components")
    .select(`${COMPONENT_SELECT}, trip_candidates!inner(trip_id)`)
    .eq("id", componentId)
    .eq("candidate_id", candidateId)
    .eq("trip_candidates.trip_id", tripId)
    .maybeSingle();
  if (error) throw new Error(`Couldn't load this price: ${error.message}`);
  return data
    ? toComponent(
        data as unknown as ComponentRow & { fx_rates: RateRow | null },
      )
    : null;
}
