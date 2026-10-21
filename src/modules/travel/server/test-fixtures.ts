// Synthetic trip data for unit tests. Not real prices or bookings.
import type { FxRate } from "./currency.ts";
import type { CandidateInput } from "./ranking.ts";
import { candidateTotal, type Component } from "./totals.ts";

let next = 0;

export function component(fields: Partial<Component> = {}): Component {
  next += 1;
  return {
    id: `comp-${next}`,
    kind: "other",
    provider: "Provider",
    description: null,
    priceMinor: 10000,
    currency: "EUR",
    fxRate: null,
    isEstimate: false,
    includes: null,
    excludes: null,
    bookingUrl: null,
    cancellationTerms: null,
    freeCancellation: null,
    boardBasis: null,
    stops: null,
    durationMinutes: null,
    checkedAt: "2026-10-12T09:00:00Z",
    ...fields,
  };
}

export function candidate(
  id: string,
  components: Component[],
  fields: Partial<Omit<CandidateInput, "components" | "total">> = {},
  rates: FxRate[] = [],
  travellers = 4,
): CandidateInput {
  return {
    id,
    destination: id,
    outboundDate: "2027-02-14",
    returnDate: "2027-02-20",
    nights: 6,
    status: "option",
    ...fields,
    components,
    total: candidateTotal(components, rates, {
      travellers,
      budgetCents: 320000,
    }),
  };
}
