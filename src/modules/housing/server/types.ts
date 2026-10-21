// Housing data shapes shared by the parser, the daily job and the app.
// Imported by scheduled jobs: type-only, no Next.js APIs (PLAN D26).

export type PropertyType = "house" | "apartment" | "duplex" | "unknown";

/** One row of a listing's "Properties Available" table, as published. Unknowns are null. */
export type UnitType = {
  label: string;
  bedrooms: number | null;
  property_type: PropertyType;
  rent_cents: number | null;
  homes: number | null;
};

export type MatchLevel = "match" | "possible" | "none";

/** Status as the source shows it. */
export type SourceStatus = "open" | "coming_soon" | "closed" | "unknown";

/** Status stored on the listing: the source status, with "closing_soon" when ≤ 7 days remain. */
export type ListingStatus = SourceStatus | "closing_soon";

/** Normalised facts about one listing, exactly as published. Nothing inferred. */
export type ListingSnapshot = {
  source: "newstarterhomes";
  externalId: string;
  url: string;
  title: string;
  provider: string | null;
  addressText: string | null;
  locality: string | null;
  county: string | null;
  sourceStatus: SourceStatus;
  statusText: string | null;
  openingDate: string | null;
  closingDate: string | null;
  closingText: string | null;
  rentFromCents: number | null;
  bedroomsText: string | null;
  totalHomes: number | null;
  unitTypes: UnitType[];
  /** True when unit types came only from the "Bedrooms" summary (no table on the page). */
  unitTypesFromSummary: boolean;
  applyUrl: string | null;
  latitude: number | null;
  longitude: number | null;
  listedOn: string | null;
};

/** One card on the /rent/ index page. */
export type IndexCard = {
  externalId: string;
  url: string;
  title: string;
  sourceStatus: SourceStatus;
  statusText: string | null;
  locationText: string | null;
  rentFromCents: number | null;
  listedOn: string | null;
};

export type IndexPage = {
  cards: IndexCard[];
  /** "Showing 1 to 12 of 203 properties" → 203. Null when the page doesn't say. */
  total: number | null;
  nextUrl: string | null;
};

/** Dates from the calendar view, keyed by listing slug. */
export type CalendarDates = Map<
  string,
  { openingDate: string | null; closingDate: string | null }
>;
