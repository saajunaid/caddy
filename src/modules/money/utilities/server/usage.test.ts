import { describe, expect, it } from "vitest";
import { decimal, round, type Exact } from "./exact";
import {
  annualUsageSentence,
  coverageSentence,
  periodDays,
  usageProfile,
  usageWarnings,
  usedBands,
  type UsagePeriod,
} from "./usage";
import type { Band } from "./types";

function period(
  periodStart: string,
  periodEnd: string,
  kwh: Partial<Record<Band, string>>,
): UsagePeriod {
  return {
    periodStart,
    periodEnd,
    kwh: Object.fromEntries(
      Object.entries(kwh).map(([band, value]) => [band, decimal(value)]),
    ) as Partial<Record<Band, Exact>>,
  };
}

describe("usageProfile", () => {
  it("returns no bands when there's no usage (never national averages)", () => {
    const profile = usageProfile([], ["day", "night", "peak"]);
    expect(profile.bands).toEqual([]);
    expect(profile.annualKwh).toEqual({});
    expect(profile.limited).toBe(false);
    expect(profile.missingBands).toEqual(["day", "night", "peak"]);
    expect(coverageSentence(profile)).toBe("No usage entered yet.");
  });

  it("counts bill periods inclusively, as printed on bills", () => {
    expect(
      periodDays({ periodStart: "2026-09-01", periodEnd: "2026-09-30" }),
    ).toBe(30);
  });

  it("keeps a full year as recorded", () => {
    const profile = usageProfile([
      period("2025-09-01", "2026-08-31", {
        day: "4920",
        night: "3410",
        peak: "610",
      }),
    ]);
    expect(profile.coveredDays).toBe(365);
    expect(round(profile.annualKwh.day!)).toBe(4920);
    expect(annualUsageSentence(profile)).toBe(
      "Day 4,920 · night 3,410 · peak 610 kWh a year",
    );
    expect(coverageSentence(profile)).toBe(
      "Based on 365 days of bills, Sept 2025–Aug 2026.",
    );
  });

  it("scales partial coverage to 365 days exactly", () => {
    const profile = usageProfile([
      period("2026-07-01", "2026-07-30", { day: "100" }),
      period("2026-08-01", "2026-08-30", { day: "200" }),
    ]);
    expect(profile.coveredDays).toBe(60);
    // 300 kWh × 365 / 60 = 1825 exactly.
    expect(profile.annualKwh.day).toEqual({ n: 1825n, d: 1n });
    expect(profile.limited).toBe(false);
    expect(coverageSentence(profile)).toBe(
      "Based on 60 days of bills, Jul 2026–Aug 2026, scaled up to a full year (seasonal differences aren't adjusted).",
    );
  });

  it("labels fewer than 60 days as limited data", () => {
    const profile = usageProfile([
      period("2026-08-01", "2026-09-28", { standard: "500" }),
    ]);
    expect(profile.coveredDays).toBe(59);
    expect(profile.limited).toBe(true);
    expect(usageWarnings(profile)[0]).toMatch(/^Estimate \(limited data\)/);
  });

  it("annualises each band over the days that band was recorded", () => {
    const profile = usageProfile([
      period("2026-01-01", "2026-01-31", { day: "310" }),
      period("2026-02-01", "2026-02-28", { day: "280", peak: "28" }),
    ]);
    expect(profile.bandDays).toEqual({ day: 59, peak: 28 });
    expect(round(profile.annualKwh.day!)).toBe(3650); // 590 × 365 / 59
    expect(round(profile.annualKwh.peak!)).toBe(365); // 28 × 365 / 28
  });

  it("flags bands the meter records but the bills don't have", () => {
    const profile = usageProfile(
      [period("2025-09-01", "2026-08-31", { day: "4000", night: "3000" })],
      ["day", "night", "peak"],
    );
    expect(profile.missingBands).toEqual(["peak"]);
    expect(usageWarnings(profile).join(" ")).toContain("No peak usage entered");
  });

  it("reports the covered date range and the 312-day example", () => {
    const profile = usageProfile([
      period("2025-09-01", "2026-02-28", { gas: "6000" }),
      period("2026-03-01", "2026-07-09", { gas: "2000" }),
    ]);
    expect(profile.coveredDays).toBe(312);
    expect(coverageSentence(profile)).toMatch(
      /^Based on 312 days of bills, Sept 2025–Jul 2026, scaled up/,
    );
  });

  it("tolerates bills sharing a meter-read day but flags real overlaps", () => {
    const shared = usageProfile([
      period("2026-01-01", "2026-01-31", { day: "1" }),
      period("2026-01-31", "2026-02-28", { day: "1" }),
    ]);
    expect(shared.overlapping).toBe(false);
    expect(shared.coveredDays).toBe(59);
    const overlap = usageProfile([
      period("2026-01-01", "2026-01-31", { day: "1" }),
      period("2026-01-15", "2026-02-28", { day: "1" }),
    ]);
    expect(overlap.overlapping).toBe(true);
    expect(usageWarnings(overlap).join(" ")).toContain("overlap");
  });

  it("only requires rates for bands with non-zero usage", () => {
    const profile = usageProfile([
      period("2026-01-01", "2026-03-31", { day: "900", peak: "0" }),
    ]);
    expect(profile.bands).toEqual(["day", "peak"]);
    expect(usedBands(profile)).toEqual(["day"]);
  });
});
