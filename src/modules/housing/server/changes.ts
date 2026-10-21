// Human summaries of what changed between two snapshots of a listing. Pure, no I/O.
import { formatMoney } from "../../../server/domain/money.ts";
import type { ListingSnapshot, SourceStatus, UnitType } from "./types.ts";

const dayMonth = new Intl.DateTimeFormat("en-IE", {
  timeZone: "UTC",
  day: "numeric",
  month: "short",
});

/** "2026-11-06" → "6 Nov". */
export function shortDate(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  return dayMonth.format(new Date(Date.UTC(y, m - 1, d)));
}

const euro = (cents: number | null) =>
  cents === null
    ? "not stated"
    : formatMoney(cents, "EUR", { wholeUnits: cents % 100 === 0 });

const STATUS_WORDS: Record<SourceStatus, string> = {
  open: "open",
  coming_soon: "coming soon",
  closed: "closed",
  unknown: "unknown",
};

function unitKey(unit: UnitType, index: number, all: UnitType[]): string {
  const base = unit.label.toLowerCase().replace(/\s+/g, " ").trim();
  // Two rows can share a label (e.g. two "2 Bed Apartment" rows); number repeats.
  const repeat = all
    .slice(0, index)
    .filter(
      (u) => u.label.toLowerCase().replace(/\s+/g, " ").trim() === base,
    ).length;
  return repeat === 0 ? base : `${base}#${repeat + 1}`;
}

function describeDate(
  what: string,
  before: string | null,
  after: string | null,
): string | null {
  if (before === after) return null;
  if (!before && after) return `${what} set to ${shortDate(after)}`;
  if (before && !after) return `${what} no longer shown`;
  return `${what} changed ${shortDate(before!)} → ${shortDate(after!)}`;
}

/** Change lines, most important first. Empty for a first sighting or identical content. */
export function describeChanges(
  before: ListingSnapshot | null,
  after: ListingSnapshot,
): string[] {
  if (!before) return [];
  const lines: string[] = [];

  if (before.sourceStatus !== after.sourceStatus) {
    lines.push(
      before.sourceStatus === "closed" && after.sourceStatus === "open"
        ? "Applications reopened"
        : after.sourceStatus === "open"
          ? "Applications opened"
          : `Status changed to ${STATUS_WORDS[after.sourceStatus]}`,
    );
  }
  const closing = describeDate(
    "Closing date",
    before.closingDate,
    after.closingDate,
  );
  if (closing) lines.push(closing);
  const opening = describeDate(
    "Opening date",
    before.openingDate,
    after.openingDate,
  );
  if (opening) lines.push(opening);

  const beforeUnits = new Map(
    before.unitTypes.map((u, i, all) => [unitKey(u, i, all), u] as const),
  );
  const afterUnits = new Map(
    after.unitTypes.map((u, i, all) => [unitKey(u, i, all), u] as const),
  );
  for (const [key, unit] of afterUnits) {
    const old = beforeUnits.get(key);
    if (!old) {
      lines.push(
        `Added ${unit.label}${unit.rent_cents !== null ? ` at ${euro(unit.rent_cents)}` : ""}`,
      );
      continue;
    }
    if (old.rent_cents !== unit.rent_cents) {
      lines.push(
        `Rent for ${unit.label} changed ${euro(old.rent_cents)} → ${euro(unit.rent_cents)}`,
      );
    }
    if (old.homes !== unit.homes) {
      lines.push(
        `Homes for ${unit.label} changed ${old.homes ?? "not stated"} → ${unit.homes ?? "not stated"}`,
      );
    }
  }
  for (const [key, unit] of beforeUnits) {
    if (!afterUnits.has(key)) lines.push(`Removed ${unit.label}`);
  }

  if (before.rentFromCents !== after.rentFromCents) {
    lines.push(
      `Starting rent changed ${euro(before.rentFromCents)} → ${euro(after.rentFromCents)}`,
    );
  }
  if (before.totalHomes !== after.totalHomes) {
    lines.push(
      `Homes available changed ${before.totalHomes ?? "not stated"} → ${after.totalHomes ?? "not stated"}`,
    );
  }
  if (before.title !== after.title) lines.push(`Renamed to “${after.title}”`);
  if (before.addressText !== after.addressText && after.addressText) {
    lines.push(`Location changed to ${after.addressText}`);
  }
  if (before.provider !== after.provider) {
    lines.push(
      after.provider
        ? `Provider shown as ${after.provider}`
        : "Provider no longer shown",
    );
  }
  if (before.applyUrl !== after.applyUrl) {
    lines.push(
      after.applyUrl ? "Application link updated" : "Application link removed",
    );
  }
  if (before.listedOn !== after.listedOn && after.listedOn) {
    lines.push(`Listed date changed to ${shortDate(after.listedOn)}`);
  }
  if (lines.length === 0) lines.push("Listing details updated");
  return lines;
}
