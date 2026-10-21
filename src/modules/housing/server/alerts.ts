// Which housing alerts a daily run should send. Pure, no I/O.
// Dedupe keys are stable, so re-running a day (or a retry) never alerts twice.
import { daysBetween } from "../../../server/domain/dates.ts";
import { formatMoney } from "../../../server/domain/money.ts";
import { shortDate } from "./changes.ts";
import { listingMatch, matchSummary } from "./matching.ts";
import type { MatchLevel, UnitType } from "./types.ts";
import { CLOSING_SOON_DAYS } from "./upsert.ts";
import { parseBedroomsSummary } from "./values.ts";

export type AlertListing = {
  id: string;
  external_id: string;
  title: string;
  locality: string | null;
  county: string | null;
  status: string;
  matches: MatchLevel;
  closing_date: string | null;
  min_matching_rent_cents: number | null;
  unit_types: UnitType[];
  bedrooms_text: string | null;
};

export type AlertContext = {
  isNew: boolean;
  previousStatus: string | null;
  previousMatches: string | null;
};

export type HousingAlert = {
  kind: string;
  severity: "info" | "success" | "warning" | "critical";
  title: string;
  body: string;
  actionUrl: string;
  dedupeKey: string;
};

const ACTIVE = new Set(["open", "closing_soon", "coming_soon"]);

function place(listing: AlertListing): string {
  const where =
    listing.locality ?? (listing.county ? `Co. ${listing.county}` : null);
  return where ? `${listing.title}, ${where}` : listing.title;
}

function matchFor(listing: AlertListing) {
  return listingMatch(
    listing.unit_types,
    parseBedroomsSummary(listing.bedrooms_text),
  );
}

/** "4-bed", "3-bed house" or "" — the headline size of the match. */
function sizeLabel(listing: AlertListing): string {
  const { matchingUnits } = matchFor(listing);
  const beds = matchingUnits
    .map((u) => u.bedrooms)
    .filter((b): b is number => b !== null);
  const max = beds.length > 0 ? Math.max(...beds) : null;
  if (max !== null && max >= 4) return `${max}-bed`;
  if (max === 3) return "3-bed house";
  return "";
}

function details(listing: AlertListing, today: string): string {
  const parts: string[] = [];
  const { matchingUnits } = matchFor(listing);
  const summary = matchSummary(matchingUnits);
  if (summary) parts.push(summary);
  if (listing.min_matching_rent_cents !== null) {
    parts.push(
      `from ${formatMoney(listing.min_matching_rent_cents, "EUR", { wholeUnits: listing.min_matching_rent_cents % 100 === 0 })}/month`,
    );
  }
  if (listing.closing_date) {
    const days = daysBetween(today, listing.closing_date);
    parts.push(
      days >= 0
        ? `closes ${shortDate(listing.closing_date)}`
        : `closed ${shortDate(listing.closing_date)}`,
    );
  } else if (listing.status === "coming_soon") {
    parts.push("applications not open yet");
  } else {
    parts.push("closing date not stated");
  }
  return parts.join(" · ");
}

/**
 * Alerts for one listing after today's check:
 * - a new (or newly) matching or possible listing that isn't closed,
 * - a match closing within 7 days (once per listing per closing date),
 * - a match that reopens after being closed.
 */
export function alertsFor(
  listing: AlertListing,
  context: AlertContext,
  today: string,
): HousingAlert[] {
  if (listing.matches === "none") return [];
  const alerts: HousingAlert[] = [];
  const actionUrl = `/housing/${listing.id}`;
  const key = `housing:${listing.external_id}`;
  const active = ACTIVE.has(listing.status);

  const becameMatch =
    context.isNew ||
    context.previousMatches === null ||
    context.previousMatches === "none" ||
    (context.previousMatches === "possible" && listing.matches === "match");
  if (active && becameMatch) {
    const size = sizeLabel(listing);
    alerts.push(
      listing.matches === "match"
        ? {
            kind: "housing.match",
            severity: "success",
            title: `New ${size ? `${size} ` : ""}match: ${place(listing)}`,
            body: details(listing, today),
            actionUrl,
            dedupeKey: `${key}:match`,
          }
        : {
            kind: "housing.possible",
            severity: "info",
            title: `Possible match, check details: ${place(listing)}`,
            body: details(listing, today),
            actionUrl,
            dedupeKey: `${key}:possible`,
          },
    );
  }

  if (
    (listing.status === "open" || listing.status === "closing_soon") &&
    listing.closing_date
  ) {
    const days = daysBetween(today, listing.closing_date);
    if (days >= 0 && days <= CLOSING_SOON_DAYS) {
      alerts.push({
        kind: "housing.closing",
        severity: "warning",
        title:
          days === 0
            ? `Closes today: ${place(listing)}`
            : `Closes in ${days} day${days === 1 ? "" : "s"}: ${place(listing)}`,
        body: details(listing, today),
        actionUrl,
        dedupeKey: `${key}:closing:${listing.closing_date}`,
      });
    }
  }

  if (
    !context.isNew &&
    context.previousStatus === "closed" &&
    (listing.status === "open" ||
      listing.status === "closing_soon" ||
      listing.status === "coming_soon")
  ) {
    alerts.push({
      kind: "housing.reopened",
      severity: "success",
      title: `Reopened: ${place(listing)}`,
      body: details(listing, today),
      actionUrl,
      dedupeKey: `${key}:reopened:${today}`,
    });
  }
  return alerts;
}

/** Alert for a failed daily check, so silence is never mistaken for "nothing new". */
export function failureAlert(today: string, reason: string): HousingAlert {
  return {
    kind: "housing.check_failed",
    severity: "critical",
    title: "Housing check failed",
    body: reason.slice(0, 300),
    actionUrl: "/housing",
    dedupeKey: `housing:check-failed:${today}`,
  };
}
