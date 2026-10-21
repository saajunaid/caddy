import "server-only";
import { createClient } from "@/lib/supabase/server";
import { addDays, dublinDate, type IsoDate } from "@/server/domain/dates";
import { loadEventsBetween } from "@/modules/family/queries";
import { expandEvents } from "@/modules/family/server/recurrence.ts";
import {
  applicationItems,
  contractItems,
  failureItem,
  listingItems,
  sortItems,
  taskItems,
  tripItems,
  type TodayItem,
} from "./needs-you.ts";

export type WeekRow = {
  key: string;
  date: IsoDate;
  /** "18:00", or null for all-day events and dated tasks. */
  time: string | null;
  title: string;
  kind: "event" | "task";
  href: string;
};

export type SectionCounts = {
  housing: number | null;
  money: number | null;
  family: number | null;
  travel: number | null;
};

export type TodayData = {
  needsYou: TodayItem[];
  week: WeekRow[];
  weekFailed: boolean;
  counts: SectionCounts;
};

const TIME = new Intl.DateTimeFormat("en-IE", {
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
  timeZone: "Europe/Dublin",
});

type Section = { items: TodayItem[]; count: number };

async function familySection(today: IsoDate): Promise<Section> {
  const db = await createClient();
  const { data, error } = await db
    .from("tasks")
    .select("id, title, due_on")
    .eq("status", "open")
    .limit(500);
  if (error) throw new Error(error.message);
  return {
    items: taskItems(
      data.map((t) => ({ id: t.id, title: t.title, dueOn: t.due_on })),
      today,
    ),
    count: data.length,
  };
}

async function moneySection(today: IsoDate): Promise<Section> {
  const db = await createClient();
  const { data, error } = await db
    .from("utility_contracts")
    .select("id, supplier, utility_type, contract_end, status")
    .limit(100);
  if (error) throw new Error(error.message);
  return {
    items: contractItems(
      data.map((c) => ({
        id: c.id,
        supplier: c.supplier,
        utilityType: c.utility_type,
        contractEnd: c.contract_end,
        status: c.status,
      })),
      today,
    ),
    count: data.filter((c) => c.status === "active").length,
  };
}

async function travelSection(today: IsoDate): Promise<Section> {
  const db = await createClient();
  const { data, error } = await db
    .from("trips")
    .select("id, name, date_from, date_to, status")
    .in("status", ["planning", "booked"])
    .gte("date_to", today)
    .limit(100);
  if (error) throw new Error(error.message);
  return {
    items: tripItems(
      data.map((t) => ({
        id: t.id,
        name: t.name,
        dateFrom: t.date_from,
        dateTo: t.date_to,
        status: t.status,
      })),
      today,
    ),
    count: data.length,
  };
}

async function housingSection(today: IsoDate): Promise<Section> {
  const db = await createClient();
  const [listings, applications] = await Promise.all([
    db
      .from("housing_listings")
      .select("id, title, status, matches, closing_date, first_seen_at")
      .in("status", ["open", "closing_soon", "coming_soon"])
      .neq("matches", "none")
      .limit(200),
    db
      .from("housing_applications")
      .select(
        "listing_id, status, next_action, next_action_due, housing_listings(title)",
      )
      .limit(200),
  ]);
  if (listings.error) throw new Error(listings.error.message);
  if (applications.error) throw new Error(applications.error.message);
  const applied = new Set(
    applications.data
      .filter((a) => a.status !== "not_applied")
      .map((a) => a.listing_id),
  );
  const listingRows = listings.data.map((l) => ({
    id: l.id,
    title: l.title,
    status: l.status,
    matches: l.matches,
    closingDate: l.closing_date,
    firstSeenOn: dublinDate(new Date(l.first_seen_at)),
    applied: applied.has(l.id),
  }));
  const active = new Set([
    "not_applied",
    "applied",
    "lottery_entered",
    "offered",
  ]);
  return {
    items: [
      ...listingItems(listingRows, today),
      ...applicationItems(
        applications.data
          .filter((a) => active.has(a.status))
          .map((a) => ({
            listingId: a.listing_id,
            listingTitle: a.housing_listings?.title ?? "this home",
            nextAction: a.next_action,
            nextActionDue: a.next_action_due,
          })),
        today,
      ),
    ],
    count: listingRows.filter((l) => !l.applied).length,
  };
}

async function loadWeek(today: IsoDate): Promise<WeekRow[]> {
  const to = addDays(today, 6);
  const db = await createClient();
  const [events, tasks] = await Promise.all([
    loadEventsBetween(today, to, db),
    db
      .from("tasks")
      .select("id, title, due_on, due_time")
      .eq("status", "open")
      .gte("due_on", addDays(today, 3))
      .lte("due_on", to)
      .limit(200),
  ]);
  if (tasks.error) throw new Error(tasks.error.message);
  const rows: WeekRow[] = [
    ...expandEvents(events, today, to).map((o) => ({
      key: `event:${o.key}`,
      date: o.date < today ? today : o.date,
      time: o.event.allDay ? null : TIME.format(o.start),
      title: o.event.title,
      kind: "event" as const,
      href: `/family/events/${o.event.id}`,
    })),
    ...tasks.data.map((t) => ({
      key: `task:${t.id}`,
      date: t.due_on!,
      time: t.due_time ? t.due_time.slice(0, 5) : null,
      title: t.title,
      kind: "task" as const,
      href: `/family/tasks/${t.id}`,
    })),
  ];
  return rows.sort(
    (a, b) =>
      a.date.localeCompare(b.date) ||
      (a.time ?? "").localeCompare(b.time ?? "") ||
      a.title.localeCompare(b.title),
  );
}

/** Everything the Today screen shows, read as the signed-in user (RLS applies). */
export async function loadToday(now: Date): Promise<TodayData> {
  const today = dublinDate(now);
  const [housing, money, family, travel, week] = await Promise.allSettled([
    housingSection(today),
    moneySection(today),
    familySection(today),
    travelSection(today),
    loadWeek(today),
  ]);
  const items: TodayItem[] = [];
  const take = (
    result: PromiseSettledResult<Section>,
    failure: TodayItem,
  ): number | null => {
    if (result.status === "fulfilled") {
      items.push(...result.value.items);
      return result.value.count;
    }
    items.push(failure);
    return null;
  };
  const counts: SectionCounts = {
    housing: take(
      housing,
      failureItem("housing", "Cost Rental homes", "/housing"),
    ),
    money: take(
      money,
      failureItem("money", "utility contracts", "/money/utilities"),
    ),
    family: take(family, failureItem("family", "family tasks", "/family")),
    travel: take(travel, failureItem("travel", "trips", "/travel")),
  };
  return {
    needsYou: sortItems(items),
    week: week.status === "fulfilled" ? week.value : [],
    weekFailed: week.status === "rejected",
    counts,
  };
}
