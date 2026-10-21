// Presentation rules for the Housing screens. Pure, no I/O, unit-tested.
import type { Tone } from "@/components/ui/status";
import { daysBetween, dublinDate } from "@/server/domain/dates";
import { formatMoney } from "@/server/domain/money";
import { shortDate } from "./server/changes";
import { listingMatch, matchSummary } from "./server/matching";
import type { MatchLevel, UnitType } from "./server/types";
import { parseBedroomsSummary } from "./server/values";

export type ListingSummary = {
  id: string;
  title: string;
  url: string;
  provider: string | null;
  address_text: string | null;
  locality: string | null;
  county: string | null;
  status: string;
  closing_date: string | null;
  opening_date: string | null;
  unit_types: UnitType[];
  bedrooms_text: string | null;
  matches: MatchLevel;
  min_matching_rent_cents: number | null;
  rent_from_cents: number | null;
  first_seen_at: string;
  last_checked_at: string;
  missing_note: string | null;
  application_status: string | null;
};

export const ACTIVE_STATUSES = ["open", "closing_soon", "coming_soon"] as const;

export function isActive(listing: Pick<ListingSummary, "status">): boolean {
  return (ACTIVE_STATUSES as readonly string[]).includes(listing.status);
}

export function daysToClose(
  listing: Pick<ListingSummary, "closing_date">,
  today: string,
): number | null {
  return listing.closing_date ? daysBetween(today, listing.closing_date) : null;
}

/** The status chip: label and meaning colour, recomputed for today. */
export function statusBadge(
  listing: Pick<ListingSummary, "status" | "closing_date" | "opening_date">,
  today: string,
): { label: string; tone: Tone } {
  const days = daysToClose(listing, today);
  switch (listing.status) {
    case "open":
    case "closing_soon":
      if (days === null)
        return { label: "Open · closing date not stated", tone: "ok" };
      if (days < 0)
        return {
          label: `Open · deadline ${dateLabel(listing.closing_date!, today)} passed`,
          tone: "review",
        };
      if (days === 0) return { label: "Closes today", tone: "due" };
      if (days <= 7)
        return {
          label: `Closes in ${days} day${days === 1 ? "" : "s"}`,
          tone: "due",
        };
      return {
        label: `Open · closes ${dateLabel(listing.closing_date!, today)}`,
        tone: "ok",
      };
    case "coming_soon":
      return {
        label: listing.opening_date
          ? `Opens ${dateLabel(listing.opening_date, today)}`
          : "Coming soon",
        tone: "info",
      };
    case "closed":
      return {
        label: listing.closing_date
          ? `Closed ${dateLabel(listing.closing_date, today)}`
          : "Closed",
        tone: "bad",
      };
    default:
      return { label: "Status unknown", tone: "review" };
  }
}

const APPLICATION: Record<string, { label: string; tone: Tone }> = {
  not_applied: { label: "Not applied", tone: "neutral" },
  applied: { label: "Applied", tone: "primary" },
  lottery_entered: { label: "Lottery entered", tone: "info" },
  offered: { label: "Offered", tone: "ok" },
  accepted: { label: "Accepted", tone: "ok" },
  declined: { label: "Declined", tone: "neutral" },
  unsuccessful: { label: "Unsuccessful", tone: "neutral" },
  withdrawn: { label: "Withdrawn", tone: "neutral" },
};

export const APPLICATION_STATUSES = Object.keys(APPLICATION);

export function applicationBadge(status: string | null): {
  label: string;
  tone: Tone;
} {
  return APPLICATION[status ?? "not_applied"] ?? APPLICATION.not_applied;
}

export function hasApplied(
  listing: Pick<ListingSummary, "application_status">,
): boolean {
  return (
    !!listing.application_status && listing.application_status !== "not_applied"
  );
}

export const MATCH_BADGE: Record<MatchLevel, { label: string; tone: Tone }> = {
  match: { label: "Match", tone: "ok" },
  possible: { label: "Possible", tone: "review" },
  none: { label: "No", tone: "neutral" },
};

function matchFor(
  listing: Pick<ListingSummary, "unit_types" | "bedrooms_text">,
) {
  return listingMatch(
    listing.unit_types,
    parseBedroomsSummary(listing.bedrooms_text),
  );
}

/** "3 bed house · 4 bed duplex", or the bedroom summary for listings that don't match. */
export function homesSummary(
  listing: Pick<ListingSummary, "unit_types" | "bedrooms_text" | "matches">,
): string {
  if (listing.matches !== "none") {
    const summary = matchSummary(matchFor(listing).matchingUnits);
    if (summary) return summary;
    return "Bedrooms not stated";
  }
  return listing.bedrooms_text
    ? `${listing.bedrooms_text} · no match`
    : "No match";
}

/**
 * Lowest relevant rent in cents: the cheapest matching home if there is one, otherwise the
 * cheapest home in the unit table. The site's own "starting from" figure is a fallback only
 * (it is sometimes mistyped, e.g. €146,250).
 */
export function rentFrom(
  listing: Pick<
    ListingSummary,
    "min_matching_rent_cents" | "unit_types" | "rent_from_cents"
  >,
): number | null {
  if (listing.min_matching_rent_cents !== null)
    return listing.min_matching_rent_cents;
  const rents = listing.unit_types
    .map((u) => u.rent_cents)
    .filter((r): r is number => r !== null);
  if (rents.length > 0) return Math.min(...rents);
  return listing.rent_from_cents !== null && listing.rent_from_cents < 1_000_000
    ? listing.rent_from_cents
    : null;
}

/** First seen on the household's calendar day (Dublin). */
export function isNewToday(
  listing: Pick<ListingSummary, "first_seen_at">,
  today: string,
): boolean {
  return dublinDate(new Date(listing.first_seen_at)) === today;
}

/** "6 Nov" this year, "4 Sep 2024" otherwise. */
export function dateLabel(iso: string, today: string): string {
  return iso.slice(0, 4) === today.slice(0, 4)
    ? shortDate(iso)
    : `${shortDate(iso)} ${iso.slice(0, 4)}`;
}

/** "Today", "Yesterday" or "12 Oct" for an instant, in Dublin time. */
export function dayLabel(instant: string, today: string): string {
  const day = dublinDate(new Date(instant));
  const diff = daysBetween(day, today);
  if (diff === 0) return "Today";
  if (diff === 1) return "Yesterday";
  return dateLabel(day, today);
}

export function euro(cents: number): string {
  return formatMoney(cents, "EUR", { wholeUnits: cents % 100 === 0 });
}

export function place(
  listing: Pick<ListingSummary, "address_text" | "locality" | "county">,
): string {
  return (
    listing.address_text ??
    ([listing.locality, listing.county ? `Co. ${listing.county}` : null]
      .filter(Boolean)
      .join(", ") ||
      "Location not stated")
  );
}

// Filters ---------------------------------------------------------------------------------
export const FILTERS = [
  { id: "matches", label: "Open matches" },
  { id: "closing", label: "Closing soon" },
  { id: "applied", label: "Applied" },
  { id: "closed", label: "Closed" },
  { id: "all", label: "All" },
] as const;

export type FilterId = (typeof FILTERS)[number]["id"];

export function parseFilter(value: unknown): FilterId {
  return FILTERS.some((f) => f.id === value) ? (value as FilterId) : "matches";
}

export function inFilter(
  listing: ListingSummary,
  filter: FilterId,
  today: string,
): boolean {
  const matching = listing.matches !== "none";
  switch (filter) {
    case "matches":
      return isActive(listing) && matching;
    case "closing": {
      const days = daysToClose(listing, today);
      return (
        (listing.status === "open" || listing.status === "closing_soon") &&
        matching &&
        days !== null &&
        days >= 0 &&
        days <= 7
      );
    }
    case "applied":
      return hasApplied(listing);
    case "closed":
      return listing.status === "closed" && (matching || hasApplied(listing));
    case "all":
      return true;
  }
}

// Sorting ---------------------------------------------------------------------------------
export const SORTS = ["first_seen", "rent", "closes", "title"] as const;
export type SortId = (typeof SORTS)[number];

export function parseSort(value: unknown): SortId {
  return (SORTS as readonly unknown[]).includes(value)
    ? (value as SortId)
    : "first_seen";
}

export function parseDir(value: unknown, sort: SortId): "asc" | "desc" {
  if (value === "asc" || value === "desc") return value;
  return sort === "first_seen" ? "desc" : "asc";
}

/** Sort a copy. Unknown values (no rent, no closing date) always go last. */
export function sortListings(
  listings: readonly ListingSummary[],
  sort: SortId,
  dir: "asc" | "desc",
): ListingSummary[] {
  const sign = dir === "asc" ? 1 : -1;
  const key = (l: ListingSummary): string | number | null => {
    switch (sort) {
      case "rent":
        return rentFrom(l);
      case "closes":
        return l.closing_date;
      case "title":
        return l.title.toLowerCase();
      case "first_seen":
        return l.first_seen_at;
    }
  };
  return [...listings].sort((a, b) => {
    const ka = key(a);
    const kb = key(b);
    if (ka === null && kb === null) return a.title.localeCompare(b.title);
    if (ka === null) return 1;
    if (kb === null) return -1;
    if (ka < kb) return -sign;
    if (ka > kb) return sign;
    return a.title.localeCompare(b.title);
  });
}

/** Distinct counties, alphabetically, for the county filter. */
export function countiesOf(
  listings: readonly Pick<ListingSummary, "county">[],
): string[] {
  return [
    ...new Set(listings.map((l) => l.county).filter((c): c is string => !!c)),
  ].sort();
}
