/**
 * Annual usage profile from the household's own bill periods. Never national averages:
 * no usage means no profile. Pure.
 */
import { daysBetween, type IsoDate } from "../../../../server/domain/dates.ts";
import { add, div, int, isZero, mul, ZERO, type Exact } from "./exact.ts";
import { formatKwh, monthRange, plural } from "./format.ts";
import { BAND_LABELS, BANDS, type Band } from "./types.ts";

/** Below this many days of bills, results are labelled "Estimate (limited data)". */
export const MIN_COVERAGE_DAYS = 60;
export const DAYS_PER_YEAR = 365;

export type UsagePeriod = {
  periodStart: IsoDate;
  /** Inclusive, as printed on Irish bills ("1 Sep – 30 Sep"). */
  periodEnd: IsoDate;
  /** kWh per band. A missing band means "not on this bill", not zero. */
  kwh: Partial<Record<Band, Exact>>;
};

export type UsageProfile = {
  /** Bands with recorded usage, in a fixed order. */
  bands: Band[];
  /** kWh per year per band: recorded kWh scaled from that band's days to 365. */
  annualKwh: Partial<Record<Band, Exact>>;
  recordedKwh: Partial<Record<Band, Exact>>;
  /** Days of bills behind each band. */
  bandDays: Partial<Record<Band, number>>;
  /** Calendar days covered by at least one bill period. */
  coveredDays: number;
  from: IsoDate | null;
  to: IsoDate | null;
  periodCount: number;
  /** Bands the meter should record but no bill has. Costs would be understated. */
  missingBands: Band[];
  /** Fewer than 60 days of bills. */
  limited: boolean;
  /** Some bill periods overlap (more than a shared boundary day). */
  overlapping: boolean;
};

export function periodDays(period: {
  periodStart: IsoDate;
  periodEnd: IsoDate;
}): number {
  return daysBetween(period.periodStart, period.periodEnd) + 1;
}

/** Days covered by the union of the periods, and whether any overlap beyond a boundary day. */
function coverage(periods: readonly UsagePeriod[]): {
  days: number;
  overlapping: boolean;
} {
  const sorted = [...periods].sort((a, b) =>
    a.periodStart.localeCompare(b.periodStart),
  );
  let days = 0;
  let overlapping = false;
  let currentStart: IsoDate | null = null;
  let currentEnd: IsoDate | null = null;
  for (const p of sorted) {
    if (currentStart === null || currentEnd === null) {
      [currentStart, currentEnd] = [p.periodStart, p.periodEnd];
      continue;
    }
    if (p.periodStart <= currentEnd) {
      // Meter-read bills often share the boundary day; anything more is a real overlap.
      if (p.periodStart < currentEnd) overlapping = true;
      if (p.periodEnd > currentEnd) currentEnd = p.periodEnd;
      continue;
    }
    days += daysBetween(currentStart, currentEnd) + 1;
    [currentStart, currentEnd] = [p.periodStart, p.periodEnd];
  }
  if (currentStart !== null && currentEnd !== null) {
    days += daysBetween(currentStart, currentEnd) + 1;
  }
  return { days, overlapping };
}

export function usageProfile(
  periods: readonly UsagePeriod[],
  expected: readonly Band[] = [],
): UsageProfile {
  const recordedKwh: Partial<Record<Band, Exact>> = {};
  const bandDays: Partial<Record<Band, number>> = {};
  for (const period of periods) {
    const days = periodDays(period);
    if (days <= 0) throw new Error("A bill period must end after it starts");
    for (const band of BANDS) {
      const kwh = period.kwh[band];
      if (kwh === undefined) continue;
      recordedKwh[band] = add(recordedKwh[band] ?? ZERO, kwh);
      bandDays[band] = (bandDays[band] ?? 0) + days;
    }
  }
  const annualKwh: Partial<Record<Band, Exact>> = {};
  const bands: Band[] = [];
  for (const band of BANDS) {
    const kwh = recordedKwh[band];
    const days = bandDays[band];
    if (kwh === undefined || !days) continue;
    bands.push(band);
    annualKwh[band] = div(mul(kwh, int(DAYS_PER_YEAR)), int(days));
  }
  const { days, overlapping } = coverage(periods);
  const starts = periods.map((p) => p.periodStart).sort();
  const ends = periods.map((p) => p.periodEnd).sort();
  return {
    bands,
    annualKwh,
    recordedKwh,
    bandDays,
    coveredDays: days,
    from: starts[0] ?? null,
    to: ends.at(-1) ?? null,
    periodCount: periods.length,
    missingBands: expected.filter((band) => !bands.includes(band)),
    limited: periods.length > 0 && days < MIN_COVERAGE_DAYS,
    overlapping,
  };
}

/** Bands with non-zero annual usage: an offer must price every one of them. */
export function usedBands(profile: UsageProfile): Band[] {
  return profile.bands.filter((band) => {
    const kwh = profile.annualKwh[band];
    return kwh !== undefined && !isZero(kwh);
  });
}

/** "Based on 312 days of bills, Sept 2025–Aug 2026, scaled to a full year." */
export function coverageSentence(profile: UsageProfile): string {
  if (!profile.from || !profile.to) return "No usage entered yet.";
  const range = monthRange(profile.from, profile.to);
  const scale =
    profile.coveredDays === DAYS_PER_YEAR
      ? ""
      : profile.coveredDays < DAYS_PER_YEAR
        ? ", scaled up to a full year (seasonal differences aren't adjusted)"
        : ", averaged to one year";
  return `Based on ${plural(profile.coveredDays, "day")} of bills, ${range}${scale}.`;
}

/** "Day 4,920 · night 3,410 · peak 610 kWh a year". */
export function annualUsageSentence(profile: UsageProfile): string {
  if (profile.bands.length === 0) return "No usage entered yet.";
  const parts = profile.bands.map((band, i) => {
    const label = BAND_LABELS[band];
    const name = i === 0 ? label : label.toLowerCase();
    return `${name} ${formatKwh(profile.annualKwh[band] ?? ZERO)}`;
  });
  return `${parts.join(" · ")} kWh a year`;
}

/** Plain-language caveats about the usage behind a comparison. */
export function usageWarnings(profile: UsageProfile): string[] {
  const warnings: string[] = [];
  if (profile.limited) {
    warnings.push(
      `Estimate (limited data): only ${plural(profile.coveredDays, "day")} of bills. Add more bill periods for a reliable comparison.`,
    );
  }
  if (profile.missingBands.length > 0) {
    const names = profile.missingBands
      .map((b) => BAND_LABELS[b].toLowerCase())
      .join(", ");
    warnings.push(
      `No ${names} usage entered, though your meter records it. Costs leave it out and may be understated.`,
    );
  }
  if (profile.overlapping) {
    warnings.push(
      "Some bill periods overlap. Usage is averaged across them, but check for a duplicate bill.",
    );
  }
  return warnings;
}
