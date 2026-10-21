# Family & education (R4)

The shared family week, tasks, lists, children's profiles, a private calendar feed for Apple/Google Calendar, Share to WhatsApp, and a school places planner. Implements PLAN.md §7.4 and D7.

## Screens

| Path | What it does |
|---|---|
| `/family` | "Week of …" header, previous/next week (`?week=YYYY-MM-DD`, any date in the week), 7-column week on desktop and stacked days on phones, today outlined in purple. Events and due tasks with meaning-coloured stripes; clash warnings in orange. Add menu (event or task). Cards: Tasks (open tasks by due date, initials, tick to complete, overdue in red, quick add, Share), Shopping list (tick, add, clear ticked, Share to WhatsApp), School places summary, People (adults and children, ages, ECCE guide, add a child), Calendar feed. |
| `/family/tasks`, `/family/tasks/new`, `/family/tasks/[id]` | All open tasks grouped Overdue / Today / Next 7 days / Later / No date; recently done; full create/edit/delete; Share to WhatsApp. |
| `/family/events/new`, `/family/events/[id]` | Create/edit/delete events (timed or all-day, who's involved, repeats, where, link, notes); Share to WhatsApp. |
| `/family/lists`, `/family/lists/[id]` | All lists, create, rename/delete, items with remove buttons. |
| `/family/people/[id]` | Edit a child's name and date of birth, or remove them. Adults who sign in are renamed in Settings; only their date of birth can be set here. |
| `/family/schools` (+ `new`, `[id]`, `applications/new`, `applications/[id]`) | Education planner: applications per child (preference order, status, deadline, open day, decision date) and tracked schools grouped by level with admissions policy link and "checked on" date. Shows: "Being close to a school doesn't guarantee a place; check each school's admissions policy." |

Every screen has empty states, `/family` has `loading.tsx` and `error.tsx` (with an offline message). Layouts were checked at 390 px and 1280 px in light and dark with no horizontal overflow.

## Data

Migration `supabase/migrations/20261021400000_family.sql`: `tasks`, `events`, `lists`, `list_items`, `schools`, `school_applications`, `ical_tokens`. RLS on every table scoped to `current_household_id()`. People are the existing `household_members` rows (children have `relationship = 'child'`).

- Assignees, children, schools and list items use composite foreign keys `(household_id, …)` so a row can never point into another household. `events.member_ids` (an array) is checked by a trigger for the same rule.
- Timed events store UTC `starts_at`/`ends_at`. All-day events store `start_date`/`end_date` (inclusive) and set `starts_at` to Dublin midnight so one range query covers both.
- `tasks.recurrence_anchor_on` (an addition to the brief) keeps the first due date of a series, so "the 31st of every month" returns to the 31st after February.
- `ical_tokens` stores only `token_hash` (SHA-256 hex). Signed-in users can insert a hash and revoke, but have no SELECT on `token_hash` (column privileges), so they can't read or filter on it for any household. Only the feed endpoint (service role) looks hashes up.

## Recurrence rules

Pure code in `src/modules/family/server/recurrence.ts`, unit-tested.

- **Completing a repeating task** marks it done and creates the next one. The next due date is the first date in the series strictly after both the old due date and today: finishing early doesn't skip an occurrence; finishing late skips the missed ones instead of piling them up.
- Daily/weekly: every N days/weeks. Monthly: every N months from the anchor date, clamped to the month end (31 Jan → 28 Feb → 31 Mar). Yearly: 29 Feb falls on 28 Feb in other years and returns to 29 Feb in leap years.
- Only the request that actually flips a task from open to done creates the next one, so a double tap can't create two.
- **Events** repeat weekly or yearly. Repeats keep their Irish wall-clock time across the clock changes (17:30 stays 17:30 in October and March). Editing a repeating event changes every repeat.

## Clashes

Timed events that overlap and share a person clash. An event with nobody ticked counts as involving everyone. An event without an end time is assumed to last an hour for clash checks only (the calendar feed leaves its end out). All-day events never clash. Each clashing event shows "Clashes with Dentist 18:15".

## Calendar feed (iCal)

`GET /api/ical/<token>.ics` (the `.ics` suffix is optional). Public route: the proxy doesn't run on `/api/*`, so the handler hashes the token and looks up a non-revoked row with the admin client; the household comes only from that row. Unknown or revoked tokens get 404.

- Contents: events from 30 days ago to 365 days ahead (repeats expanded into single events with UTC times and stable per-occurrence UIDs, so no VTIMEZONE is needed and clock changes are handled), and open tasks with a due date as all-day "Due: …" events marked free.
- `text/calendar; charset=utf-8`, `Cache-Control: private, max-age=900`. `last_used_at` updates at most hourly.
- Generator (`server/ical.ts`): VCALENDAR with PRODID and `X-WR-CALNAME:Caddy`, DTSTAMP, TEXT escaping (backslash, `;`, `,`, newlines), CRLF line endings and 75-octet folding that never splits a UTF-8 character.

**Subscribing** (shown on the Family page): create a feed and copy the link; it's shown once.

- iPhone: tap "Open in Calendar" (webcal link), or Settings → Calendar → Accounts → Add Account → Other → Add Subscribed Calendar, paste, Next, Save.
- Google Calendar (on a computer): Other calendars → + → From URL, paste the https link. Google refreshes subscribed calendars slowly (up to about a day), so it isn't real-time.
- Revoke a feed any time; calendars using it stop updating. Creating and revoking feeds is recorded in `audit_events`.

## Share to WhatsApp

`https://wa.me/?text=` + `encodeURIComponent(text)` with plain bullet text: lists (unticked items only), a task, all open tasks, an event. It opens WhatsApp so you pick the chat; Caddy never sends anything itself.

## Reminders job

`family-reminders` (group `daily`, idempotency key `family-reminders:<Dublin date>`), registered in `src/server/jobs/registry.ts`. Per household it creates notifications for:

- open tasks due today or overdue: one per task per due date (`family:task:<id>:<due_on>`), so an overdue task alerts once, not daily;
- today's events: one summary (`family:events:<date>`);
- school application deadlines within 7 days while the status is still "researching" (`family:school-deadline:<application id>:<deadline>`);
- open days tomorrow (`family:open-day:<school id>:<date>`).

It records one source check per household, so a failed query is "failed", never "0 reminders". It only reads family tables and only writes notifications (covered by a test).

## For other modules

```ts
import { createTaskFromAction } from "@/modules/family/actions";
const taskId = await createTaskFromAction({
  title: "Apply for Millrace Court",
  dueOn: "2026-10-30",
  relatedEntityType: "housing_listing",
  relatedEntityId: listingId,
  relatedUrl: "https://newstarterhomes.ie/rent/…",
});
```

Validated with zod; throws on invalid input or if the user has no household. The task shows "From housing_listing" and the link.

## Children and ECCE

Ages show as "4 years" (or months under 2). For children, the People card shows a guide such as "ECCE: eligible from Sept 2027", based on the rule that a child can start ECCE in September if they're 2 years 8 months by 31 August, otherwise the following September. It's labelled as a guide with a link to gov.ie and isn't shown after the two ECCE years.

## Deliberately not done

- **Two-way Google Calendar sync.** Google OAuth apps in Testing mode issue refresh tokens that expire after 7 days, so sync would silently break weekly. The one-way iCal feed works with both Apple and Google with no accounts.
- **A WhatsApp bot.** Meta's WhatsApp Business API isn't built for personal family groups. Share links hand text to WhatsApp instead.
- Editing a single occurrence of a repeating event (changes apply to the whole series).
- Chores as a separate type: use repeating tasks with an assignee.
- Reusing Housing's `places` for schools (PLAN §7.4): `places` doesn't exist yet. Schools have optional latitude/longitude so they can be linked later.
- The Today screen's "This week" section (PR-12).
