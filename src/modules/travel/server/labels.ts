// Labels and option lists shared by forms, cards and jobs. Pure, no I/O.

export const BOARD_BASES = [
  "room_only",
  "self_catering",
  "breakfast",
  "half_board",
  "full_board",
  "all_inclusive",
] as const;
export type BoardBasis = (typeof BOARD_BASES)[number];
export type TripBoardBasis = BoardBasis | "any";

export const BOARD_LABELS: Record<TripBoardBasis, string> = {
  any: "Any",
  room_only: "Room only",
  self_catering: "Self-catering",
  breakfast: "Breakfast",
  half_board: "Half board",
  full_board: "Full board",
  all_inclusive: "All inclusive",
};

export const COMPONENT_KINDS = [
  "flight",
  "accommodation",
  "transfer",
  "car_hire",
  "insurance",
  "meals",
  "activities",
  "other",
] as const;
export type ComponentKind = (typeof COMPONENT_KINDS)[number];

export const KIND_LABELS: Record<ComponentKind, string> = {
  flight: "Flights",
  accommodation: "Accommodation",
  transfer: "Transfers",
  car_hire: "Car hire",
  insurance: "Insurance",
  meals: "Meals",
  activities: "Activities",
  other: "Other",
};

export const TRIP_STATUSES = ["planning", "booked", "archived"] as const;
export type TripStatus = (typeof TRIP_STATUSES)[number];

export const CANDIDATE_STATUSES = [
  "option",
  "shortlisted",
  "rejected",
  "booked",
] as const;
export type CandidateStatus = (typeof CANDIDATE_STATUSES)[number];

/** Airports offered as chips in the trip brief. Anything else is free text. */
export const IRISH_AIRPORTS = [
  { code: "DUB", name: "Dublin" },
  { code: "SNN", name: "Shannon" },
  { code: "ORK", name: "Cork" },
] as const;

/** "4h 50m" from minutes. */
export function formatDuration(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h === 0) return `${m}m`;
  return `${h}h ${String(m).padStart(2, "0")}m`;
}

const dayMonth = new Intl.DateTimeFormat("en-IE", {
  timeZone: "UTC",
  day: "numeric",
  month: "short",
});
const dayMonthYear = new Intl.DateTimeFormat("en-IE", {
  timeZone: "UTC",
  day: "numeric",
  month: "short",
  year: "numeric",
});

/** "14–22 Feb 2027", "28 Feb – 6 Mar 2027", "28 Dec 2026 – 4 Jan 2027". */
export function formatDateRange(from: string, to: string): string {
  const a = new Date(`${from}T00:00:00Z`);
  const b = new Date(`${to}T00:00:00Z`);
  const sameYear = a.getUTCFullYear() === b.getUTCFullYear();
  if (sameYear && a.getUTCMonth() === b.getUTCMonth()) {
    return `${a.getUTCDate()}–${dayMonthYear.format(b)}`;
  }
  if (sameYear) return `${dayMonth.format(a)} – ${dayMonthYear.format(b)}`;
  return `${dayMonthYear.format(a)} – ${dayMonthYear.format(b)}`;
}
