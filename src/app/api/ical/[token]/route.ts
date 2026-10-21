import type { NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { toEvent } from "@/modules/family/queries";
import { generateICalendar } from "@/modules/family/server/ical.ts";
import {
  hashFeedToken,
  parseFeedToken,
  shouldTouchLastUsed,
} from "@/modules/family/server/ical-token.ts";
import { expandEvents } from "@/modules/family/server/recurrence.ts";
import {
  addDays,
  dublinDate,
  zonedInstant,
} from "@/modules/family/server/time.ts";

export const dynamic = "force-dynamic";

const PAST_DAYS = 30;
const FUTURE_DAYS = 365;

function notFound() {
  return new Response("Not found", {
    status: 404,
    headers: {
      "content-type": "text/plain; charset=utf-8",
      "cache-control": "no-store",
    },
  });
}

/**
 * Private calendar feed (public URL, secret token). The proxy doesn't run on /api/*, so this
 * handler authenticates by looking up the token's hash; the household comes only from that row.
 */
export async function GET(
  _request: NextRequest,
  ctx: RouteContext<"/api/ical/[token]">,
) {
  const token = parseFeedToken((await ctx.params).token);
  if (!token) return notFound();

  const admin = createAdminClient();
  const found = await admin
    .from("ical_tokens")
    .select("id, household_id, last_used_at")
    .eq("token_hash", hashFeedToken(token))
    .is("revoked_at", null)
    .maybeSingle();
  if (found.error) {
    return new Response("Feed temporarily unavailable", {
      status: 503,
      headers: { "retry-after": "600", "cache-control": "no-store" },
    });
  }
  if (!found.data) return notFound();
  const householdId = found.data.household_id;

  const now = new Date();
  const today = dublinDate(now);
  const from = addDays(today, -PAST_DAYS);
  const to = addDays(today, FUTURE_DAYS);
  const [events, tasks] = await Promise.all([
    admin
      .from("events")
      .select(
        "id, title, starts_at, ends_at, all_day, start_date, end_date, location, notes, member_ids, recurrence, related_url, updated_at",
      )
      .eq("household_id", householdId)
      .lt("starts_at", zonedInstant(addDays(to, 1)).toISOString())
      .or(
        `recurrence.neq.none,starts_at.gte.${zonedInstant(addDays(from, -60)).toISOString()}`,
      )
      .limit(5000),
    admin
      .from("tasks")
      .select("id, title, notes, due_on, due_time, related_url, updated_at")
      .eq("household_id", householdId)
      .eq("status", "open")
      .not("due_on", "is", null)
      .gte("due_on", from)
      .lte("due_on", to)
      .limit(5000),
  ]);
  if (events.error || tasks.error) {
    return new Response("Feed temporarily unavailable", {
      status: 503,
      headers: { "retry-after": "600", "cache-control": "no-store" },
    });
  }

  // Repeats are expanded into single events with UTC times, so they stay at the right
  // local time across clock changes without needing a VTIMEZONE.
  const occurrences = expandEvents(events.data.map(toEvent), from, to);
  const timed = occurrences
    .filter((o) => !o.event.allDay)
    .map((o) => ({
      uid: `event-${o.event.id}-${o.date.replace(/-/g, "")}`,
      title: o.event.title,
      start: o.start,
      end: o.end,
      location: o.event.location,
      description: o.event.notes,
      url: o.event.relatedUrl,
      updatedAt: o.event.updatedAt,
    }));
  const allDay = occurrences
    .filter((o) => o.event.allDay)
    .map((o) => ({
      uid: `event-${o.event.id}-${o.date.replace(/-/g, "")}`,
      title: o.event.title,
      date: o.date,
      lastDate: o.lastDate,
      location: o.event.location,
      description: o.event.notes,
      url: o.event.relatedUrl,
      updatedAt: o.event.updatedAt,
    }));
  const body = generateICalendar({
    now,
    timed,
    allDay,
    tasks: tasks.data.flatMap((t) =>
      t.due_on
        ? [
            {
              id: t.id,
              title: t.title,
              dueOn: t.due_on,
              dueTime: t.due_time,
              notes: t.notes,
              url: t.related_url,
              updatedAt: new Date(t.updated_at),
            },
          ]
        : [],
    ),
  });

  const lastUsed = found.data.last_used_at
    ? new Date(found.data.last_used_at)
    : null;
  if (shouldTouchLastUsed(lastUsed, now)) {
    // Best effort: a failed timestamp update must never break the feed.
    await admin
      .from("ical_tokens")
      .update({ last_used_at: now.toISOString() })
      .eq("id", found.data.id)
      .then(
        () => undefined,
        () => undefined,
      );
  }

  return new Response(body, {
    status: 200,
    headers: {
      "content-type": "text/calendar; charset=utf-8",
      "content-disposition": 'inline; filename="caddy.ics"',
      "cache-control": "private, max-age=900",
      "x-robots-tag": "noindex",
    },
  });
}
