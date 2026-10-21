// Ages and the ECCE start guide for children. Pure, no I/O.
import { addMonthsClamped, type IsoDate } from "./time.ts";

export const ECCE_INFO_URL =
  "https://www.gov.ie/en/publication/2459ee-early-childhood-care-and-education-programme-ecce/";

/** Whole months from `dob` to `today` (birthday-aware). */
export function ageInMonths(dob: IsoDate, today: IsoDate): number {
  const [by, bm, bd] = dob.split("-").map(Number);
  const [ty, tm, td] = today.split("-").map(Number);
  let months = (ty - by) * 12 + (tm - bm);
  if (td < bd) {
    // Born on the 31st: a short month's last day counts as the "monthiversary".
    const monthEnd = addMonthsClamped(dob, months);
    if (today < monthEnd) months -= 1;
  }
  return months;
}

/** "4 years", "1 year", "7 months", "Newborn". Null for a date in the future. */
export function ageLabel(dob: IsoDate, today: IsoDate): string | null {
  if (dob > today) return null;
  const months = ageInMonths(dob, today);
  if (months >= 24) return `${Math.floor(months / 12)} years`;
  if (months >= 12) return months >= 18 ? `${months} months` : "1 year";
  if (months >= 1) return `${months} month${months === 1 ? "" : "s"}`;
  return "Newborn";
}

export type EcceHint = {
  /** September (year) the child can first start ECCE, by the rule below. */
  startYear: number;
  status: "upcoming" | "eligible";
  label: string;
};

/**
 * A guide to when a child can start the free preschool year(s) (ECCE), not a definitive answer.
 * Rule used: a child can start in September if they are 2 years 8 months old on or before
 * 31 August that year; otherwise the following September. ECCE covers two programme years,
 * so the hint is shown until the end of the second one (30 June). Null once that's passed.
 */
export function ecceHint(dob: IsoDate, today: IsoDate): EcceHint | null {
  if (dob > today) return null;
  const qualifies = addMonthsClamped(dob, 32); // 2 years 8 months
  const year = Number(qualifies.slice(0, 4));
  const startYear = qualifies <= `${year}-08-31` ? year : year + 1;
  const start = `${startYear}-09-01`;
  const end = `${startYear + 2}-06-30`;
  if (today > end) return null;
  if (today < start) {
    return {
      startYear,
      status: "upcoming",
      label: `ECCE: eligible from Sept ${startYear}`,
    };
  }
  return {
    startYear,
    status: "eligible",
    label: `ECCE: eligible now (from Sept ${startYear})`,
  };
}

/** "JM" from "Junaid Malik"; "A" from "Ammara". */
export function initials(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return "?";
  const letters =
    words.length === 1
      ? [words[0][0]]
      : [words[0][0], words[words.length - 1][0]];
  return letters.join("").toUpperCase();
}
