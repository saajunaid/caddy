// Combine what the index card, the listing page and the calendar say into one snapshot,
// and hash it for change detection. Pure apart from hashing (node:crypto).
import { createHash } from "node:crypto";
import type { ListingPage } from "./parser.ts";
import { listingUrl } from "./parser.ts";
import type {
  IndexCard,
  ListingSnapshot,
  SourceStatus,
  UnitType,
} from "./types.ts";
import { parseBedroomsSummary, splitLocation } from "./values.ts";

/**
 * When a page has no readable unit table, its "Bedrooms" summary ("2 & 3 Bed") still says
 * which sizes exist. Those become unit types with type, rent and homes unknown.
 */
export function unitsFromSummary(bedroomsText: string | null): UnitType[] {
  return parseBedroomsSummary(bedroomsText).map((bedrooms) => ({
    label: bedrooms === 0 ? "Studio" : `${bedrooms} Bed`,
    bedrooms,
    property_type: "unknown" as const,
    rent_cents: null,
    homes: null,
  }));
}

export function buildSnapshot(input: {
  externalId: string;
  card: IndexCard | null;
  page: ListingPage | null;
  calendar?: { openingDate: string | null; closingDate: string | null } | null;
}): ListingSnapshot {
  const { externalId, card, page, calendar } = input;
  const addressText = page?.locationText ?? card?.locationText ?? null;
  const location = splitLocation(addressText);
  const pageUnits = page?.unitTypes ?? [];
  const fromSummary = pageUnits.length === 0;
  const unitTypes = fromSummary
    ? unitsFromSummary(page?.bedroomsText ?? null)
    : pageUnits;
  const sourceStatus: SourceStatus =
    page?.sourceStatus ?? card?.sourceStatus ?? "unknown";

  return {
    source: "newstarterhomes",
    externalId,
    url: card?.url ?? listingUrl(externalId),
    title: page?.title ?? card?.title ?? externalId,
    provider: page?.provider ?? null,
    addressText,
    locality: location.locality,
    county: page?.headerCounty ?? location.county,
    sourceStatus,
    statusText: page?.statusText ?? card?.statusText ?? null,
    openingDate: page?.openingDate ?? calendar?.openingDate ?? null,
    closingDate: page?.closingDate ?? calendar?.closingDate ?? null,
    closingText: page?.closingText ?? null,
    rentFromCents: page?.rentFromCents ?? card?.rentFromCents ?? null,
    bedroomsText: page?.bedroomsText ?? null,
    totalHomes: page?.totalHomes ?? null,
    unitTypes,
    unitTypesFromSummary: fromSummary && unitTypes.length > 0,
    applyUrl: page?.applyUrl ?? null,
    latitude: page?.latitude ?? null,
    longitude: page?.longitude ?? null,
    listedOn: card?.listedOn ?? null,
  };
}

/** JSON with object keys sorted, so equal content always serialises identically. */
export function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (value && typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>)
      .filter(([, v]) => v !== undefined)
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
    return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${canonicalJson(v)}`).join(",")}}`;
  }
  return JSON.stringify(value ?? null);
}

/**
 * Fields that don't describe the listing itself. The URL is derived from the slug, and the
 * map pin is tracked separately (it moves when providers tidy their pins).
 */
const VOLATILE: readonly (keyof ListingSnapshot)[] = [
  "url",
  "latitude",
  "longitude",
];

/** Stable content hash of a snapshot, ignoring volatile fields. */
export function snapshotHash(snapshot: ListingSnapshot): string {
  const stable: Partial<ListingSnapshot> = { ...snapshot };
  for (const key of VOLATILE) delete stable[key];
  return createHash("sha256").update(canonicalJson(stable)).digest("hex");
}
