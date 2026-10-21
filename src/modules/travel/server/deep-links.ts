// Prefilled search links to sites the family uses. Caddy never fetches these pages: it only
// builds URLs that open in a new tab, where the family does the searching. Pure, no I/O.
import type { IsoDate } from "../../../server/domain/dates.ts";
import type { Party } from "./travellers.ts";

const IATA = /^[A-Z]{3}$/;

/** A 3-letter airport code if `value` is one ("dub" → "DUB"), else null. */
export function iataCode(value: string | null | undefined): string | null {
  const code = value?.trim().toUpperCase() ?? "";
  return IATA.test(code) ? code : null;
}

/** "2027-02-14" → "270214" (Skyscanner's date format). */
export function yymmdd(date: IsoDate): string {
  return date.slice(2).replaceAll("-", "");
}

export type FlightSearch = {
  /** Departure airport code or place name. */
  from: string;
  /** Destination airport code or place name; null searches everywhere. */
  to: string | null;
  outbound: IsoDate;
  inbound: IsoDate;
  party: Party;
};

function adultsOf(party: Party): number {
  return Math.max(1, party.adults);
}

/**
 * Skyscanner: /transport/flights/<from>/<to>/<yymmdd>/<yymmdd>/?adultsv2=N&childrenv2=8|4.
 * Needs airport codes; without a destination code it opens the "everywhere" search.
 * Returns null when the departure isn't an airport code.
 */
export function skyscannerUrl(search: FlightSearch): string | null {
  const from = iataCode(search.from);
  if (!from) return null;
  const to = iataCode(search.to);
  const dates = `${yymmdd(search.outbound)}/${yymmdd(search.inbound)}`;
  const path = to
    ? `transport/flights/${from.toLowerCase()}/${to.toLowerCase()}/${dates}/`
    : `transport/flights-from/${from.toLowerCase()}/${dates}/`;
  const params = new URLSearchParams({
    adultsv2: String(adultsOf(search.party)),
  });
  if (search.party.childAges.length > 0) {
    params.set("childrenv2", search.party.childAges.join("|"));
  }
  return `https://www.skyscanner.ie/${path}?${params}`;
}

const plural = (n: number, one: string, many: string) =>
  `${n} ${n === 1 ? one : many}`;

/**
 * Google Flights natural-language query, e.g.
 * "Flights from DUB to FAO on 2027-02-14 returning 2027-02-21 for 2 adults and 2 children".
 */
export function googleFlightsUrl(search: FlightSearch): string {
  const from = iataCode(search.from) ?? search.from.trim();
  const to = search.to ? (iataCode(search.to) ?? search.to.trim()) : null;
  const who =
    search.party.children > 0
      ? `${plural(adultsOf(search.party), "adult", "adults")} and ${plural(search.party.children, "child", "children")}`
      : plural(adultsOf(search.party), "adult", "adults");
  const q = `Flights from ${from}${to ? ` to ${to}` : ""} on ${search.outbound} returning ${search.inbound} for ${who}`;
  return `https://www.google.com/travel/flights?q=${encodeURIComponent(q)}`;
}

export type StaySearch = {
  /** Place name typed into Booking.com's search box; null leaves it empty. */
  destination: string | null;
  checkin: IsoDate;
  checkout: IsoDate;
  party: Party;
};

/** Booking.com search results with dates, occupancy and children's ages (one room). */
export function bookingUrl(search: StaySearch): string {
  const params = new URLSearchParams();
  if (search.destination?.trim()) params.set("ss", search.destination.trim());
  params.set("checkin", search.checkin);
  params.set("checkout", search.checkout);
  params.set("group_adults", String(adultsOf(search.party)));
  params.set("group_children", String(search.party.children));
  for (const age of search.party.childAges) params.append("age", String(age));
  params.set("no_rooms", "1");
  return `https://www.booking.com/searchresults.html?${params}`;
}

export const DFA_ADVICE_INDEX =
  "https://www.ireland.ie/en/dfa/overseas-travel/advice/";

/**
 * Countries offered in the option form, with the Irish Department of Foreign Affairs travel
 * advice page slug. Slugs Caddy couldn't confirm are null and link to the advice index instead.
 */
export const COUNTRIES: readonly {
  code: string;
  name: string;
  slug: string | null;
}[] = [
  { code: "AT", name: "Austria", slug: "austria" },
  { code: "BE", name: "Belgium", slug: "belgium" },
  { code: "HR", name: "Croatia", slug: "croatia" },
  { code: "CY", name: "Cyprus", slug: "cyprus" },
  { code: "CZ", name: "Czechia", slug: null },
  { code: "DK", name: "Denmark", slug: "denmark" },
  { code: "EG", name: "Egypt", slug: "egypt" },
  { code: "FI", name: "Finland", slug: "finland" },
  { code: "FR", name: "France", slug: "france" },
  { code: "DE", name: "Germany", slug: "germany" },
  { code: "GR", name: "Greece", slug: "greece" },
  { code: "HU", name: "Hungary", slug: "hungary" },
  { code: "IS", name: "Iceland", slug: "iceland" },
  { code: "IN", name: "India", slug: "india" },
  { code: "ID", name: "Indonesia", slug: "indonesia" },
  { code: "IT", name: "Italy", slug: "italy" },
  { code: "JP", name: "Japan", slug: "japan" },
  { code: "JO", name: "Jordan", slug: "jordan" },
  { code: "MY", name: "Malaysia", slug: "malaysia" },
  { code: "MV", name: "Maldives", slug: "maldives" },
  { code: "MT", name: "Malta", slug: "malta" },
  { code: "MA", name: "Morocco", slug: "morocco" },
  { code: "NL", name: "Netherlands", slug: "netherlands" },
  { code: "NO", name: "Norway", slug: "norway" },
  { code: "PK", name: "Pakistan", slug: "pakistan" },
  { code: "PL", name: "Poland", slug: "poland" },
  { code: "PT", name: "Portugal", slug: "portugal" },
  { code: "QA", name: "Qatar", slug: "qatar" },
  { code: "SA", name: "Saudi Arabia", slug: "saudi-arabia" },
  { code: "ES", name: "Spain", slug: "spain" },
  { code: "LK", name: "Sri Lanka", slug: "sri-lanka" },
  { code: "SE", name: "Sweden", slug: "sweden" },
  { code: "CH", name: "Switzerland", slug: "switzerland" },
  { code: "TH", name: "Thailand", slug: "thailand" },
  { code: "TN", name: "Tunisia", slug: "tunisia" },
  { code: "TR", name: "Türkiye", slug: null },
  { code: "AE", name: "United Arab Emirates", slug: "united-arab-emirates" },
  { code: "GB", name: "United Kingdom", slug: null },
  { code: "US", name: "United States", slug: null },
];

export function countryName(code: string | null | undefined): string | null {
  return COUNTRIES.find((c) => c.code === code)?.name ?? null;
}

/** The DFA travel advice page for a country, or the advice index if Caddy has no page for it. */
export function dfaAdviceUrl(countryCode: string | null | undefined): string {
  const slug = COUNTRIES.find((c) => c.code === countryCode)?.slug;
  return slug ? `${DFA_ADVICE_INDEX}${slug}/` : DFA_ADVICE_INDEX;
}
