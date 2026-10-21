// What the Today screen asks the household to look at. Pure: no I/O, unit-tested.
// Each module contributes plain rows; this file decides tone, wording and order.
import {
  addDays,
  daysBetween,
  type IsoDate,
} from "../../server/domain/dates.ts";
import { dueState } from "../money/utilities/server/due.ts";
import { UTILITY_TYPE_LABELS } from "../money/utilities/server/types.ts";

export type TodayTone = "bad" | "due" | "review" | "info" | "ok";

export type TodayItem = {
  key: string;
  module: "family" | "money" | "travel" | "housing" | "inbox";
  tone: TodayTone;
  /** Short status label shown in the chip, e.g. "Overdue". */
  label: string;
  title: string;
  detail: string;
  href: string;
  /** Lower sorts first: overdue and failures, then due soon, then the rest. */
  rank: number;
};

const TONE_RANK: Record<TodayTone, number> = {
  bad: 0,
  due: 1,
  review: 2,
  info: 3,
  ok: 4,
};

/** "Thu 23 Oct" for a date-only value. */
export function shortDay(date: IsoDate): string {
  const d = new Date(`${date}T00:00:00Z`);
  const part = (o: Intl.DateTimeFormatOptions) =>
    new Intl.DateTimeFormat("en-IE", { ...o, timeZone: "UTC" }).format(d);
  return `${part({ weekday: "short" })} ${d.getUTCDate()} ${part({ month: "short" })}`;
}

function inDays(days: number): string {
  if (days === 0) return "today";
  if (days === 1) return "tomorrow";
  return `in ${days} days`;
}

export type TaskInput = {
  id: string;
  title: string;
  dueOn: IsoDate | null;
};

/** Open tasks that are overdue or due within the next two days. */
export function taskItems(
  tasks: readonly TaskInput[],
  today: IsoDate,
): TodayItem[] {
  const out: TodayItem[] = [];
  for (const task of tasks) {
    if (!task.dueOn) continue;
    const days = daysBetween(today, task.dueOn);
    if (days < 0) {
      out.push({
        key: `task:${task.id}`,
        module: "family",
        tone: "bad",
        label: "Overdue",
        title: task.title,
        detail: `Was due ${shortDay(task.dueOn)}`,
        href: `/family/tasks/${task.id}`,
        rank: days,
      });
    } else if (days <= 2) {
      out.push({
        key: `task:${task.id}`,
        module: "family",
        tone: "due",
        label: days === 0 ? "Due today" : "Due soon",
        title: task.title,
        detail: `Due ${inDays(days)} · ${shortDay(task.dueOn)}`,
        href: `/family/tasks/${task.id}`,
        rank: days,
      });
    }
  }
  return out;
}

export type ContractInput = {
  id: string;
  supplier: string;
  utilityType: string;
  contractEnd: IsoDate | null;
  status: string;
};

/** Utility contracts in their 14-day comparison window, just ended, or missing an end date. */
export function contractItems(
  contracts: readonly ContractInput[],
  today: IsoDate,
): TodayItem[] {
  const out: TodayItem[] = [];
  for (const c of contracts) {
    if (c.status !== "active") continue;
    const what = `${c.supplier} ${(
      UTILITY_TYPE_LABELS[c.utilityType as keyof typeof UTILITY_TYPE_LABELS] ??
      c.utilityType
    ).toLowerCase()}`;
    const href = `/money/utilities/${c.id}`;
    const state = dueState(c.contractEnd, today);
    switch (state.kind) {
      case "unknown_end":
        out.push({
          key: `contract:${c.id}`,
          module: "money",
          tone: "review",
          label: "Needs a date",
          title: `Add the contract end date for ${what}`,
          detail: "Caddy can't remind you to compare prices without it",
          href,
          rank: 0,
        });
        break;
      case "due":
      case "late":
        out.push({
          key: `contract:${c.id}`,
          module: "money",
          tone: "due",
          label: "Compare now",
          title: `Compare ${what} prices`,
          detail: `Contract ends ${shortDay(state.end)} (${inDays(state.daysUntilEnd)})`,
          href,
          rank: state.daysUntilEnd,
        });
        break;
      case "ended":
        if (state.daysSinceEnd <= 30) {
          out.push({
            key: `contract:${c.id}`,
            module: "money",
            tone: "bad",
            label: "Ended",
            title: `${what} contract has ended`,
            detail: `Ended ${shortDay(state.end)}: check what you're paying now`,
            href,
            rank: -state.daysSinceEnd,
          });
        }
        break;
      case "not_due":
        break;
    }
  }
  return out;
}

export type TripInput = {
  id: string;
  name: string;
  dateFrom: IsoDate;
  dateTo: IsoDate;
  status: string;
};

/** Booked trips starting within 30 days; trips still being planned whose window opens within 60. */
export function tripItems(
  trips: readonly TripInput[],
  today: IsoDate,
): TodayItem[] {
  const out: TodayItem[] = [];
  for (const t of trips) {
    const days = daysBetween(today, t.dateFrom);
    if (t.dateTo < today) continue;
    if (t.status === "booked" && days <= 30) {
      out.push({
        key: `trip:${t.id}`,
        module: "travel",
        tone: "info",
        label: days <= 0 ? "Travelling" : "Coming up",
        title: t.name,
        detail:
          days <= 0
            ? `Back ${shortDay(t.dateTo)}`
            : `Leaves ${inDays(days)} · ${shortDay(t.dateFrom)}`,
        href: `/travel/${t.id}`,
        rank: days,
      });
    } else if (t.status === "planning" && days <= 60) {
      out.push({
        key: `trip:${t.id}`,
        module: "travel",
        tone: days <= 21 ? "due" : "info",
        label: "Not booked",
        title: `Book ${t.name}`,
        detail:
          days <= 0
            ? "The travel window has started"
            : `Travel window opens ${inDays(days)} · ${shortDay(t.dateFrom)}`,
        href: `/travel/${t.id}`,
        rank: days,
      });
    }
  }
  return out;
}

/** A section whose data couldn't be loaded. Shown, never hidden as "nothing to do". */
export function failureItem(
  module: TodayItem["module"],
  what: string,
  href: string,
): TodayItem {
  return {
    key: `failed:${module}:${what}`,
    module,
    tone: "bad",
    label: "Couldn't load",
    title: `Couldn't load ${what}`,
    detail: "Try again in a moment. Nothing here means it failed, not that it's clear.",
    href,
    rank: -1_000_000,
  };
}

/** Most urgent first; ties keep module order stable. */
export function sortItems(items: readonly TodayItem[]): TodayItem[] {
  return [...items].sort(
    (a, b) =>
      TONE_RANK[a.tone] - TONE_RANK[b.tone] ||
      a.rank - b.rank ||
      a.title.localeCompare(b.title),
  );
}

/** The 7 local dates starting today, for the "This week" list. */
export function weekDates(today: IsoDate): IsoDate[] {
  return Array.from({ length: 7 }, (_, i) => addDays(today, i));
}

export type ListingInput = {
  id: string;
  title: string;
  status: string;
  matches: string;
  closingDate: IsoDate | null;
  /** Local date the listing was first seen. */
  firstSeenOn: IsoDate;
  /** True once the household has an application past "not applied". */
  applied: boolean;
};

/** Matching Cost Rental homes the household hasn't applied for yet. */
export function listingItems(
  listings: readonly ListingInput[],
  today: IsoDate,
): TodayItem[] {
  const out: TodayItem[] = [];
  for (const l of listings) {
    if (l.applied || l.matches === "none") continue;
    if (!["open", "closing_soon", "coming_soon"].includes(l.status)) continue;
    const fit = l.matches === "match" ? "Matches your brief" : "Possible match";
    const href = `/housing/${l.id}`;
    const base = { key: `listing:${l.id}`, module: "housing" as const, href };
    if (l.status === "coming_soon") {
      out.push({
        ...base,
        tone: "info",
        label: "Opens soon",
        title: l.title,
        detail: `${fit} · applications not open yet`,
        rank: 0,
      });
      continue;
    }
    const days = l.closingDate ? daysBetween(today, l.closingDate) : null;
    if (days !== null && days >= 0 && days <= 7) {
      out.push({
        ...base,
        tone: "due",
        label: days === 0 ? "Closes today" : "Closing soon",
        title: l.title,
        detail: `${fit} · closes ${inDays(days)}, ${shortDay(l.closingDate!)}`,
        rank: days,
      });
    } else {
      const isNew = daysBetween(l.firstSeenOn, today) <= 3;
      out.push({
        ...base,
        tone: "ok",
        label: isNew ? "New" : "Open",
        title: l.title,
        detail: l.closingDate
          ? `${fit} · closes ${shortDay(l.closingDate)}`
          : `${fit} · closing date not stated`,
        rank: isNew ? 0 : 1,
      });
    }
  }
  return out;
}

export type ApplicationInput = {
  listingId: string;
  listingTitle: string;
  nextAction: string | null;
  nextActionDue: IsoDate | null;
};

/** Application follow-ups that are overdue or due within three days. */
export function applicationItems(
  applications: readonly ApplicationInput[],
  today: IsoDate,
): TodayItem[] {
  const out: TodayItem[] = [];
  for (const a of applications) {
    if (!a.nextActionDue) continue;
    const days = daysBetween(today, a.nextActionDue);
    if (days > 3) continue;
    out.push({
      key: `application:${a.listingId}`,
      module: "housing",
      tone: days < 0 ? "bad" : "due",
      label: days < 0 ? "Overdue" : "Follow up",
      title: a.nextAction?.trim() || `Follow up on ${a.listingTitle}`,
      detail: `${a.listingTitle} · ${days < 0 ? "was due" : "due"} ${shortDay(a.nextActionDue)}`,
      href: `/housing/${a.listingId}?tab=application`,
      rank: days,
    });
  }
  return out;
}
