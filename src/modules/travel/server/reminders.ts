// Which trips need a "recheck prices" reminder this week. Pure, no I/O.
// A reminder is never presented as live data: it says when the family last checked.
import {
  daysBetween,
  dublinDate,
  type IsoDate,
} from "../../../server/domain/dates.ts";
import { formatShortDate } from "./currency.ts";

/** ISO 8601 week of a date, e.g. "2026-W43". */
export function isoWeek(date: IsoDate): string {
  const [y, m, d] = date.split("-").map(Number);
  const day = new Date(Date.UTC(y, m - 1, d));
  const weekday = day.getUTCDay() || 7; // Monday 1 … Sunday 7
  // The Thursday of this week decides the ISO year.
  day.setUTCDate(day.getUTCDate() + 4 - weekday);
  const year = day.getUTCFullYear();
  const jan1 = Date.UTC(year, 0, 1);
  const week = Math.ceil(((day.getTime() - jan1) / 86_400_000 + 1) / 7);
  return `${year}-W${String(week).padStart(2, "0")}`;
}

export const WINDOW_SOON_DAYS = 60;
export const STALE_PRICE_DAYS = 7;

export type ReminderTrip = {
  id: string;
  householdId: string;
  name: string;
  status: string;
  dateFrom: IsoDate;
  dateTo: IsoDate;
};
export type ReminderCandidate = { id: string; tripId: string; status: string };
export type ReminderComponent = { candidateId: string; checkedAt: string };

export type Reminder = {
  householdId: string;
  tripId: string;
  title: string;
  body: string;
  dedupeKey: string;
  severity: "info" | "warning";
};

export function planReminders(input: {
  today: IsoDate;
  trips: readonly ReminderTrip[];
  candidates: readonly ReminderCandidate[];
  components: readonly ReminderComponent[];
}): Reminder[] {
  const week = isoWeek(input.today);
  const reminders: Reminder[] = [];
  for (const trip of input.trips) {
    if (trip.status !== "planning" || trip.dateTo < input.today) continue;
    const candidates = input.candidates.filter(
      (c) => c.tripId === trip.id && c.status !== "rejected",
    );
    const shortlisted = candidates.filter((c) => c.status === "shortlisted");
    const checkedOf = (ids: Set<string>) =>
      input.components
        .filter((c) => ids.has(c.candidateId))
        .map((c) => dublinDate(new Date(c.checkedAt)))
        .sort();
    const shortlistChecks = checkedOf(new Set(shortlisted.map((c) => c.id)));
    const allChecks = checkedOf(new Set(candidates.map((c) => c.id)));

    const startsIn = daysBetween(input.today, trip.dateFrom);
    const windowSoon = startsIn >= 0 && startsIn <= WINDOW_SOON_DAYS;
    const staleShortlist =
      shortlistChecks.length > 0 &&
      daysBetween(shortlistChecks[0], input.today) > STALE_PRICE_DAYS;
    if (!windowSoon && !staleShortlist) continue;

    // The shortlist matters most; otherwise the oldest price on any open option.
    const oldest = (
      shortlistChecks.length > 0 ? shortlistChecks : allChecks
    )[0];
    const title = oldest
      ? `Prices for ${trip.name} were last checked ${formatShortDate(oldest)}: recheck before booking`
      : `${trip.name} has no prices yet: add the options you find`;
    const parts: string[] = [];
    if (startsIn > 0)
      parts.push(
        `The trip window starts in ${startsIn} days (${formatShortDate(trip.dateFrom)}).`,
      );
    else if (startsIn === 0) parts.push("The trip window starts today.");
    else
      parts.push(
        `The trip window is open until ${formatShortDate(trip.dateTo)}.`,
      );
    parts.push(
      `${candidates.length} option${candidates.length === 1 ? "" : "s"}, ${shortlisted.length} shortlisted.`,
    );
    parts.push(
      "Caddy doesn't check prices itself; open each booking link to recheck.",
    );
    reminders.push({
      householdId: trip.householdId,
      tripId: trip.id,
      title,
      body: parts.join(" "),
      dedupeKey: `travel-weekly:${trip.id}:${week}`,
      severity: staleShortlist ? "warning" : "info",
    });
  }
  return reminders;
}
